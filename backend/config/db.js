// Freight Malawi database layer.
// Production target: Supabase PostgreSQL via DATABASE_URL.
// Local development can still use MySQL/XAMPP by setting DB_CLIENT=mysql.
// The compatibility surface below keeps the existing models small and
// predictable while allowing the application to run against PostgreSQL.

const logger = require('../utils/logger');

const clientName = String(
  process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'postgres' : 'mysql'),
).toLowerCase();

let pool;
let driver;

function convertPlaceholders(sql) {
  let index = 0;
  let converted = String(sql).replace(/\?/g, () => `$${++index}`);

  // Preserve the existing model API while translating MySQL interval syntax.
  converted = converted
    .replace(/INTERVAL\s+\$(\d+)\s+SECOND/gi, (_, n) => `($${n} * INTERVAL '1 second')`)
    .replace(/INTERVAL\s+\$(\d+)\s+MINUTE/gi, (_, n) => `($${n} * INTERVAL '1 minute')`)
    .replace(/INTERVAL\s+\$(\d+)\s+DAY/gi, (_, n) => `($${n} * INTERVAL '1 day')`);

  return converted;
}

function postgresSql(sql) {
  let query = String(sql).trim().replace(/;\s*$/, '');

  // MySQL's INSERT IGNORE is only used for telemetry UUID idempotency.
  if (/^INSERT\s+IGNORE\s+INTO\s+telemetry\b/i.test(query)) {
    query = query.replace(/^INSERT\s+IGNORE\s+INTO\s+telemetry/i, 'INSERT INTO telemetry');
    query += ' ON CONFLICT (telemetry_uuid) DO NOTHING';
  }

  query = convertPlaceholders(query);

  // Existing model code expects result.insertId after inserts.
  if (/^INSERT\s+INTO\b/i.test(query) && !/\bRETURNING\b/i.test(query)) {
    query += ' RETURNING id';
  }

  return query;
}

async function connectPostgres() {
  // Deliberately lazy-loaded so local MySQL development works without pg
  // installed in an older checkout. Render/Supabase installs pg from package.json.
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');
  driver = 'postgres';

  const sslEnabled = String(process.env.DATABASE_SSL || process.env.DB_SSL || 'false').toLowerCase() === 'true';
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10000),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    application_name: 'freight-malawi',
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error', { message: err.message });
  });
}

function connectMysql() {
  // eslint-disable-next-line global-require
  const mysql = require('mysql2/promise');
  driver = 'mysql';
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'freight_malawi',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 10000,
    dateStrings: false,
    ssl: String(process.env.DB_SSL || 'false').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

if (clientName === 'postgres' || clientName === 'postgresql') {
  // This is intentionally sync-initialized; Pool construction itself is safe
  // before the first network operation.
  connectPostgres();
} else {
  connectMysql();
}

async function execute(sql, params = []) {
  if (driver === 'postgres') {
    const original = String(sql).trim();
    const result = await pool.query(postgresSql(original), params);

    // mysql2.execute() returns rows first for SELECT statements and a result
    // header first for INSERT/UPDATE/DELETE. Preserve that contract so the
    // existing models behave identically on MySQL and PostgreSQL.
    if (/^(SELECT|WITH)\b/i.test(original)) {
      return [result.rows, result];
    }

    if (/^INSERT\s+/i.test(original)) {
      return [{
        insertId: result.rows[0]?.id ?? null,
        affectedRows: result.rowCount,
      }, result.rows];
    }

    return [{
      affectedRows: result.rowCount,
      insertId: null,
    }, result.rows];
  }
  return pool.execute(sql, params);
}

async function query(sql, params = []) {
  if (driver === 'postgres') {
    const result = await pool.query(postgresSql(sql), params);
    return [result.rows, result];
  }
  return pool.query(sql, params);
}

async function checkDatabaseHealth() {
  try {
    if (driver === 'postgres') {
      await pool.query('SELECT 1');
    } else {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
    }
    return true;
  } catch (err) {
    logger.error('Database health check failed', { message: err.message, driver });
    return false;
  }
}

async function closePool() {
  try {
    await pool.end();
    logger.info(`${driver} pool closed`);
  } catch (err) {
    logger.error('Error closing database pool', { message: err.message, driver });
  }
}

module.exports = {
  pool: { execute, query },
  checkDatabaseHealth,
  closePool,
  get driver() { return driver; },
  postgresSql,
};
