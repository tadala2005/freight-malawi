#!/usr/bin/env node
// ============================================================================
// Freight Malawi - simulator device provisioning (safe + verifying)
//
// Makes the vehicles table (the same Supabase database Render uses) accept the
// simulator devices listed in simulator/config.json.
//
// KEYS ARE GENERATED AUTOMATICALLY. Each device key is derived from the device
// ID and one secret (DEVICE_KEY_SECRET):
//     key = HMAC-SHA256(DEVICE_KEY_SECRET, "freight-malawi/device-key/v1/<deviceId>")
// This script stores only the bcrypt hash of that key. The simulator derives the
// identical key itself from the same secret, so nobody types device keys.
// If DEVICE_KEY_SECRET is missing, --apply creates one and saves it in backend/.env.
//
// DEFAULT IS READ-ONLY. Nothing is written unless you pass --apply.
//
//   node scripts/provisionSimulatorDevices.js                 report only
//   node scripts/provisionSimulatorDevices.js --apply         write key hashes
//
// Options
//   --apply               write changes to the database
//   --create-missing      (with --apply) insert vehicles that do not exist ...
//   --owner <user>        ... owned by this dashboard username or email
//   --adopt-by-plate      (with --apply) set device_id on a vehicle that has the
//                         right plate but a blank/differently-cased device_id
//   --expect-ref <text>   abort unless this text appears in the DB host/user
//                         (use the Supabase project ref from Render's DATABASE_URL)
//   --backend-url <url>   backend to verify against (default: BACKEND_URL env,
//                         then simulator/config.json backendUrl)
//   --skip-live-check     do not verify against the running backend
//   --allow-local         permit a localhost / MySQL target (development only)
//
// Exit codes: 0 = every device is ready and verified, 1 = fatal / bad setup,
//             2 = at least one device is not ready (or not verified).
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '..', '.env');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'simulator', 'config.json');
const BCRYPT_ROUNDS = 10; // same as models/vehicleModel.js
const MIN_SECRET_LENGTH = 32;

// --- helpers ----------------------------------------------------------------

/** Must stay identical to deriveDeviceKey() in simulator/simulate.js. */
function deriveDeviceKey(secret, deviceId) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(`freight-malawi/device-key/v1/${deviceId}`)
    .digest('base64url');
}

class Fatal extends Error {
  constructor(message, hints = []) {
    super(message);
    this.hints = hints;
  }
}

const out = (s = '') => console.log(s);
const normPlate = (p) => String(p || '').replace(/\s+/g, '').toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = {
    apply: false, createMissing: false, owner: null, adoptByPlate: false,
    expectRef: null, backendUrl: null, skipLive: false, allowLocal: false, help: false,
  };
  const valueFlags = { '--owner': 'owner', '--expect-ref': 'expectRef', '--backend-url': 'backendUrl' };
  const boolFlags = {
    '--apply': 'apply', '--create-missing': 'createMissing', '--adopt-by-plate': 'adoptByPlate',
    '--skip-live-check': 'skipLive', '--allow-local': 'allowLocal', '--help': 'help', '-h': 'help',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    if (boolFlags[flag]) opts[boolFlags[flag]] = true;
    else if (valueFlags[flag]) {
      const value = inline !== undefined ? inline : argv[++i];
      if (!value || value.startsWith('--')) throw new Fatal(`${flag} needs a value.`);
      opts[valueFlags[flag]] = value;
    } else throw new Fatal(`Unknown option: ${argv[i]}`, ['Run with --help to see the options.']);
  }
  if (opts.createMissing && !opts.owner) throw new Fatal('--create-missing requires --owner <dashboard username or email>.');
  if ((opts.createMissing || opts.adoptByPlate) && !opts.apply) {
    throw new Fatal('--create-missing / --adopt-by-plate only take effect together with --apply.');
  }
  return opts;
}

// --- environment + database target -----------------------------------------

