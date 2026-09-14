const { pool } = require('../config/db');

function categoryForType(alertType) {
  const map = {
    THEFT_SUSPECTED: 'SECURITY',
    ABNORMAL_CONSUMPTION: 'FUEL',
    REFUEL: 'FUEL',
    ENGINE_START: 'TRIP_OPERATIONS',
    ROUTE_COMPLETED: 'TRIP_OPERATIONS',
    OVERSPEEDING: 'SAFETY',
    OVERWEIGHT: 'LOAD',
    POWER_LOSS: 'VEHICLE_HEALTH',
    GEOFENCE_EXIT: 'SECURITY',
  };
  return map[alertType] || 'TRIP_OPERATIONS';
}

async function createAlert({ vehicleId, tripId = null, alertType, severity, message, category }) {
  const resolvedCategory = category || categoryForType(alertType);
  const [result] = await pool.query(
    `INSERT INTO alerts (vehicle_id, trip_id, alert_type, category, severity, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [vehicleId, tripId, alertType, resolvedCategory, severity, message]
  );
  return result.insertId;
}

async function listForUser(userId, options = {}) {
  const where = ['v.user_id = ?'];
  const params = [userId];
  if (!options.historical) {
    where.push(`(a.trip_id IS NULL OR t.status IN ('PENDING_LOG','ACTIVE'))`);
  }
  const [rows] = await pool.query(
    `SELECT a.*, v.name AS vehicle_name, v.license_plate, t.trip_number, t.status AS trip_status
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN trips t ON t.id = a.trip_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT 200`,
    params
  );
  return rows;
}

async function listForTrip(tripId, userId) {
  const [rows] = await pool.query(
    `SELECT a.* FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.trip_id = ? AND v.user_id = ?
     ORDER BY a.created_at ASC`,
    [tripId, userId]
  );
  return rows;
}

async function countOpenForUser(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN trips t ON t.id = a.trip_id
     WHERE v.user_id = ? AND a.acknowledged = 0
       AND (a.trip_id IS NULL OR t.status IN ('PENDING_LOG','ACTIVE'))`,
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
    `SELECT COUNT(*) AS count FROM alerts WHERE vehicle_id = ? AND created_at BETWEEN ? AND ?`,
    [vehicleId, start, end]
  );
  return rows[0].count || 0;
}

module.exports = { createAlert, listForUser, listForTrip, countOpenForUser, acknowledgeForUser, countForVehicleInRange, categoryForType };
