const { pool } = require('../config/db');

async function insertTelemetry({ vehicleId, latitude, longitude, speed, heading, fuelLevelLitres, fuelPercent, recordedAt }) {
  const [result] = await pool.query(
    `INSERT INTO telemetry
      (vehicle_id, latitude, longitude, speed, heading, fuel_level_litres, fuel_percent, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [vehicleId, latitude, longitude, speed, heading, fuelLevelLitres, fuelPercent, recordedAt]
  );
  return result.insertId;
}

async function getLatestForVehicle(vehicleId) {
  const [rows] = await pool.query(
    'SELECT * FROM telemetry WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 1',
    [vehicleId]
  );
  return rows[0] || null;
}

async function getHistory(vehicleId, start, end) {
  const [rows] = await pool.query(
    `SELECT * FROM telemetry
     WHERE vehicle_id = ? AND recorded_at BETWEEN ? AND ?
     ORDER BY recorded_at ASC`,
    [vehicleId, start, end]
  );
  return rows;
}

async function getActiveVehicleCount(userId, sinceMinutes = 15) {
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT t.vehicle_id) AS count
     FROM telemetry t
     JOIN vehicles v ON v.id = t.vehicle_id
     WHERE v.user_id = ? AND t.recorded_at >= (NOW() - INTERVAL ? MINUTE)`,
    [userId, sinceMinutes]
  );
  return rows[0].count || 0;
}

module.exports = { insertTelemetry, getLatestForVehicle, getHistory, getActiveVehicleCount };
