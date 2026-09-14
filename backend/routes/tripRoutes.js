const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const trips = require('../models/tripModel');
const { activateTrip, completeTrip, buildReport } = require('../services/tripService');

const router = express.Router();
router.use(requireAuth);

function numeric(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw Object.assign(new Error(`${field} is required`), { status: 400 });
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${field} must be a non-negative number`), { status: 400 });
  return n;
}

router.get('/', asyncHandler(async (req, res) => {
  const tripsList = await trips.listForUser(req.user.id, {
    status: req.query.status || '',
    vehicleId: req.query.vehicleId || '',
    search: req.query.search || '',
    start: req.query.start || '',
    end: req.query.end || '',
  });
  res.json({ success: true, trips: tripsList });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  const expenses = await trips.listExpenses(trip.id);
  const report = await buildReport(trip.id, req.user.id);
  res.json({ success: true, trip, expenses, report });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updated = await trips.updateForUser(req.params.id, req.user.id, {
    origin: body.origin?.trim(),
    destination: body.destination?.trim(),
    cargoType: body.cargoType?.trim(),
    cargoDescription: body.cargoDescription?.trim(),
    cargoWeightKg: numeric(body.cargoWeightKg, 'cargoWeightKg'),
    plannedDistanceKm: numeric(body.plannedDistanceKm, 'plannedDistanceKm'),
    agreedPayment: numeric(body.agreedPayment, 'agreedPayment'),
    fuelPricePerLitre: numeric(body.fuelPricePerLitre, 'fuelPricePerLitre'),
    notes: body.notes?.trim(),
  });
  if (!updated) return res.status(400).json({ success: false, message: 'Trip could not be updated' });

  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (trip.status === 'PENDING_LOG') await trips.activateForUser(req.params.id, req.user.id);
  const result = await trips.getByIdForUser(req.params.id, req.user.id);
  const io = req.app.get('io');
  if (io) io.to(`user_${req.user.id}`).emit('trip:updated', result);
  res.json({ success: true, trip: result });
}));

router.post('/:id/complete', asyncHandler(async (req, res) => {
  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  const result = await completeTrip(trip.id, req.user.id, {
    completedAt: req.body?.completedAt || new Date(),
    latitude: req.body?.latitude ?? null,
    longitude: req.body?.longitude ?? null,
    fuelEndLitres: req.body?.fuelEndLitres !== undefined ? numeric(req.body.fuelEndLitres, 'fuelEndLitres') : null,
    routeCompleted: true,
  });
  const io = req.app.get('io');
  if (io) io.to(`user_${req.user.id}`).emit('trip:completed', result);
  res.json({ success: true, report: result });
}));

router.post('/:id/expenses', asyncHandler(async (req, res) => {
  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  if (!['PENDING_LOG', 'ACTIVE'].includes(trip.status)) return res.status(400).json({ success: false, message: 'Expenses can only be recorded for open trips' });
  const categories = ['FUEL', 'TOLL', 'DRIVER_ALLOWANCE', 'LOADING', 'UNLOADING', 'MAINTENANCE', 'REPAIR', 'ACCOMMODATION', 'FOOD', 'OTHER'];
  if (!categories.includes(req.body?.category)) return res.status(400).json({ success: false, message: 'Invalid expense category' });
  const amount = numeric(req.body?.amount, 'amount', { required: true });
  if (amount <= 0) return res.status(400).json({ success: false, message: 'amount must be greater than 0' });
  const id = await trips.addExpense(trip.id, {
    category: req.body.category,
    description: req.body.description?.trim(),
    amount,
    recordedAt: req.body.recordedAt || new Date(),
  });
  const io = req.app.get('io');
  if (io) io.to(`user_${req.user.id}`).emit('trip:updated', await trips.getByIdForUser(trip.id, req.user.id));
  res.status(201).json({ success: true, expenseId: id });
}));

router.put('/:id/expenses/:expenseId', asyncHandler(async (req, res) => {
  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  const amount = numeric(req.body?.amount, 'amount', { required: true });
  if (amount <= 0) return res.status(400).json({ success: false, message: 'amount must be greater than 0' });
  const ok = await trips.updateExpense(trip.id, req.params.expenseId, {
    category: req.body.category,
    description: req.body.description?.trim(),
    amount,
    recordedAt: req.body.recordedAt || new Date(),
  });
  if (!ok) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true });
}));

router.delete('/:id/expenses/:expenseId', asyncHandler(async (req, res) => {
  const trip = await trips.getByIdForUser(req.params.id, req.user.id);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  const ok = await trips.deleteExpense(trip.id, req.params.expenseId);
  if (!ok) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true });
}));

router.get('/:id/report', asyncHandler(async (req, res) => {
  const report = await buildReport(req.params.id, req.user.id);
  res.json({ success: true, report });
}));

module.exports = router;
