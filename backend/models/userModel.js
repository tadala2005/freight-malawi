const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const SALT_ROUNDS = 10;

async function createUser({ username, email, password }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [username, email, passwordHash],
  );
  return { id: result.insertId, username, email };
}

async function findByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id, username, email FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, username, email, created_at FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { createUser, findByUsername, findByEmail, findById, verifyPassword };
