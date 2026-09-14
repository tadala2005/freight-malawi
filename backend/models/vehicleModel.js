const { pool } = require('../config/db');

async function createVehicle({ userId, name, licensePlate, driverName, fuelTankCapacity, deviceId }) {
  const [result] = await pool.query(
    `INSERT INTO vehicles (user_id, name, license_plate, driver_name, fuel_tank_capacity, device_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, name, licensePlate, driverName, fuelTankCapacity, deviceId]
  );
  return result.insertId;
}

async function findByDeviceId(deviceId) {
  const [rows] = await pool.query('SELECT * FROM vehicles WHERE device_id = ? LIMIT 1', [deviceId]);
  return rows[0] || null;
}

async function findByIdForUser(id, userId) {
  const [rows] = await pool.query(
    'SELECT * FROM vehicles WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId]
  );
  return rows[0] || null;
}

async function listByUser(userId) {
  const [rows] = await pool.query(
    `SELECT v.*,
            (SELECT t.fuel_percent FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_fuel_percent,
            (SELECT t.fuel_level_litres FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_fuel_litres,
            (SELECT t.speed FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_speed,
            (SELECT t.latitude FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_latitude,
            (SELECT t.longitude FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_longitude,
            (SELECT t.heading FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_heading,
            (SELECT t.recorded_at FROM telemetry t WHERE t.vehicle_id = v.id ORDER BY t.recorded_at DESC LIMIT 1) AS latest_recorded_at
     FROM vehicles v
     WHERE v.user_id = ?
     ORDER BY v.created_at DESC`,
    [userId]
  );
  return rows;
}

async function deleteByIdForUser(id, userId) {
  const [result] = await pool.query('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows > 0;
}

module.exports = { createVehicle, findByDeviceId, findByIdForUser, listByUser, deleteByIdForUser };
