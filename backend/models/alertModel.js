const { pool } = require('../config/db');

async function createAlert({ vehicleId, alertType, severity, message }) {
  const [result] = await pool.query(
    `INSERT INTO alerts (vehicle_id, alert_type, severity, message)
     VALUES (?, ?, ?, ?)`,
    [vehicleId, alertType, severity, message]
  );
  return result.insertId;
}

async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT a.*, v.name AS vehicle_name, v.license_plate
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE v.user_id = ?
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [userId]
  );
  return rows;
}

async function countOpenForUser(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE v.user_id = ? AND a.acknowledged = 0`,
    [userId]
  );
  return rows[0].count || 0;
}

async function acknowledgeForUser(alertId, userId) {
  const [result] = await pool.query(
    `UPDATE alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     SET a.acknowledged = 1
     WHERE a.id = ? AND v.user_id = ?`,
    [alertId, userId]
  );
  return result.affectedRows > 0;
}

async function countForVehicleInRange(vehicleId, start, end) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM alerts
     WHERE vehicle_id = ? AND created_at BETWEEN ? AND ?`,
    [vehicleId, start, end]
  );
  return rows[0].count || 0;
}

module.exports = { createAlert, listForUser, countOpenForUser, acknowledgeForUser, countForVehicleInRange };
