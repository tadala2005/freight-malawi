const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'freight_malawi',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: false,
});

async function verifyConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
    console.log(`[${new Date().toISOString()}] MySQL pool ready`);
  } finally {
    conn.release();
  }
}

module.exports = { pool, verifyConnection };
