// ============================================================================
// Telemetry persistence. Inserts are idempotent on telemetry_uuid so retried
// or duplicated packets (poor mobile networks, device reboots) never create
// double records or double-count distance/fuel deltas.
// ============================================================================
const { pool } = require('../config/db');

/**
 * Inserts a telemetry row. Returns { inserted: boolean, id } — inserted is
 * false when telemetry_uuid already existed (duplicate packet, safely ignored).
 */
async function insert(reading) {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO telemetry
      (telemetry_uuid, vehicle_id, trip_id, latitude, longitude, speed, heading,
       fuel_level_litres, fuel_percent, odometer_km, engine_hours, ignition_on,
       cargo_weight_kg, gps_valid, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reading.telemetry_uuid,
      reading.vehicle_id,
      reading.trip_id || null,
      reading.latitude,
      reading.longitude,
      reading.speed,
      reading.heading || 0,
      reading.fuel_level_litres,
      reading.fuel_percent,
      reading.odometer_km || 0,
      reading.engine_hours || 0,
      !!reading.ignition_on,
      reading.cargo_weight_kg || 0,
      reading.gps_valid !== false,
      reading.recorded_at,
    ],
  );
  return { inserted: result.affectedRows > 0, id: result.insertId };
}

async function getLatestForVehicle(vehicleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM telemetry WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    [vehicleId],
  );
  return rows[0] || null;
}

async function getLatestForVehicles(vehicleIds) {
  if (!vehicleIds.length) return [];
  const placeholders = vehicleIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT t.* FROM telemetry t
     INNER JOIN (
       SELECT vehicle_id, MAX(recorded_at) AS max_time
       FROM telemetry WHERE vehicle_id IN (${placeholders}) GROUP BY vehicle_id
     ) latest ON t.vehicle_id = latest.vehicle_id AND t.recorded_at = latest.max_time`,
    vehicleIds,
  );
  return rows;
}

/** Paginated telemetry history for a vehicle, optionally scoped to a date range or trip. */
async function getHistory(vehicleId, { from, to, tripId, limit = 2000 } = {}) {
  const clauses = ['vehicle_id = ?'];
  const params = [vehicleId];
  if (tripId) {
    clauses.push('trip_id = ?');
    params.push(tripId);
  }
  if (from) {
    clauses.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('recorded_at <= ?');
    params.push(to);
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 2000, 1), 5000);
  const [rows] = await pool.query(
    `SELECT * FROM telemetry WHERE ${clauses.join(' AND ')} ORDER BY recorded_at ASC LIMIT ${safeLimit}`,
    params,
  );
  return rows;
}

async function getForTrip(tripId) {
  const [rows] = await pool.execute(
    'SELECT * FROM telemetry WHERE trip_id = ? ORDER BY recorded_at ASC',
    [tripId],
  );
  return rows;
}

async function sumFleetDistanceAndFuel(userId, { from, to } = {}) {
  const clauses = ['v.user_id = ?'];
  const params = [userId];
  if (from) { clauses.push('t.recorded_at >= ?'); params.push(from); }
  if (to) { clauses.push('t.recorded_at <= ?'); params.push(to); }
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(GREATEST(t.odometer_km - v_first.min_odo, 0)), 0) AS total_distance_km
     FROM telemetry t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN (SELECT vehicle_id, MIN(odometer_km) AS min_odo FROM telemetry GROUP BY vehicle_id) v_first
       ON v_first.vehicle_id = t.vehicle_id
     WHERE ${clauses.join(' AND ')}`,
    params,
  );
  return rows[0] || { total_distance_km: 0 };
}

module.exports = {
  insert,
  getLatestForVehicle,
  getLatestForVehicles,
  getHistory,
  getForTrip,
  sumFleetDistanceAndFuel,
};
