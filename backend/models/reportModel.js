const { pool } = require('../config/db');
const { fuelEfficiencyKmPerLitre, costPerKm, revenuePerKm, round2 } = require('../utils/calculations');

function endExclusiveDate(value) {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return value;
  const d = new Date(`${text}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function buildTripFilter(userId, { from, to, vehicleId, status } = {}) {
  const clauses = ['t.user_id = ?'];
  const params = [userId];
  if (from) { clauses.push('t.created_at >= ?'); params.push(from); }
  if (to) { clauses.push('t.created_at < ?'); params.push(endExclusiveDate(to)); }
  if (vehicleId) { clauses.push('t.vehicle_id = ?'); params.push(vehicleId); }
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  return { clauses, params };
}

async function fleetSummary(userId, filters = {}) {
  const { clauses, params } = buildTripFilter(userId, filters);
  const vehicleClauses = ['v.user_id = ?'];
  const vehicleParams = [userId];
  if (filters.vehicleId) { vehicleClauses.push('v.id = ?'); vehicleParams.push(filters.vehicleId); }

  const [[vehicleCounts]] = await pool.query(
    `SELECT COUNT(*) AS total_vehicles,
            COALESCE(SUM(CASE WHEN v.current_status <> 'OFFLINE' THEN 1 ELSE 0 END), 0) AS active_vehicles
     FROM vehicles v WHERE ${vehicleClauses.join(' AND ')}`,
    vehicleParams,
  );

  const [[tripAgg]] = await pool.query(
    `SELECT COUNT(*) AS trip_count,
            COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_trips,
            COALESCE(SUM(CASE WHEN t.status = 'ACTIVE' THEN 1 ELSE 0 END), 0) AS active_trips,
            COALESCE(SUM(t.distance_km), 0) AS total_distance_km,
            COALESCE(SUM(t.fuel_used_litres), 0) AS total_fuel_litres,
            COALESCE(SUM(t.transporter_income), 0) AS total_income
     FROM trips t WHERE ${clauses.join(' AND ')}`,
    params,
  );

  const expenseClauses = clauses.map((clause) => clause.replace(/\bt\./g, 't.'));
  const [[expenseAgg]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
     FROM trip_expenses e
     JOIN trips t ON t.id = e.trip_id
     WHERE ${expenseClauses.join(' AND ')}`,
    params,
  );

  // Alert count is deliberately aligned to the same vehicle filter but not
  // the trip status/date filter; it represents live operational alerts.
  const alertParams = [userId];
  let alertWhere = 'a.user_id = ? AND a.acknowledged = FALSE\n       AND (a.trip_id IS NULL OR t.status IN (\'ACTIVE\',\'ROUTE_COMPLETED\',\'PENDING_DETAILS\'))';
  if (filters.vehicleId) {
    alertWhere += ' AND a.vehicle_id = ?';
    alertParams.push(filters.vehicleId);
  }
  const [[alertAgg]] = await pool.query(
    `SELECT COUNT(*) AS open_alerts
     FROM alerts a LEFT JOIN trips t ON t.id = a.trip_id
     WHERE ${alertWhere}`,
    alertParams,
  );

  const totalIncome = Number(tripAgg.total_income || 0);
  const totalExpenses = Number(expenseAgg.total_expenses || 0);

  return {
    total_vehicles: Number(vehicleCounts.total_vehicles || 0),
    active_vehicles: Number(vehicleCounts.active_vehicles || 0),
    trip_count: Number(tripAgg.trip_count || 0),
    completed_trips: Number(tripAgg.completed_trips || 0),
    active_trips: Number(tripAgg.active_trips || 0),
    total_distance_km: round2(tripAgg.total_distance_km),
    total_fuel_litres: round2(tripAgg.total_fuel_litres),
    average_consumption_km_per_l: fuelEfficiencyKmPerLitre(tripAgg.total_distance_km, tripAgg.total_fuel_litres),
    open_alerts: Number(alertAgg.open_alerts || 0),
    total_income: round2(totalIncome),
    total_expenses: round2(totalExpenses),
    fleet_profit_loss: round2(totalIncome - totalExpenses),
  };
}

async function vehicleReport(vehicleId, userId, { from, to } = {}) {
  const { clauses, params } = buildTripFilter(userId, { from, to, vehicleId });
  const [[tripAgg]] = await pool.query(
    `SELECT COUNT(*) AS trip_count,
            COALESCE(SUM(t.distance_km), 0) AS total_distance_km,
            COALESCE(SUM(t.fuel_used_litres), 0) AS total_fuel_litres,
            COALESCE(SUM(t.transporter_income), 0) AS total_income
     FROM trips t WHERE ${clauses.join(' AND ')}`,
    params,
  );
  const [[expenseAgg]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
     FROM trip_expenses e JOIN trips t ON t.id = e.trip_id
     WHERE ${clauses.join(' AND ')}`,
    params,
  );
  const [[alertCount]] = await pool.query(
    'SELECT COUNT(*) AS alert_count FROM alerts WHERE vehicle_id = ? AND user_id = ?',
    [vehicleId, userId],
  );
  const [[eventCount]] = await pool.query(
    'SELECT COUNT(*) AS event_count FROM driver_events WHERE vehicle_id = ?',
    [vehicleId],
  );

  const income = Number(tripAgg.total_income || 0);
  const expenses = Number(expenseAgg.total_expenses || 0);

  return {
    trip_count: Number(tripAgg.trip_count || 0),
    total_distance_km: round2(tripAgg.total_distance_km),
    total_fuel_litres: round2(tripAgg.total_fuel_litres),
    fuel_efficiency_km_per_l: fuelEfficiencyKmPerLitre(tripAgg.total_distance_km, tripAgg.total_fuel_litres),
    alert_count: Number(alertCount.alert_count || 0),
    driver_event_count: Number(eventCount.event_count || 0),
    total_income: round2(income),
    total_expenses: round2(expenses),
    profit_loss: round2(income - expenses),
    cost_per_km: costPerKm(expenses, tripAgg.total_distance_km),
    revenue_per_km: revenuePerKm(income, tripAgg.total_distance_km),
  };
}

async function tripReportRows(userId, filters = {}) {
  const { clauses, params } = buildTripFilter(userId, filters);
  const [rows] = await pool.query(
    `SELECT t.id, t.status, t.origin, t.destination, t.route_name, t.cargo_type,
            t.cargo_weight_kg, t.distance_km, t.fuel_used_litres, t.transporter_income,
            t.started_at, t.completed_at, t.created_at,
            v.name AS vehicle_name, v.license_plate, v.driver_name,
            COALESCE((SELECT SUM(amount) FROM trip_expenses e WHERE e.trip_id = t.id), 0) AS total_expenses
     FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY t.created_at DESC`,
    params,
  );

  return rows.map((r) => {
    const expenses = Number(r.total_expenses || 0);
    const income = Number(r.transporter_income || 0);
    return {
      ...r,
      profit_loss: round2(income - expenses),
      result: income - expenses > 0 ? 'PROFIT' : income - expenses < 0 ? 'LOSS' : 'BREAK-EVEN',
      fuel_efficiency_km_per_l: fuelEfficiencyKmPerLitre(r.distance_km, r.fuel_used_litres),
    };
  });
}

module.exports = { fleetSummary, vehicleReport, tripReportRows };
