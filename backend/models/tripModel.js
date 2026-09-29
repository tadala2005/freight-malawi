const { pool } = require('../config/db');
const { getRoute } = require('../services/routeService');

const BASE_FIELDS = `
  id, user_id, vehicle_id, status, route_key, origin, destination, route_name, cargo_type,
  cargo_description, cargo_weight_kg, distance_km, transporter_income, fuel_cost,
  fuel_used_litres, start_fuel_litres, start_odometer_km, end_odometer_km,
  idle_seconds, max_speed_kmh, started_at, ignition_started_at, ignition_ended_at,
  route_completed_at, completed_at, created_at, updated_at
`;

async function getActiveForVehicle(vehicleId) {
  const [rows] = await pool.execute(
    `SELECT ${BASE_FIELDS} FROM trips
     WHERE vehicle_id = ? AND status IN ('ACTIVE','ROUTE_COMPLETED','PENDING_DETAILS')
     ORDER BY id DESC LIMIT 1`,
    [vehicleId],
  );
  return rows[0] || null;
}

async function create({ userId, vehicleId, startFuelLitres, startOdometerKm, routeKey, routeName }) {
  const route = routeKey ? getRoute(routeKey) : null;
  const [result] = await pool.execute(
    `INSERT INTO trips
      (user_id, vehicle_id, status, route_key, route_name, origin, destination,
       started_at, ignition_started_at, start_fuel_litres, start_odometer_km)
     VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, NOW(), NOW(), ?, ?)`,
    [
      userId,
      vehicleId,
      routeKey || null,
      routeName || route?.name || null,
      route?.origin || null,
      route?.destination || null,
      startFuelLitres ?? null,
      startOdometerKm ?? null,
    ],
  );
  return getByIdInternal(result.insertId);
}

async function createPendingForUser(userId, data) {
  const [existingRows] = await pool.execute(
    `SELECT id, status FROM trips
     WHERE vehicle_id = ? AND user_id = ?
       AND status IN ('ACTIVE','ROUTE_COMPLETED','PENDING_DETAILS')
     ORDER BY id DESC LIMIT 1`,
    [data.vehicle_id, userId],
  );
  if (existingRows.length) {
    return { conflict: existingRows[0] };
  }

  const route = getRoute(data.route_key);
  if (!route) return { conflict: null, invalidRoute: true };

  const [result] = await pool.execute(
    `INSERT INTO trips
      (user_id, vehicle_id, status, route_key, route_name, origin, destination,
       cargo_type, cargo_description, cargo_weight_kg, transporter_income)
     VALUES (?, ?, 'PENDING_DETAILS', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.vehicle_id,
      data.route_key,
      route.name,
      data.origin || route.origin,
      data.destination || route.destination,
      data.cargo_type || null,
      data.cargo_description || null,
      data.cargo_weight_kg ?? null,
      data.transporter_income ?? 0,
    ],
  );
  return { trip: await getByIdForUser(result.insertId, userId), conflict: null, invalidRoute: false };
}

async function activatePendingTrip(tripId, reading) {
  await pool.execute(
    `UPDATE trips
     SET status = 'ACTIVE', started_at = COALESCE(started_at, ?), ignition_started_at = ?,
         start_fuel_litres = COALESCE(start_fuel_litres, ?),
         start_odometer_km = COALESCE(start_odometer_km, ?)
     WHERE id = ? AND status = 'PENDING_DETAILS'`,
    [new Date(reading.recorded_at), new Date(reading.recorded_at), reading.fuel_level_litres, reading.odometer_km, tripId],
  );
  return getByIdInternal(tripId);
}

async function getByIdInternal(tripId) {
  const [rows] = await pool.execute(`SELECT ${BASE_FIELDS} FROM trips WHERE id = ? LIMIT 1`, [tripId]);
  return rows[0] || null;
}

async function getByIdForUser(tripId, userId) {
  const [rows] = await pool.execute(`SELECT ${BASE_FIELDS} FROM trips WHERE id = ? AND user_id = ? LIMIT 1`, [tripId, userId]);
  return rows[0] || null;
}

async function listForUser(userId, { status, vehicleId, from, to, search, limit = 200, offset = 0 } = {}) {
  const clauses = ['t.user_id = ?'];
  const params = [userId];
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (vehicleId) { clauses.push('t.vehicle_id = ?'); params.push(vehicleId); }
  if (from) { clauses.push('t.created_at >= ?'); params.push(from); }
  if (to) { clauses.push('t.created_at <= ?'); params.push(to); }
  if (search) {
    clauses.push('(t.origin LIKE ? OR t.destination LIKE ? OR t.route_name LIKE ? OR t.cargo_type LIKE ? OR v.name LIKE ? OR v.license_plate LIKE ? OR v.driver_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like);
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const [rows] = await pool.query(
    `SELECT t.*, v.name AS vehicle_name, v.license_plate, v.driver_name,
            COALESCE((SELECT SUM(amount) FROM trip_expenses e WHERE e.trip_id = t.id), 0) AS total_expenses
     FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY t.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params,
  );
  return rows;
}

