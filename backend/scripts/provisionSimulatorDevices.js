
'use strict';

// FREIGHT MALAWI — DEVICE PROVISIONING
// Synchronises simulator credentials with Supabase PostgreSQL.
// Dry-run by default. Database writes require --apply.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(
  __dirname,
  '..',
  '..',
  'simulator',
  'config.json'
);

const ENV_PATH = path.join(
  __dirname,
  '..',
  '.env'
);

// Must match simulator/simulate.js exactly.
function deriveDeviceKey(secret, deviceId) {
  const cleanSecret = String(secret || '').trim();
  const cleanDeviceId = String(deviceId || '').trim();

  if (Buffer.byteLength(cleanSecret, 'utf8') < 32) {
    throw new Error(
      'DEVICE_KEY_SECRET must be at least 32 bytes.'
    );
  }

  if (!cleanDeviceId) {
    throw new Error('Device ID cannot be empty.');
  }

  return crypto
    .createHmac('sha256', cleanSecret)
    .update(`freight-malawi/device-key/v1/${cleanDeviceId}`)
    .digest('base64url');
}

function normalizePlate(plate) {
  return String(plate || '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

function loadConfiguration() {
  // Environment variables take precedence over local .env.
  if (fs.existsSync(ENV_PATH)) {
    require('dotenv').config({
      path: ENV_PATH
    });
  }

  const dbClient = String(
    process.env.DB_CLIENT || ''
  ).toLowerCase();

  if (dbClient !== 'postgres') {
    throw new Error(
      'DB_CLIENT must be postgres. Refusing to modify another database.'
    );
  }

  if (
    String(process.env.DATABASE_SSL).toLowerCase() !== 'true'
  ) {
    throw new Error(
      'DATABASE_SSL must be true.'
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing.');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('Invalid DATABASE_URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(
      parsedUrl.protocol
    )
  ) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string.'
    );
  }

  if (
    ['localhost', '127.0.0.1', '::1'].includes(
      parsedUrl.hostname
    )
  ) {
    throw new Error(
      'Refusing to provision against localhost.'
    );
  }

  const secret = String(
    process.env.DEVICE_KEY_SECRET || ''
  ).trim();

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(
      'DEVICE_KEY_SECRET is missing or too short.'
    );
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      'Simulator config.json was not found.'
    );
  }

  const config = JSON.parse(
    fs.readFileSync(CONFIG_PATH, 'utf8')
  );

  if (
    !Array.isArray(config.vehicles) ||
    config.vehicles.length === 0
  ) {
    throw new Error(
      'No simulator vehicles configured.'
    );
  }

  const seen = new Set();

  for (const vehicle of config.vehicles) {
    if (
      !vehicle.deviceId ||
      !vehicle.licensePlate ||
      seen.has(vehicle.deviceId)
    ) {
      throw new Error(
        'Invalid or duplicate simulator vehicle.'
      );
    }

    seen.add(vehicle.deviceId);
  }

  return { secret, config };
}