function loadEnvSafely() {
  const dotenv = require('dotenv');
  const fileEnv = fs.existsSync(ENV_PATH) ? dotenv.parse(fs.readFileSync(ENV_PATH)) : {};
  // dotenv never overrides variables already present in the shell. A stale
  // $env:DATABASE_URL in PowerShell would therefore silently beat backend/.env,
  // which is exactly how a script ends up writing to the wrong database.
  for (const key of ['DATABASE_URL', 'DB_CLIENT', 'DATABASE_SSL', 'DEVICE_KEY_SECRET']) {
    const shell = process.env[key];
    if (shell !== undefined && fileEnv[key] !== undefined && shell !== fileEnv[key]) {
      throw new Fatal(`${key} is set in your shell AND in backend/.env with different values.`, [
        'The shell value would silently win. Clear it in PowerShell:',
        `    Remove-Item Env:${key}`,
        'then run this script again.',
      ]);
    }
  }
  dotenv.config({ path: ENV_PATH });
  return fileEnv;
}

function describeDatabaseTarget(opts) {
  const client = String(process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'postgres' : 'mysql')).toLowerCase();
  if (!['postgres', 'postgresql'].includes(client) && !opts.allowLocal) {
    throw new Fatal(`DB_CLIENT resolves to "${client}", but production uses Supabase PostgreSQL.`, [
      'Set DB_CLIENT=postgres and DATABASE_URL=<same value as on Render> in backend/.env.',
      'Use --allow-local only if you really mean to provision a local development database.',
    ]);
  }
  if (!['postgres', 'postgresql'].includes(client)) { // --allow-local with MySQL/XAMPP
    return {
      client, host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || '3306',
      user: process.env.DB_USER || 'root', dbName: process.env.DB_NAME || 'freight_malawi', ref: null, isLocal: true,
    };
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Fatal('DATABASE_URL is not set.', [
      `Expected it in ${ENV_PATH}`,
      'Copy the exact DATABASE_URL value from the Render backend service > Environment.',
    ]);
  }
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    throw new Fatal('DATABASE_URL is not a valid URL.', ['If the password contains @ : / # ? % characters it must be URL-encoded.']);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const user = decodeURIComponent(url.username || '');
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(default)';
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());
  if (isLocal && !opts.allowLocal) {
    throw new Fatal(`DATABASE_URL points at ${host} (this machine), not at Supabase.`, [
      'Production data lives in Supabase. Use the same DATABASE_URL as the Render backend,',
      'or pass --allow-local if you deliberately want the local database.',
    ]);
  }
  if (!isLocal && String(process.env.DATABASE_SSL || 'false').toLowerCase() !== 'true') {
    throw new Fatal('DATABASE_SSL is not "true" for a remote database.', ['Render uses DATABASE_SSL=true. Set the same in backend/.env.']);
  }
  let ref = null;
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(host);
  const pooled = /^postgres\.([a-z0-9]+)$/i.exec(user);
  if (direct) ref = direct[1]; else if (pooled) ref = pooled[1];
  if (opts.expectRef && !`${host} ${user}`.toLowerCase().includes(opts.expectRef.toLowerCase())) {
    throw new Fatal(`--expect-ref "${opts.expectRef}" does not appear in this DATABASE_URL (host ${host}, user ${user}).`, [
      'You are pointed at a different database than you expected. Nothing was changed.',
    ]);
  }
  return { client, host, port: url.port || '5432', user, dbName, ref, isLocal };
}

