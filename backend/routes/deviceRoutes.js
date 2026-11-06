
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

const router = express.Router();

const DEVICE_ID = 'ESP32-HW-001';
const MAX_SAMPLE_AGE_MS = 20000;

// For a single Render backend instance.
// Only the latest physical sensor reading is cached.
const fuelReadings = new Map();

function requireHardware(req, res, next) {
  if (req.vehicle?.device_id !== DEVICE_ID) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'HARDWARE_ONLY',
        message: 'Not a hardware fuel device.'
      }
    });
  }

  next();
}

// ESP32 sends ONLY real fuel data.
// POST /api/devices/fuel

router.post(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  (req, res) => {
    const fuelPercent =
      Number(req.body?.fuel_percent);

    if (
      req.body?.fuel_percent === undefined ||
      !Number.isFinite(fuelPercent) ||
      fuelPercent < 0 ||
      fuelPercent > 100
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
      fuel_percent:
        Math.round(fuelPercent * 100) / 100,
      observed_at:
        new Date().toISOString()
    };

    fuelReadings.set(
      String(req.vehicle.id),
      reading
    );

    return res.status(201).json({
      success: true,
      data: reading
    });
  }
);

// Hybrid simulator retrieves latest physical fuel.
// GET /api/devices/fuel

router.get(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  (req, res) => {
    const reading = fuelReadings.get(
      String(req.vehicle.id)
    );

    const ageMs = reading
      ? Date.now() -
        new Date(reading.observed_at).getTime()
      : null;

    res.set('Cache-Control', 'no-store');

    res.json({
      success: true,
      data: {
        fuel_percent:
          reading?.fuel_percent ?? null,

        observed_at:
          reading?.observed_at ?? null,

        age_seconds:
          ageMs === null
            ? null
            : Math.max(
                0,
                Math.floor(ageMs / 1000)
              ),

        fresh:
          ageMs !== null &&
          ageMs <= MAX_SAMPLE_AGE_MS
      }
    });
  }
);

// Keep the original manager endpoint protected.
router.use(authMiddleware);

router.get(
  '/:id/status',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
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

      const latest =
        await telemetryModel.getLatestForVehicle(
          vehicle.id
        );

      res.json({
        success: true,
        data: {
          vehicle_id: vehicle.id,
          device_id: vehicle.device_id,
          status: vehicle.current_status,
          last_seen_at: vehicle.last_seen_at,
          offline_threshold_seconds:
            OFFLINE_THRESHOLD_SECONDS,
          last_reading: latest
        }
      });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
