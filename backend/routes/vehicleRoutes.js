const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  createVehicle, findByDeviceId, findByIdForUser, listByUser, deleteByIdForUser,
} = require('../models/vehicleModel');
const { getHistory } = require('../models/telemetryModel');
const { buildReport } = require('../services/reportService');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const vehicles = await listByUser(req.user.id);
  res.json({ success: true, vehicles });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, licensePlate, driverName, fuelTankCapacity, deviceId } = req.body || {};

  if (!name || !licensePlate || !driverName || !fuelTankCapacity || !deviceId) {
    return res.status(400).json({
      success: false,
      message: 'name, licensePlate, driverName, fuelTankCapacity and deviceId are all required',
    });
  }
  if (Number.isNaN(Number(fuelTankCapacity)) || Number(fuelTankCapacity) <= 0) {
    return res.status(400).json({ success: false, message: 'fuelTankCapacity must be a positive number' });
  }

  const existing = await findByDeviceId(deviceId);
  if (existing) {
    return res.status(409).json({ success: false, message: `Device ID "${deviceId}" is already registered to a vehicle` });
  }

  const id = await createVehicle({
    userId: req.user.id,
    name,
    licensePlate,
    driverName,
    fuelTankCapacity: Number(fuelTankCapacity),
    deviceId,
  });

  res.status(201).json({ success: true, vehicleId: id });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid vehicle id' });
  }

  const deleted = await deleteByIdForUser(id, req.user.id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Vehicle not found' });
  }
  res.json({ success: true });
}));

router.get('/:id/history', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { start, end } = req.query;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid vehicle id' });
  }
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return res.status(400).json({ success: false, message: 'Valid start and end ISO dates are required' });
  }

  const vehicle = await findByIdForUser(id, req.user.id);
  if (!vehicle) {
    return res.status(404).json({ success: false, message: 'Vehicle not found' });
  }

  const rows = await getHistory(id, new Date(start), new Date(end));
  res.json({ success: true, vehicle, history: rows });
}));

router.get('/:id/report', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { start, end } = req.query;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid vehicle id' });
  }
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return res.status(400).json({ success: false, message: 'Valid start and end ISO dates are required' });
  }

  const vehicle = await findByIdForUser(id, req.user.id);
  if (!vehicle) {
    return res.status(404).json({ success: false, message: 'Vehicle not found' });
  }

  const report = await buildReport(vehicle, new Date(start), new Date(end));
  res.json({ success: true, report });
}));

module.exports = router;
