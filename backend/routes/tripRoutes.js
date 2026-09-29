const express = require('express');

const tripModel = require('../models/tripModel');
const expenseModel = require('../models/expenseModel');
const alertModel = require('../models/alertModel');
const telemetryModel = require('../models/telemetryModel');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateTripCreate, validateTripDetails, validateExpense } = require('../utils/validators');
const { AppError } = require('../middleware/errorHandler');
const { profitLoss, profitMargin, totalExpenses, fuelEfficiencyKmPerLitre } = require('../utils/calculations');
const dashboardSocket = require('../sockets/dashboardSocket');
const vehicleModel = require('../models/vehicleModel');
const { getRoute, listRoutes } = require('../services/routeService');

const router = express.Router();
router.use(authMiddleware);


router.get('/routes', (req, res) => {
  res.json({ success: true, data: listRoutes() });
});

router.post('/', validate(validateTripCreate), async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(req.body.vehicle_id, req.user.id);
    if (!vehicle) throw new AppError('Vehicle not found.', 404, 'VEHICLE_NOT_FOUND');
    if (!vehicle.device_id) throw new AppError('This vehicle does not have an IoT device assigned.', 400, 'DEVICE_NOT_CONFIGURED');

    const route = getRoute(req.body.route_key);
    if (!route) throw new AppError('Invalid trip route.', 400, 'INVALID_ROUTE');

    const result = await tripModel.createPendingForUser(req.user.id, {
      ...req.body,
      vehicle_id: vehicle.id,
      route_key: req.body.route_key,
      origin: req.body.origin || route.origin,
      destination: req.body.destination || route.destination,
    });
    if (result.conflict) {
      throw new AppError('This vehicle already has an unfinished trip. Complete it before creating another trip.', 409, 'TRIP_ALREADY_OPEN');
    }
    if (result.invalidRoute) throw new AppError('Invalid trip route.', 400, 'INVALID_ROUTE');

    dashboardSocket.emitToUser(req.user.id, 'trip:updated', result.trip);
    res.status(201).json({ success: true, data: result.trip });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, vehicleId, from, to, search, limit, offset } = req.query;
    const trips = await tripModel.listForUser(req.user.id, { status, vehicleId, from, to, search, limit, offset });
    const withFinancials = trips.map((t) => ({
      ...t,
      profit_loss: profitLoss(t.transporter_income, t.total_expenses),
    }));
    res.json({ success: true, data: withFinancials });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const trip = await tripModel.getByIdForUser(req.params.id, req.user.id);
    if (!trip) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    const [expenses, alerts, driverEvents] = await Promise.all([
      expenseModel.listForTrip(trip.id, req.user.id),
      alertModel.listForTrip(trip.id, req.user.id),
      alertModel.listDriverEventsForTrip(trip.id),
    ]);
    const expenseTotal = totalExpenses(expenses);
    res.json({
      success: true,
      data: {
        ...trip,
        expenses,
        alerts,
        driver_events: driverEvents,
        total_expenses: expenseTotal,
        profit_loss: profitLoss(trip.transporter_income, expenseTotal),
        profit_margin_percent: profitMargin(trip.transporter_income, expenseTotal),
        fuel_efficiency_km_per_l: fuelEfficiencyKmPerLitre(trip.distance_km, trip.fuel_used_litres),
      },
    });
  } catch (err) { next(err); }
});

router.post('/:id/details', validate(validateTripDetails), async (req, res, next) => {
  try {
    const result = await tripModel.updateDetailsForUser(req.params.id, req.user.id, req.body);
    if (!result) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    if (result.locked) throw new AppError('Completed trips are read-only.', 409, 'TRIP_LOCKED');
    if (result.lockedRoute) throw new AppError('Route can only be changed before ignition starts.', 409, 'ROUTE_LOCKED');
    if (result.invalidRoute) throw new AppError('Invalid trip route.', 400, 'INVALID_ROUTE');
    dashboardSocket.emitToUser(req.user.id, 'trip:updated', result.trip);
    res.json({ success: true, data: result.trip });
  } catch (err) { next(err); }
});

router.put('/:id', validate(validateTripDetails), async (req, res, next) => {
  try {
    const result = await tripModel.updateDetailsForUser(req.params.id, req.user.id, req.body);
    if (!result) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    if (result.locked) throw new AppError('Completed trips are read-only.', 409, 'TRIP_LOCKED');
    if (result.lockedRoute) throw new AppError('Route can only be changed before ignition starts.', 409, 'ROUTE_LOCKED');
    if (result.invalidRoute) throw new AppError('Invalid trip route.', 400, 'INVALID_ROUTE');
    dashboardSocket.emitToUser(req.user.id, 'trip:updated', result.trip);
    res.json({ success: true, data: result.trip });
  } catch (err) { next(err); }
});

router.post('/:id/complete', async (req, res, next) => {
  try {
    const trip = await tripModel.completeForUser(req.params.id, req.user.id);
    if (!trip) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    dashboardSocket.emitToUser(req.user.id, 'trip:completed', trip);
    // Completing the trip removes its alerts from the active notification
    // count (they remain visible historically inside the Logbook).
    const count = await alertModel.countActiveUnacknowledged(req.user.id);
    dashboardSocket.emitToUser(req.user.id, 'notification:update', { count });
    res.json({ success: true, data: trip });
  } catch (err) { next(err); }
});

// --- Nested expenses --------------------------------------------------------

router.get('/:id/expenses', async (req, res, next) => {
  try {
    const trip = await tripModel.getByIdForUser(req.params.id, req.user.id);
    if (!trip) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    const expenses = await expenseModel.listForTrip(trip.id, req.user.id);
    res.json({ success: true, data: expenses });
  } catch (err) { next(err); }
});

router.post('/:id/expenses', validate(validateExpense), async (req, res, next) => {
  try {
    const expense = await expenseModel.create(req.params.id, req.user.id, req.body);
    if (!expense) throw new AppError('Trip not found or already completed.', 404, 'NOT_FOUND');
    const trip = await tripModel.getByIdForUser(req.params.id, req.user.id);
    dashboardSocket.emitToUser(req.user.id, 'trip:updated', trip);
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.get('/:id/telemetry', async (req, res, next) => {
  try {
    const trip = await tripModel.getByIdForUser(req.params.id, req.user.id);
    if (!trip) throw new AppError('Trip not found.', 404, 'NOT_FOUND');
    const rows = await telemetryModel.getForTrip(trip.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
