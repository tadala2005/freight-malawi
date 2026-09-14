const { pool } = require('../config/db');

async function createPendingTrip({ userId, vehicleId, tripNumber, startedAt, startLatitude, startLongitude, fuelStartLitres }) {
  const [result] = await pool.query(
    `INSERT INTO trips
      (user_id, vehicle_id, trip_number, status, driver_name, started_at,
       starting_latitude, starting_longitude, fuel_start_litres)
     SELECT ?, v.id, ?, 'PENDING_LOG', v.driver_name, ?, ?, ?, ?
     FROM vehicles v
     WHERE v.id = ? AND v.user_id = ?
     LIMIT 1`,
    [userId, tripNumber, startedAt, startLatitude ?? null, startLongitude ?? null, fuelStartLitres ?? null, vehicleId, userId]
  );
  return result.insertId || null;
}

async function findOpenByVehicleForUser(vehicleId, userId) {
  const [rows] = await pool.query(
    `SELECT t.*, v.name AS vehicle_name, v.license_plate, v.driver_name AS vehicle_driver_name,
            v.device_id, v.fuel_tank_capacity
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.vehicle_id = ? AND t.user_id = ? AND t.status IN ('PENDING_LOG','ACTIVE')
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [vehicleId, userId]
  );
  return rows[0] || null;
}

async function findOpenByVehicle(vehicleId) {
  const [rows] = await pool.query(
    `SELECT t.*, v.name AS vehicle_name, v.license_plate, v.driver_name AS vehicle_driver_name,
            v.device_id, v.user_id, v.fuel_tank_capacity
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.vehicle_id = ? AND t.status IN ('PENDING_LOG','ACTIVE')
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [vehicleId]
  );
  return rows[0] || null;
}