function ensureSecret(opts, summary) {
  let secret = String(process.env.DEVICE_KEY_SECRET || '').trim();
  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Fatal(`DEVICE_KEY_SECRET is too short (${secret.length} characters; need at least ${MIN_SECRET_LENGTH}).`);
    }
    return secret;
  }
  if (!opts.apply) {
    summary.secretMissing = true;
    return null;
  }
  secret = crypto.randomBytes(32).toString('base64url');
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const emptyLine = /^[ \t]*DEVICE_KEY_SECRET[ \t]*=[ \t]*$/m;
  if (emptyLine.test(existing)) {
    fs.writeFileSync(ENV_PATH, existing.replace(emptyLine, `DEVICE_KEY_SECRET=${secret}`));
  } else {
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(ENV_PATH, `${prefix}DEVICE_KEY_SECRET=${secret}\n`);
  }
  process.env.DEVICE_KEY_SECRET = secret;
  summary.secretGenerated = secret;
  return secret;
}

// --- per-device evaluation / repair ----------------------------------------

async function safeCompare(bcrypt, plain, hash) {
  try { return await bcrypt.compare(String(plain), String(hash)); } catch (e) { return false; }
}

async function evaluate(pool, bcrypt, sim, key) {
  const r = { sim, state: null, vehicle: null, near: [], notes: [], actions: [], live: null };
  const [exact] = await pool.execute(
    'SELECT id, user_id, license_plate, device_id, device_key_hash FROM vehicles WHERE device_id = ? LIMIT 1',
    [sim.deviceId],
  );
  if (exact.length) {
    r.vehicle = exact[0];
    if (normPlate(r.vehicle.license_plate) !== normPlate(sim.licensePlate)) {
      r.notes.push(`plate in database is "${r.vehicle.license_plate}", simulator config says "${sim.licensePlate}" (informational)`);
    }
    if (!key) r.state = 'NEEDS_SECRET'; // check mode and DEVICE_KEY_SECRET does not exist yet
    else if (!r.vehicle.device_key_hash) r.state = 'KEY_NOT_SET';
    else if (await safeCompare(bcrypt, key, r.vehicle.device_key_hash)) r.state = 'READY';
    else {
      r.state = 'KEY_STALE';
      if (sim.deviceKey && await safeCompare(bcrypt, sim.deviceKey, r.vehicle.device_key_hash)) {
        r.notes.push('stored hash matches the OLD demo key from simulator/config.json');
      }
    }
    return r;
  }
  const [near] = await pool.execute(
    `SELECT id, user_id, license_plate, device_id FROM vehicles
     WHERE LOWER(TRIM(COALESCE(device_id, ''))) = LOWER(?)
        OR UPPER(REPLACE(license_plate, ' ', '')) = ?`,
    [sim.deviceId, normPlate(sim.licensePlate)],
  );
  r.near = near;
  r.state = !near.length ? 'MISSING' : near.length > 1 ? 'AMBIGUOUS' : 'DEVICE_ID_MISMATCH';
  return r;
}

async function repair(pool, bcrypt, r, key, opts, owner) {
  const { sim } = r;
  const hash = async () => bcrypt.hash(key, BCRYPT_ROUNDS);

  if (r.state === 'KEY_NOT_SET' || r.state === 'KEY_STALE') {
    const [res] = await pool.execute('UPDATE vehicles SET device_key_hash = ? WHERE id = ?', [await hash(), r.vehicle.id]);
    if (res.affectedRows !== 1) throw new Error(`UPDATE touched ${res.affectedRows} rows (expected 1).`);
    r.actions.push('wrote new key hash');
  } else if (r.state === 'DEVICE_ID_MISMATCH' && opts.adoptByPlate) {
    const row = r.near[0];
    const current = String(row.device_id || '').trim();
    const blank = current === '';
    const sameIgnoringCase = current.toLowerCase() === sim.deviceId.toLowerCase();
    if (!(blank || sameIgnoringCase)) {
      r.notes.push(`vehicle #${row.id} already has device_id "${row.device_id}" - NOT changed automatically`);
      return;
    }
    const [res] = await pool.execute('UPDATE vehicles SET device_id = ?, device_key_hash = ? WHERE id = ?', [sim.deviceId, await hash(), row.id]);
    if (res.affectedRows !== 1) throw new Error(`UPDATE touched ${res.affectedRows} rows (expected 1).`);
    r.actions.push(`set device_id on vehicle #${row.id} and wrote key hash`);
  } else if (r.state === 'MISSING' && opts.createMissing) {
    const plate = String(sim.licensePlate).trim();
    await pool.execute(
      `INSERT INTO vehicles
        (user_id, name, license_plate, driver_name, fuel_tank_capacity, device_id, device_key_hash,
         payload_capacity_kg, overspeed_threshold_kmh, idle_threshold_minutes, route_key, current_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'OFFLINE')`,
      [owner.id, `Truck ${plate}`, plate, null, Number(sim.tankCapacity) || 400, sim.deviceId, await hash(),
        Number(sim.payloadCapacity) || 10000, Number(sim.overspeedThresholdKmh) || 80, 10],
    );
    r.actions.push(`created vehicle for owner "${owner.username}"`);
  } else {
    return;
  }

  // Read back from the database and prove the stored hash matches the key.
  const after = await evaluate(pool, bcrypt, sim, key);
  r.vehicle = after.vehicle;
  r.state = after.state === 'READY' ? 'READY' : 'WRITE_NOT_VERIFIED';
}