async function updateFields(tripId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getByIdInternal(tripId);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  values.push(tripId);
  await pool.execute(`UPDATE trips SET ${setClause} WHERE id = ?`, values);
  return getByIdInternal(tripId);
}

async function updateDetailsForUser(tripId, userId, details) {
  const existing = await getByIdForUser(tripId, userId);
  if (!existing) return null;
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') return { locked: true, trip: existing };

  const fields = {};
  const assignable = ['origin', 'destination', 'cargo_type', 'cargo_description', 'cargo_weight_kg', 'distance_km', 'transporter_income'];
  for (const key of assignable) {
    if (details[key] !== undefined) fields[key] = details[key];
  }

  if (details.route_key !== undefined) {
    if (existing.status !== 'PENDING_DETAILS') return { lockedRoute: true, trip: existing };
    const route = details.route_key ? getRoute(details.route_key) : null;
    if (!route) return { invalidRoute: true, trip: existing };
    fields.route_key = details.route_key;
    fields.route_name = route.name;
    fields.origin = details.origin || route.origin;
    fields.destination = details.destination || route.destination;
  }

  return { trip: await updateFields(tripId, fields) };
}

async function completeForUser(tripId, userId) {
  const existing = await getByIdForUser(tripId, userId);
  if (!existing) return null;
  if (existing.status === 'PENDING_DETAILS') {
    const err = new Error('Start the trip ignition before completing the trip.');
    err.statusCode = 409;
    err.code = 'TRIP_NOT_STARTED';
    throw err;
  }
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') return existing;
  const [latestRows] = await pool.execute(
    'SELECT odometer_km, ignition_on, recorded_at FROM telemetry WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 1',
    [existing.vehicle_id],
  );
  const latest = latestRows[0];
  if (latest?.ignition_on) {
    const err = new Error('Turn the vehicle ignition off before completing the trip.');
    err.statusCode = 409;
    err.code = 'IGNITION_STILL_ON';
    throw err;
  }

  const endOdo = latest?.odometer_km ?? existing.end_odometer_km;
  const distance = existing.start_odometer_km != null && endOdo != null
    ? Math.max(0, Number(endOdo) - Number(existing.start_odometer_km))
    : existing.distance_km;

  return updateFields(tripId, {
    status: 'COMPLETED',
    end_odometer_km: endOdo ?? null,
    distance_km: distance != null ? Math.round(Number(distance) * 100) / 100 : null,
    completed_at: new Date(),
  });
}

async function markRouteCompleted(tripId, reading) {
  const trip = await getByIdInternal(tripId);
  if (!trip) return null;
  const endOdo = reading?.odometer_km ?? trip.end_odometer_km;
  const distance = trip.start_odometer_km != null && endOdo != null
    ? Math.max(0, Number(endOdo) - Number(trip.start_odometer_km))
    : trip.distance_km;
  return updateFields(tripId, {
    status: 'ROUTE_COMPLETED',
    end_odometer_km: endOdo ?? null,
    distance_km: distance != null ? Math.round(Number(distance) * 100) / 100 : null,
    route_completed_at: new Date(reading?.recorded_at || Date.now()),
  });
}

async function bumpMaxSpeed(tripId, speed) {
  await pool.execute('UPDATE trips SET max_speed_kmh = GREATEST(max_speed_kmh, ?) WHERE id = ?', [speed, tripId]);
}

async function incrementIdleSeconds(tripId, seconds) {
  await pool.execute('UPDATE trips SET idle_seconds = idle_seconds + ? WHERE id = ?', [seconds, tripId]);
}

async function accumulateFuelUsed(tripId, litres) {
  if (litres <= 0) return;
  await pool.execute('UPDATE trips SET fuel_used_litres = fuel_used_litres + ? WHERE id = ?', [litres, tripId]);
}

module.exports = {
  getActiveForVehicle,
  create,
  createPendingForUser,
  activatePendingTrip,
  getByIdInternal,
  getByIdForUser,
  listForUser,
  updateFields,
  updateDetailsForUser,
  completeForUser,
  markRouteCompleted,
  bumpMaxSpeed,
  incrementIdleSeconds,
  accumulateFuelUsed,
};