async function nextTripNumber(userId, vehicleId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM trips WHERE user_id = ? AND vehicle_id = ?`,
    [userId, vehicleId]
  );
  const sequence = Number(rows[0]?.count || 0) + 1;
  return `TRIP-${vehicleId}-${String(sequence).padStart(4, '0')}`;
}

async function getByIdForUser(id, userId) {
  const [rows] = await pool.query(
    `SELECT t.*, v.name AS vehicle_name, v.license_plate, v.driver_name AS vehicle_driver_name,
            v.device_id, v.fuel_tank_capacity
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.id = ? AND t.user_id = ?
     LIMIT 1`,
    [id, userId]
  );
  return rows[0] || null;
}

async function listForUser(userId, filters = {}) {
  const where = ['t.user_id = ?'];
  const params = [userId];

  if (filters.status) {
    where.push('t.status = ?');
    params.push(filters.status);
  }
  if (filters.vehicleId) {
    where.push('t.vehicle_id = ?');
    params.push(filters.vehicleId);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    where.push(`(t.trip_number LIKE ? OR t.origin LIKE ? OR t.destination LIKE ? OR t.cargo_type LIKE ? OR v.name LIKE ? OR v.license_plate LIKE ? OR v.driver_name LIKE ?)`);
    params.push(term, term, term, term, term, term, term);
  }
  if (filters.start) {
    where.push('t.created_at >= ?');
    params.push(filters.start);
  }
  if (filters.end) {
    where.push('t.created_at <= ?');
    params.push(filters.end);
  }

  const [rows] = await pool.query(
    `SELECT t.*, v.name AS vehicle_name, v.license_plate, v.driver_name AS vehicle_driver_name,
            v.device_id,
            COALESCE((SELECT SUM(e.amount) FROM trip_expenses e WHERE e.trip_id = t.id), 0) AS total_expenses
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(t.started_at, t.created_at) DESC
     LIMIT 500`,
    params
  );

  return rows;
}

async function updateForUser(id, userId, fields) {
  const allowed = {
    origin: fields.origin,
    destination: fields.destination,
    cargoType: fields.cargoType,
    cargoDescription: fields.cargoDescription,
    cargoWeightKg: fields.cargoWeightKg,
    plannedDistanceKm: fields.plannedDistanceKm,
    agreedPayment: fields.agreedPayment,
    fuelPricePerLitre: fields.fuelPricePerLitre,
    notes: fields.notes,
  };

  const columns = [];
  const values = [];
  const map = {
    origin: 'origin',
    destination: 'destination',
    cargoType: 'cargo_type',
    cargoDescription: 'cargo_description',
    cargoWeightKg: 'cargo_weight_kg',
    plannedDistanceKm: 'planned_distance_km',
    agreedPayment: 'agreed_payment',
    fuelPricePerLitre: 'fuel_price_per_litre',
    notes: 'notes',
  };

  for (const [key, column] of Object.entries(map)) {
    if (allowed[key] !== undefined) {
      columns.push(`${column} = ?`);
      values.push(allowed[key] === '' ? null : allowed[key]);
    }
  }

  if (!columns.length) return false;

  values.push(id, userId);
  const [result] = await pool.query(
    `UPDATE trips SET ${columns.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status IN ('PENDING_LOG','ACTIVE')`,
    values
  );
  return result.affectedRows > 0;
}

async function markCompleted(id, userId, completedAt, endingLatitude, endingLongitude, actualDistanceKm, fuelEndLitres, fuelConsumedLitres, routeCompleted = true) {
  const [result] = await pool.query(
    `UPDATE trips
     SET status = 'COMPLETED', completed_at = ?, ending_latitude = ?, ending_longitude = ?,
         actual_distance_km = ?, fuel_end_litres = ?, fuel_consumed_litres = ?,
         route_completed = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND status IN ('PENDING_LOG','ACTIVE')`,
    [completedAt, endingLatitude ?? null, endingLongitude ?? null, actualDistanceKm ?? null, fuelEndLitres ?? null, fuelConsumedLitres ?? null, routeCompleted ? 1 : 0, id, userId]
  );
  return result.affectedRows > 0;
}

async function activateForUser(id, userId) {
  const [result] = await pool.query(
    `UPDATE trips SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND status = 'PENDING_LOG'`,
    [id, userId]
  );
  return result.affectedRows > 0;
}

async function cancelForUser(id, userId) {
  const [result] = await pool.query(
    `UPDATE trips SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND status IN ('PENDING_LOG','ACTIVE')`,
    [id, userId]
  );
  return result.affectedRows > 0;
}

async function totalExpenses(tripId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM trip_expenses WHERE trip_id = ?`,
    [tripId]
  );
  return Number(rows[0]?.total || 0);
}

async function listExpenses(tripId) {
  const [rows] = await pool.query(
    `SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY recorded_at ASC, id ASC`,
    [tripId]
  );
  return rows;
}

async function addExpense(tripId, { category, description, amount, recordedAt }) {
  const [result] = await pool.query(
    `INSERT INTO trip_expenses (trip_id, expense_category, description, amount, recorded_at)
     VALUES (?, ?, ?, ?, ?)`,
    [tripId, category, description || null, amount, recordedAt || new Date()]
  );
  return result.insertId;
}

async function updateExpense(tripId, expenseId, { category, description, amount, recordedAt }) {
  const [result] = await pool.query(
    `UPDATE trip_expenses
     SET expense_category = ?, description = ?, amount = ?, recorded_at = ?
     WHERE id = ? AND trip_id = ?`,
    [category, description || null, amount, recordedAt || new Date(), expenseId, tripId]
  );
  return result.affectedRows > 0;
}

async function deleteExpense(tripId, expenseId) {
  const [result] = await pool.query(
    `DELETE FROM trip_expenses WHERE id = ? AND trip_id = ?`,
    [expenseId, tripId]
  );
  return result.affectedRows > 0;
}

async function listAlerts(tripId) {
  const [rows] = await pool.query(
    `SELECT a.* FROM alerts a WHERE a.trip_id = ? ORDER BY a.created_at ASC`,
    [tripId]
  );
  return rows;
}

module.exports = {
  createPendingTrip,
  findOpenByVehicleForUser,
  findOpenByVehicle,
  nextTripNumber,
  getByIdForUser,
  listForUser,
  updateForUser,
  markCompleted,
  activateForUser,
  cancelForUser,
  totalExpenses,
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  listAlerts,
};
