// ============================================================================
// Alerts + driver behaviour events. The "active notification badge" logic
// (section 26 of the spec) is centralized here: it only counts unacknowledged
// alerts tied to a trip that is still ACTIVE/ROUTE_COMPLETED/PENDING_DETAILS,
// scoped to the requesting user. Completed/cancelled-trip alerts remain
// queryable (for the Logbook) but never inflate that count.
// ============================================================================
const { pool } = require('../config/db');

async function createAlert({ userId, vehicleId, tripId, category, type, severity, message, meta }) {
  const [result] = await pool.execute(
    `INSERT INTO alerts (user_id, vehicle_id, trip_id, category, type, severity, message, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, vehicleId, tripId || null, category, type, severity, message, meta ? JSON.stringify(meta) : null],
  );
  const [rows] = await pool.execute(
    `SELECT a.*, v.name AS vehicle_name, v.license_plate, v.driver_name
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.id = ?
     LIMIT 1`,
    [result.insertId],
  );
  return rows[0];
}

async function listForUser(userId, { scope = 'all', category, severity, vehicleId, tripId, acknowledged, from, to, limit = 200 } = {}) {
  const clauses = ['a.user_id = ?'];
  const params = [userId];

  if (scope === 'active') {
    clauses.push(`(a.trip_id IS NULL OR t.status IN ('ACTIVE','ROUTE_COMPLETED','PENDING_DETAILS'))`);
  } else if (scope === 'historical') {
    clauses.push(`(a.trip_id IS NOT NULL AND t.status IN ('COMPLETED','CANCELLED'))`);
  }
  if (category) { clauses.push('a.category = ?'); params.push(category); }
  if (severity) { clauses.push('a.severity = ?'); params.push(severity); }
  if (vehicleId) { clauses.push('a.vehicle_id = ?'); params.push(vehicleId); }
  if (tripId) { clauses.push('a.trip_id = ?'); params.push(tripId); }
  if (acknowledged !== undefined) { clauses.push('a.acknowledged = ?'); params.push(Boolean(acknowledged)); }
  if (from) { clauses.push('a.created_at >= ?'); params.push(from); }
  if (to) { clauses.push('a.created_at <= ?'); params.push(to); }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const [rows] = await pool.query(
    `SELECT a.*, v.name AS vehicle_name, v.license_plate, v.driver_name
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN trips t ON t.id = a.trip_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit}`,
    params,
  );
  return rows;
}

async function listForTrip(tripId, userId) {
  const [rows] = await pool.execute(
    `SELECT a.* FROM alerts a WHERE a.trip_id = ? AND a.user_id = ? ORDER BY a.created_at ASC`,
    [tripId, userId],
  );
  return rows;
}

/** Count of unacknowledged alerts belonging to non-final trips (or trip-less system alerts) — drives the notification bell. */
async function countActiveUnacknowledged(userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM alerts a
     LEFT JOIN trips t ON t.id = a.trip_id
     WHERE a.user_id = ? AND a.acknowledged = FALSE
       AND (a.trip_id IS NULL OR t.status IN ('ACTIVE','ROUTE_COMPLETED','PENDING_DETAILS'))`,
    [userId],
  );
  return Number(rows[0].cnt);
}

async function listActiveForBell(userId, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const [rows] = await pool.query(
    `SELECT a.*, v.name AS vehicle_name, v.license_plate
     FROM alerts a
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN trips t ON t.id = a.trip_id
     WHERE a.user_id = ? AND a.acknowledged = FALSE
       AND (a.trip_id IS NULL OR t.status IN ('ACTIVE','ROUTE_COMPLETED','PENDING_DETAILS'))
     ORDER BY a.created_at DESC
     LIMIT ${safeLimit}`,
    [userId],
  );
  return rows;
}

async function acknowledge(alertId, userId) {
  const [result] = await pool.execute(
    'UPDATE alerts SET acknowledged = TRUE, acknowledged_at = NOW() WHERE id = ? AND user_id = ?',
    [alertId, userId],
  );
  if (!result.affectedRows) return null;
  const [rows] = await pool.execute('SELECT * FROM alerts WHERE id = ?', [alertId]);
  return rows[0];
}

// --- Driver behaviour events -----------------------------------------------

async function createDriverEvent({ vehicleId, tripId, eventType, severity, speedKmh, details }) {
  const [result] = await pool.execute(
    `INSERT INTO driver_events (vehicle_id, trip_id, event_type, severity, speed_kmh, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [vehicleId, tripId || null, eventType, severity, speedKmh || null, details ? JSON.stringify(details) : null],
  );
  const [rows] = await pool.execute('SELECT * FROM driver_events WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function listDriverEventsForTrip(tripId) {
  const [rows] = await pool.execute('SELECT * FROM driver_events WHERE trip_id = ? ORDER BY occurred_at ASC', [tripId]);
  return rows;
}

async function driverBehaviourScoreForVehicle(vehicleId, sinceDays = 30) {
  const [rows] = await pool.execute(
    `SELECT event_type, COUNT(*) AS cnt FROM driver_events
     WHERE vehicle_id = ? AND occurred_at >= (NOW() - INTERVAL ? DAY)
     GROUP BY event_type`,
    [vehicleId, sinceDays],
  );
  const weights = { OVERSPEEDING: 4, HARSH_DRIVING: 5, AGGRESSIVE_DRIVING: 6, EXCESSIVE_IDLE: 2, ROUTE_DEVIATION: 3, FREQUENT_SPEED_VARIATION: 3 };
  let deduction = 0;
  const breakdown = {};
  for (const row of rows) {
    const w = weights[row.event_type] || 2;
    deduction += w * Number(row.cnt);
    breakdown[row.event_type] = Number(row.cnt);
  }
  const score = Math.max(0, Math.min(100, 100 - deduction));
  return { score, breakdown };
}

async function recordDeviceAction(vehicleId, action, details) {
  await pool.execute('INSERT INTO device_actions (vehicle_id, action, details) VALUES (?, ?, ?)', [
    vehicleId, action, details ? JSON.stringify(details) : null,
  ]);
}

module.exports = {
  createAlert,
  listForUser,
  listForTrip,
  countActiveUnacknowledged,
  listActiveForBell,
  acknowledge,
  createDriverEvent,
  listDriverEventsForTrip,
  driverBehaviourScoreForVehicle,
  recordDeviceAction,
};
