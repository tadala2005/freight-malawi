const { getHistory } = require('../models/telemetryModel');
const trips = require('../models/tripModel');
const { haversineKm } = require('./theftDetector');

function round(value, places = 2) {
  const n = Number(value || 0);
  return Number(n.toFixed(places));
}

function calculateMetrics(rows) {
  let distanceKm = 0;
  let consumed = 0;
  let refuel = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    distanceKm += haversineKm(Number(prev.latitude), Number(prev.longitude), Number(curr.latitude), Number(curr.longitude));
    const delta = Number(prev.fuel_level_litres) - Number(curr.fuel_level_litres);
    if (delta > 0) consumed += delta;
    if (delta < 0) refuel += Math.abs(delta);
  }

  return {
    actualDistanceKm: round(distanceKm),
    fuelConsumedLitres: round(consumed),
    refuelLitres: round(refuel),
  };
}

async function createPendingFromEngineStart({ vehicle, startedAt, latitude, longitude, fuelLevelLitres }) {
  const existing = await trips.findOpenByVehicle(vehicle.id);
  if (existing) return { trip: existing, created: false };

  const tripNumber = await trips.nextTripNumber(vehicle.user_id, vehicle.id);
  const id = await trips.createPendingTrip({
    userId: vehicle.user_id,
    vehicleId: vehicle.id,
    tripNumber,
    startedAt,
    startLatitude: latitude,
    startLongitude: longitude,
    fuelStartLitres: fuelLevelLitres,
  });

  return { trip: await trips.getByIdForUser(id, vehicle.user_id), created: true };
}

async function activateTrip(id, userId, payload) {
  const trip = await trips.getByIdForUser(id, userId);
  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  const required = ['origin', 'destination'];
  for (const key of required) {
    if (!String(payload[key] || '').trim()) throw Object.assign(new Error(`${key} is required`), { status: 400 });
  }

  const numericFields = ['cargoWeightKg', 'plannedDistanceKm', 'agreedPayment', 'fuelPricePerLitre'];
  for (const key of numericFields) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '' && (!Number.isFinite(Number(payload[key])) || Number(payload[key]) < 0)) {
      throw Object.assign(new Error(`${key} must be a non-negative number`), { status: 400 });
    }
  }

  const updated = await trips.updateForUser(id, userId, payload);
  if (!updated) throw Object.assign(new Error('Trip could not be updated'), { status: 400 });
  await trips.activateForUser(id, userId);
  return trips.getByIdForUser(id, userId);
}

async function completeTrip(id, userId, { completedAt = new Date(), latitude = null, longitude = null, fuelEndLitres = null, routeCompleted = true } = {}) {
  const trip = await trips.getByIdForUser(id, userId);
  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.status === 'COMPLETED') return buildReport(id, userId);
  if (!['PENDING_LOG', 'ACTIVE'].includes(trip.status)) throw Object.assign(new Error('Trip cannot be completed in its current status'), { status: 400 });

  const end = new Date(completedAt);
  const history = await getHistory(trip.vehicle_id, trip.started_at || trip.created_at, end);
  const metrics = calculateMetrics(history);

  let actualDistanceKm = metrics.actualDistanceKm;
  let fuelConsumedLitres = metrics.fuelConsumedLitres;
  let endingFuel = fuelEndLitres;

  if (endingFuel === null && history.length) endingFuel = Number(history[history.length - 1].fuel_level_litres);
  if (trip.fuel_start_litres !== null && endingFuel !== null && fuelConsumedLitres === 0) {
    const direct = Number(trip.fuel_start_litres) - Number(endingFuel);
    if (direct > 0) fuelConsumedLitres = round(direct);
  }

  await trips.markCompleted(
    id,
    userId,
    end,
    latitude,
    longitude,
    actualDistanceKm || null,
    endingFuel,
    fuelConsumedLitres || null,
    routeCompleted
  );

  return buildReport(id, userId);
}

async function buildReport(id, userId) {
  const trip = await trips.getByIdForUser(id, userId);
  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });

  const expenses = await trips.listExpenses(id);
  const alerts = await trips.listAlerts(id);
  const expenseTotal = round(expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0));

  const revenue = Number(trip.agreed_payment || 0);
  const fuelPrice = Number(trip.fuel_price_per_litre || 0);
  const recordedFuelExpense = expenses.filter((e) => e.expense_category === 'FUEL').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const calculatedFuelExpense = Number(trip.fuel_consumed_litres || 0) * fuelPrice;
  const fuelExpense = recordedFuelExpense > 0 ? recordedFuelExpense : calculatedFuelExpense;
  const otherExpenses = round(Math.max(0, expenseTotal - recordedFuelExpense));
  const totalExpenses = round(Math.max(expenseTotal, fuelExpense + otherExpenses));
  const net = round(revenue - totalExpenses);
  const margin = revenue > 0 ? round((net / revenue) * 100) : 0;

  let status = 'BREAK-EVEN';
  if (net > 0) status = 'PROFIT';
  if (net < 0) status = 'LOSS';

  const durationMs = trip.completed_at && trip.started_at ? new Date(trip.completed_at) - new Date(trip.started_at) : null;
  const durationMinutes = durationMs !== null ? Math.max(0, Math.round(durationMs / 60000)) : null;
  const actual = Number(trip.actual_distance_km || 0);
  const planned = Number(trip.planned_distance_km || 0);

  const alertSummary = alerts.reduce((acc, alert) => {
    const key = String(alert.category || 'TRIP_OPERATIONS').toUpperCase();
    acc.total += 1;
    acc.categories[key] = (acc.categories[key] || 0) + 1;
    if (['HIGH'].includes(alert.severity)) acc.high += 1;
    return acc;
  }, { total: 0, high: 0, categories: {} });

  return {
    trip: {
      ...trip,
      actual_distance_km: actual || null,
      duration_minutes: durationMinutes,
    },
    expenses,
    alerts,
    financial: {
      revenue: round(revenue),
      fuelExpense: round(fuelExpense),
      otherExpenses: round(otherExpenses),
      totalExpenses,
      netProfit: net,
      profitMargin: margin,
      result: status,
    },
    fuel: {
      startingFuelLitres: trip.fuel_start_litres !== null ? Number(trip.fuel_start_litres) : null,
      endingFuelLitres: trip.fuel_end_litres !== null ? Number(trip.fuel_end_litres) : null,
      consumedLitres: trip.fuel_consumed_litres !== null ? Number(trip.fuel_consumed_litres) : null,
      fuelPricePerLitre: fuelPrice || null,
      averageKmPerLitre: Number(trip.fuel_consumed_litres || 0) > 0 ? round(actual / Number(trip.fuel_consumed_litres)) : null,
    },
    distance: {
      plannedKm: planned || null,
      actualKm: actual || null,
      varianceKm: planned > 0 && actual > 0 ? round(actual - planned) : null,
    },
    alertSummary,
  };
}

module.exports = { createPendingFromEngineStart, activateTrip, completeTrip, buildReport };