// --- live verification against the running backend -------------------------

async function waitForBackend(base) {
  const deadline = Date.now() + 90000;
  let last = 'no response';
  out(`Contacting ${base}/health (a sleeping Render free instance can take ~60 s)...`);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 200 && body.status === 'ok') return { ok: true };
      if (res.status === 503 && body.database === 'unavailable') {
        return { ok: false, reason: 'backend is running but reports its database as unavailable' };
      }
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.cause?.code || e.name || e.message;
    }
    await sleep(5000);
  }
  return { ok: false, reason: `no healthy response within 90 s (${last}). Is backendUrl correct?` };
}

async function probeDeviceAuth(base, deviceId, key) {
  try {
    // The backend authenticates BEFORE it validates the body. An intentionally
    // incomplete payload therefore yields 400 VALIDATION_ERROR when the key is
    // accepted, 401 when it is not - and nothing is ever stored.
    const res = await fetch(`${base}/api/telemetry/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': key },
      body: JSON.stringify({ device_id: deviceId }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json().catch(() => null);
    const code = body?.error?.code || '';
    if (res.status === 400 && code === 'VALIDATION_ERROR') return { ok: true, detail: 'key accepted by backend' };
    if (res.status === 401) return { ok: false, detail: `REJECTED by backend (${code || '401'})` };
    return { ok: false, detail: `inconclusive: HTTP ${res.status} ${code}`.trim() };
  } catch (e) {
    return { ok: false, detail: `request failed: ${e.cause?.code || e.message}` };
  }
}

// --- main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    out(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }

  loadEnvSafely();
  const target = describeDatabaseTarget(opts);

  if (!fs.existsSync(CONFIG_PATH)) throw new Fatal(`Simulator config not found: ${CONFIG_PATH}`);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const sims = Array.isArray(config.vehicles) ? config.vehicles : [];
  if (!sims.length) throw new Fatal('simulator/config.json has no vehicles.');
  const seen = new Set();
  for (const s of sims) {
    if (!s.deviceId || !s.licensePlate) throw new Fatal('Every simulator vehicle needs deviceId and licensePlate.');
    if (seen.has(s.deviceId)) throw new Fatal(`Duplicate deviceId in simulator/config.json: ${s.deviceId}`);
    seen.add(s.deviceId);
  }

  out('============================================================');
  out(' FREIGHT MALAWI - DEVICE PROVISIONING');
  out('============================================================');
  out(` Mode           : ${opts.apply ? 'APPLY (will write to the database below)' : 'CHECK ONLY (nothing is written)'}`);
  out(` Database host  : ${target.host}:${target.port}`);
  out(` Database name  : ${target.dbName}`);
  out(` Database user  : ${target.user}`);
  out(` Supabase ref   : ${target.ref || 'not detected from host/user'}`);
  out(' Compare the host / ref above with DATABASE_URL on the Render backend.');
  out('============================================================');

  const { pool, closePool } = require('../config/db');
  const bcrypt = require('bcryptjs');
  const summary = { secretGenerated: null, secretMissing: false };
  let exitCode = 0;
  try {
    try {
      const [vehicleRows] = await pool.execute('SELECT COUNT(*) AS n FROM vehicles');
      const [userRows] = await pool.execute('SELECT COUNT(*) AS n FROM users');
      out(` Connected. This database has ${vehicleRows[0].n} vehicle(s) and ${userRows[0].n} user(s).`);
    } catch (e) {
      throw new Fatal(`Cannot read the vehicles/users tables: ${e.message}`, [
        'Either DATABASE_URL is wrong/unreachable, or schema.sql has not been run on this database.',
      ]);
    }

    const secret = ensureSecret(opts, summary);
    if (summary.secretGenerated) {
      out('');
      out(' A new DEVICE_KEY_SECRET was generated and saved to backend/.env.');
      out(' The simulator must use the SAME value (see the final instructions).');
    }

    let owner = null;
    if (opts.createMissing) {
      const [users] = await pool.execute(
        'SELECT id, username, email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)',
        [opts.owner, opts.owner],
      );
      if (users.length !== 1) throw new Fatal(`--owner "${opts.owner}" matched ${users.length} users (need exactly 1). Register that dashboard user first.`);
      owner = users[0];
    }

    const ownerNames = new Map();
    const ownerLabel = async (id) => {
      if (!ownerNames.has(id)) {
        const [rows] = await pool.execute('SELECT username FROM users WHERE id = ?', [id]);
        ownerNames.set(id, rows[0] ? `${rows[0].username} (user #${id})` : `user #${id}`);
      }
      return ownerNames.get(id);
    };

    // 1) database state / repair
    const results = [];
    for (const sim of sims) {
      const key = secret ? deriveDeviceKey(secret, sim.deviceId) : null;
      let r;
      try {
        r = await evaluate(pool, bcrypt, sim, key);
        if (opts.apply && key) await repair(pool, bcrypt, r, key, opts, owner);
      } catch (e) {
        r = r || { sim, state: 'ERROR', vehicle: null, near: [], notes: [], actions: [], live: null };
        r.state = 'ERROR';
        r.notes.push(e.message);
      }
      r.key = key;
      results.push(r);
    }

    // 2) live verification against the backend Render is running
    const base = String(opts.backendUrl || process.env.BACKEND_URL || config.backendUrl || '').replace(/\/$/, '');
    const verifiable = results.filter((r) => r.state === 'READY');
    let backendNote = null;
    if (opts.skipLive) {
      backendNote = 'live check skipped by --skip-live-check';
    } else if (!base) {
      backendNote = 'no backend URL known (set backendUrl in simulator/config.json or pass --backend-url)';
    } else if (verifiable.length) {
      const health = await waitForBackend(base);
      if (!health.ok) backendNote = health.reason;
      else for (const r of verifiable) r.live = await probeDeviceAuth(base, r.sim.deviceId, r.key);
    }

    // 3) report
    out('');
    out(` Backend checked: ${opts.skipLive ? '(skipped)' : base || '(none)'}`);
    out('------------------------------------------------------------');
    for (const r of results) {
      const live = r.live ? (r.live.ok ? 'LIVE OK' : `LIVE FAIL: ${r.live.detail}`) : (r.state === 'READY' ? 'LIVE NOT VERIFIED' : 'live: n/a');
      const label = r.state === 'READY' ? (r.live && r.live.ok ? 'READY' : 'DB-OK') : r.state;
      out(`[${label}] ${r.sim.deviceId}  ${r.sim.licensePlate}  ->  ${live}`);
      if (r.vehicle) out(`      vehicle #${r.vehicle.id}, owner: ${await ownerLabel(r.vehicle.user_id)}`);
      for (const a of r.actions) out(`      done: ${a}`);
      for (const n of r.notes) out(`      note: ${n}`);
      if (r.state === 'MISSING') out(`      No vehicle with device_id "${r.sim.deviceId}" or plate "${r.sim.licensePlate}" exists in THIS database.`);
      if (r.state === 'DEVICE_ID_MISMATCH' || r.state === 'AMBIGUOUS') {
        for (const n of r.near) out(`      candidate: vehicle #${n.id} plate "${n.license_plate}" device_id ${n.device_id ? `"${n.device_id}"` : 'NULL'} owner ${await ownerLabel(n.user_id)}`);
      }
    }
    out('------------------------------------------------------------');
    if (backendNote) out(` Backend note: ${backendNote}`);

    const notReady = results.filter((r) => r.state !== 'READY');
    const liveFailed = results.filter((r) => r.state === 'READY' && r.live && !r.live.ok);
    const unverified = results.filter((r) => r.state === 'READY' && !r.live);
    const pendingFixable = results.some((r) => ['KEY_NOT_SET', 'KEY_STALE', 'NEEDS_SECRET'].includes(r.state));

    if (!notReady.length && !liveFailed.length && !unverified.length) {
      out(`RESULT: SUCCESS - ${results.length}/${results.length} devices are in the database and accepted by ${base}.`);
    } else if (!notReady.length && !liveFailed.length && unverified.length && opts.skipLive) {
      out(`RESULT: DATABASE OK, BACKEND NOT VERIFIED - ${results.length}/${results.length} devices have correct key hashes, but you skipped the live check.`);
    } else {
      exitCode = 2;
      out(`RESULT: NOT READY - ${notReady.length} device(s) not provisioned, ${liveFailed.length} rejected by backend, ${unverified.length} unverified.`);
      if (!opts.apply && pendingFixable) {
        out(' Nothing was changed (check-only). To fix key hashes run again with --apply.');
      }
      if (results.some((r) => r.state === 'MISSING')) {
        out(' Missing vehicles: add them in the dashboard (Vehicles > Add, Device ID exactly as shown), or run');
        out('   node scripts\\provisionSimulatorDevices.js --apply --create-missing --owner <your dashboard username>');
      }
      if (results.some((r) => r.state === 'DEVICE_ID_MISMATCH')) {
        out(' Mismatched device_id: correct it in the dashboard, or run with --apply --adopt-by-plate.');
      }
      if (liveFailed.length) {
        out(' The database you updated is NOT what the backend authenticates against (or backendUrl is a different');
        out(' service). Make DATABASE_URL in backend/.env identical to the one on the Render backend and re-run.');
      }
    }

    if (summary.secretGenerated) {
      out('');
      out('============================================================');
      out(' ONE-TIME STEP - the simulator needs the same secret');
      out(' Render dashboard > simulator service > Environment > add:');
      out('   DEVICE_KEY_SECRET = (value below), then save (it redeploys).');
      out(`   ${summary.secretGenerated}`);
      out(' Do not commit it or paste it into chat/screenshots. It is stored in backend/.env (git-ignored).');
      out('============================================================');
    } else if (exitCode === 0 || results.some((r) => r.state === 'READY')) {
      out('');
      out(' Reminder: the Render simulator service must have DEVICE_KEY_SECRET = the value in backend/.env.');
    }
  } finally {
    await closePool();
  }
  return exitCode;
}

if (require.main === module) {
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      console.error(`\n[FATAL] ${err.message}`);
      if (err instanceof Fatal) err.hints.forEach((h) => console.error(`  ${h}`));
      else console.error(err.stack);
      process.exitCode = 1;
    },
  );
}

module.exports = { deriveDeviceKey };
