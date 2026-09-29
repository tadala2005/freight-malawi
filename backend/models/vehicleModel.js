// ============================================================================
// Every query here is scoped by user_id. Nothing in this file trusts the
// frontend's idea of ownership — a vehicle row is only ever returned,
// updated or deleted when it belongs to the requesting user.
// ============================================================================
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const SALT_ROUNDS = 10;

const BASE_FIELDS = `
  id, user_id, name, license_plate, driver_name, fuel_tank_capacity,
  device_id, payload_capacity_kg, overspeed_threshold_kmh, idle_threshold_minutes,
  route_key, current_status, last_latitude, last_longitude, last_gps_update, last_seen_at, created_at, updated_at
`;

async function listByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT ${BASE_FIELDS} FROM vehicles WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

async function getByIdForUser(vehicleId, userId) {
  const [rows] = await pool.execute(
    `SELECT ${BASE_FIELDS} FROM vehicles WHERE id = ? AND user_id = ? LIMIT 1`,
    [vehicleId, userId],
  );
  return rows[0] || null;
}

/** Internal use only (telemetry pipeline) — not exposed to any user-facing route without an ownership check. */
async function getByIdInternal(vehicleId) {
  const [rows] = await pool.execute(`SELECT ${BASE_FIELDS} FROM vehicles WHERE id = ? LIMIT 1`, [vehicleId]);
  return rows[0] || null;
}

async function getByDeviceId(deviceId) {
  const [rows] = await pool.execute(`SELECT ${BASE_FIELDS} FROM vehicles WHERE device_id = ? LIMIT 1`, [deviceId]);
  return rows[0] || null;
}

async function create(userId, data) {
  let deviceKeyHash = null;
  if (data.device_key) {
    deviceKeyHash = await bcrypt.hash(String(data.device_key), SALT_ROUNDS);
  }
  const [result] = await pool.execute(
    `INSERT INTO vehicles
      (user_id, name, license_plate, driver_name, fuel_tank_capacity, device_id, device_key_hash,
       payload_capacity_kg, overspeed_threshold_kmh, idle_threshold_minutes, route_key, current_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'OFFLINE')`,
    [
      userId,
      data.name,
      data.license_plate,
      data.driver_name || null,
      data.fuel_tank_capacity || 400,
      data.device_id || null,
      deviceKeyHash,
      data.payload_capacity_kg || 10000,
      data.overspeed_threshold_kmh || 80,
      10,
    ],
  );
  return getByIdForUser(result.insertId, userId);
}

async function update(vehicleId, userId, data) {
  const existing = await getByIdForUser(vehicleId, userId);
  if (!existing) return null;

  const fields = [];
  const values = [];
  const assignable = [
    'name', 'license_plate', 'driver_name', 'fuel_tank_capacity', 'device_id',
    'payload_capacity_kg', 'overspeed_threshold_kmh',
  ];
  for (const key of assignable) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (data.device_key) {
    fields.push('device_key_hash = ?');
    values.push(await bcrypt.hash(String(data.device_key), SALT_ROUNDS));
  }
  if (!fields.length) return existing;

  values.push(vehicleId, userId);
  await pool.execute(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
  return getByIdForUser(vehicleId, userId);
}

async function remove(vehicleId, userId) {
  const [result] = await pool.execute('DELETE FROM vehicles WHERE id = ? AND user_id = ?', [vehicleId, userId]);
  return result.affectedRows > 0;
}

async function updateStatus(vehicleId, status, lastSeenAt, latitude = null, longitude = null) {
  await pool.execute(
    `UPDATE vehicles
     SET current_status = ?, last_seen_at = ?, last_latitude = ?, last_longitude = ?, last_gps_update = ?
     WHERE id = ?`,
    [status, lastSeenAt, latitude, longitude, lastSeenAt, vehicleId],
  );
}

async function markOfflineIfStale(thresholdSeconds) {
  const [result] = await pool.execute(
    `UPDATE vehicles
     SET current_status = 'OFFLINE'
     WHERE current_status <> 'OFFLINE'
       AND last_seen_at IS NOT NULL
       AND last_seen_at < (NOW() - INTERVAL ? SECOND)`,
    [thresholdSeconds],
  );
  return result.affectedRows;
}

module.exports = {
  listByUser,
  getByIdForUser,
  getByIdInternal,
  getByDeviceId,
  create,
  update,
  remove,
  updateStatus,
  markOfflineIfStale,
};