// Tests authentication without inserting telemetry.
async function checkLiveAuthentication(
  backendUrl,
  deviceId,
  deviceKey
) {
  const url = new URL(backendUrl);

  if (url.protocol !== 'https:') {
    throw new Error(
      'Production BACKEND_URL must use HTTPS.'
    );
  }

  const response = await fetch(
    new URL('/api/telemetry/device', url),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
        'X-Device-Key': deviceKey
      },
      body: JSON.stringify({
        device_id: deviceId
      }),
      signal: AbortSignal.timeout(90000)
    }
  );

  const body = await response.json().catch(
    () => ({})
  );

  // HTTP 400 VALIDATION_ERROR means authentication
  // succeeded and the intentionally incomplete
  // telemetry was rejected by input validation.
  if (
    response.status === 400 &&
    body?.error?.code === 'VALIDATION_ERROR'
  ) {
    return 'ACCEPTED';
  }

  if (response.status === 401) {
    return 'REJECTED (401)';
  }

  return `NOT VERIFIED (HTTP ${response.status})`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some(arg => arg !== '--apply')) {
    throw new Error(
      'Unsupported argument. Use --apply to update credentials.'
    );
  }

  const apply = args.includes('--apply');

  const { secret, config } = loadConfiguration();

  const bcrypt = require('bcryptjs');

  const {
    pool,
    closePool
  } = require('../config/db');

  try {
    console.log(
      `\nFREIGHT MALAWI PROVISIONING — ${
        apply ? 'APPLY' : 'DRY RUN'
      }`
    );

    const plans = [];
    let problems = 0;

    // STEP 1: Verify the vehicle assignments.
    for (const sim of config.vehicles) {
      const [rows] = await pool.execute(
        `SELECT
           id,
           device_id,
           license_plate,
           device_key_hash
         FROM vehicles
         WHERE device_id = ?
         LIMIT 1`,
        [sim.deviceId]
      );

      if (rows.length !== 1) {
        console.log(
          `[MISSING] ${sim.deviceId}`
        );

        problems++;
        continue;
      }

      const vehicle = rows[0];

      if (
        normalizePlate(sim.licensePlate) !==
        normalizePlate(vehicle.license_plate)
      ) {
        console.log(
          `[PLATE MISMATCH] ${sim.deviceId}`
        );

        problems++;
        continue;
      }

      const deviceKey = deriveDeviceKey(
        secret,
        sim.deviceId
      );

      let valid = false;

      if (vehicle.device_key_hash) {
        valid = await bcrypt.compare(
          deviceKey,
          vehicle.device_key_hash
        ).catch(() => false);
      }

      plans.push({
        sim,
        vehicle,
        deviceKey,
        valid
      });

      console.log(
        `[${valid ? 'READY' : 'NEEDS UPDATE'}] ` +
        `${sim.deviceId} (${sim.licensePlate})`
      );
    }

    // Prevent partial updates if a vehicle is missing.
    if (problems > 0) {
      throw new Error(
        `${problems} vehicle assignment issue(s). ` +
        'No credentials have been changed.'
      );
    }

    // STEP 2: Dry-run mode.
    if (!apply) {
      console.log(
        '\nDry run complete. No database changes made.'
      );

      return;
    }

    // STEP 3: Apply and verify credentials.
    for (const plan of plans) {
      if (!plan.valid) {
        const hash = await bcrypt.hash(
          plan.deviceKey,
          12
        );

        const [result] = await pool.execute(
          `UPDATE vehicles
           SET device_key_hash = ?
           WHERE id = ? AND device_id = ?`,
          [
            hash,
            plan.vehicle.id,
            plan.sim.deviceId
          ]
        );

        if (Number(result.affectedRows) !== 1) {
          throw new Error(
            `Update failed for ${plan.sim.deviceId}`
          );
        }
      }

      const [verification] = await pool.execute(
        `SELECT device_key_hash
         FROM vehicles
         WHERE id = ?
         LIMIT 1`,
        [plan.vehicle.id]
      );

      const verified =
        verification.length > 0 &&
        await bcrypt.compare(
          plan.deviceKey,
          verification[0].device_key_hash
        );

      if (!verified) {
        throw new Error(
          `Verification failed for ${plan.sim.deviceId}`
        );
      }

      console.log(
        `[VERIFIED] ${plan.sim.deviceId}`
      );
    }

    // STEP 4: Optional live backend authentication test.
    if (process.env.BACKEND_URL) {
      for (const plan of plans) {
        try {
          const result = await checkLiveAuthentication(
            process.env.BACKEND_URL,
            plan.sim.deviceId,
            plan.deviceKey
          );

          console.log(
            `[LIVE ${result}] ${plan.sim.deviceId}`
          );

          if (result !== 'ACCEPTED') {
            process.exitCode = 2;
          }

        } catch (error) {
          console.error(
            `[LIVE ERROR] ${plan.sim.deviceId}: ${error.message}`
          );

          process.exitCode = 2;
        }
      }
    } else {
      console.log(
        'Live authentication test skipped: BACKEND_URL not set.'
      );
    }

    console.log(
      '\nDevice provisioning completed.'
    );

  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      '[PROVISIONING FAILED]',
      error.message
    );

    process.exitCode = 1;
  });
}

module.exports = {
  deriveDeviceKey
};
