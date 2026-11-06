
'use strict';

const express = require('express');
const vehicleModel = require('../models/vehicleModel');
const telemetryModel = require('../models/telemetryModel');
const { deviceAuthMiddleware } = require('../middleware/deviceAuth');
const { telemetryLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const {
  OFFLINE_THRESHOLD_SECONDS
} = require('../services/notificationService');
const { emitToUser } = require('../sockets/dashboardSocket');

const router = express.Router();

const HARDWARE_DEVICE_ID = 'ESP32-HW-001';
const SENSOR_FRESH_MS = 20000;

// Single-instance cache for the physical fuel monitor.
// The ESP32 sends fuel readings without changing vehicle
// ignition, speed, location or trip status.
const fuelReadings = new Map();

function requireHardware(req, res, next) {
  if (req.vehicle?.device_id !== HARDWARE_DEVICE_ID) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'HARDWARE_ONLY',
        message: 'This endpoint accepts the hardware fuel device only.'
      }
    });
  }

  next();
}

function getReading(vehicleId) {
  const reading = fuelReadings.get(String(vehicleId));

  if (!reading) {
    return {
      fuel_percent: null,
      observed_at: null,
      age_seconds: null,
      fresh: false
    };
  }

  const age = Date.now() - Date.parse(reading.observed_at);

  return {
    ...reading,
    age_seconds: Math.max(0, Math.floor(age / 1000)),
    fresh: age >= 0 && age <= SENSOR_FRESH_MS
  };
}

// =====================================================
// ESP32: POST THE ACTUAL ULTRASONIC FUEL READING
// POST /api/devices/fuel
// =====================================================

router.post(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  (req, res) => {
    const raw = req.body?.fuel_percent;
    const percentage = Number(raw);

    if (
      raw === undefined ||
      raw === null ||
      raw === '' ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FUEL',
          message: 'fuel_percent must be between 0 and 100.'
        }
      });
    }

    const reading = {
      fuel_percent: Math.round(percentage * 100) / 100,
      observed_at: new Date().toISOString()
    };

    fuelReadings.set(String(req.vehicle.id), reading);

    const capacity = Number(req.vehicle.fuel_tank_capacity) || 0;

    // Notify only the vehicle owner's dashboard.
    emitToUser(req.vehicle.user_id, 'hardware:fuel', {
      vehicle_id: req.vehicle.id,
      device_id: req.vehicle.device_id,
      fuel_percent: reading.fuel_percent,
      fuel_level_litres:
        Math.round(reading.fuel_percent * capacity) / 100,
      observed_at: reading.observed_at,
      fresh: true
    });

    return res.status(201).json({
      success: true,
      data: reading
    });
  }
);

// =====================================================
// HYBRID SIMULATOR: READ THE SENSOR FUEL
// GET /api/devices/fuel
// =====================================================

router.get(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    return res.json({
      success: true,
      data: getReading(req.vehicle.id)
    });
  }
);

// All remaining routes use normal manager login.
router.use(authMiddleware);

// =====================================================
// DASHBOARD: READ SENSOR FUEL INDEPENDENT OF IGNITION
// GET /api/devices/:id/fuel
// =====================================================

router.get('/:id/fuel', async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(
      req.params.id,
      req.user.id
    );

    if (!vehicle) {
      throw new AppError(
        'Vehicle not found.',
        404,
        'NOT_FOUND'
      );
    }

    if (vehicle.device_id !== HARDWARE_DEVICE_ID) {
      throw new AppError(
        'This vehicle has no physical fuel sensor.',
        404,
        'NOT_FOUND'
      );
    }

    const reading = getReading(vehicle.id);
    const capacity = Number(vehicle.fuel_tank_capacity) || 0;

    res.set('Cache-Control', 'no-store');

    return res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        device_id: vehicle.device_id,
        fuel_percent: reading.fuel_percent,
        fuel_level_litres:
          reading.fuel_percent === null
            ? null
            : Math.round(reading.fuel_percent * capacity) / 100,
        observed_at: reading.observed_at,
        age_seconds: reading.age_seconds,
        fresh: reading.fresh
      }
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// ORIGINAL VEHICLE STATUS ENDPOINT — PRESERVED
// GET /api/devices/:id/status
// =====================================================

router.get('/:id/status', async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(
      req.params.id,
      req.user.id
    );

    if (!vehicle) {
      throw new AppError(
        'Vehicle not found.',
        404,
        'NOT_FOUND'
      );
    }

    const latest = await telemetryModel.getLatestForVehicle(
      vehicle.id
    );

    return res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        device_id: vehicle.device_id,
        status: vehicle.current_status,
        last_seen_at: vehicle.last_seen_at,
        offline_threshold_seconds: OFFLINE_THRESHOLD_SECONDS,
        last_reading: latest
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
