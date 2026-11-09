
'use strict';

const express = require('express');

const {
  pool
} = require('../config/db');

const vehicleModel = require('../models/vehicleModel');
const telemetryModel = require('../models/telemetryModel');

const {
  deviceAuthMiddleware
} = require('../middleware/deviceAuth');

const {
  hardwareFuelLimiter
} = require('../middleware/rateLimit');

const {
  authMiddleware
} = require('../middleware/auth');

const {
  AppError
} = require('../middleware/errorHandler');

const {
  OFFLINE_THRESHOLD_SECONDS
} = require('../services/notificationService');

const {
  emitToUser
} = require('../sockets/dashboardSocket');

const router = express.Router();

const HARDWARE_DEVICE_ID = 'ESP32-HW-001';
const FRESH_MS = 20000;

function requireHardware(req, res, next) {
  if (
    !req.vehicle ||
    req.vehicle.device_id !== HARDWARE_DEVICE_ID
  ) {
    return next(
      new AppError(
        'Hardware device required.',
        403,
        'HARDWARE_ONLY'
      )
    );
  }

  next();
}

async function getReading(vehicle) {
  const [rows] = await pool.execute(
    `SELECT fuel_percent, observed_at
     FROM hardware_fuel
     WHERE vehicle_id = ?`,
    [vehicle.id]
  );

  const row = rows[0];

  const percentage =
    row?.fuel_percent == null
      ? null
      : Number(row.fuel_percent);

  const timestamp = row?.observed_at || null;

  const age = timestamp
    ? Date.now() - new Date(timestamp).getTime()
    : Infinity;

  const fresh =
    percentage !== null &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= FRESH_MS;

  const capacity = Number(
    vehicle.fuel_tank_capacity
  );

  return {
    vehicle_id: vehicle.id,
    device_id: vehicle.device_id,
    fuel_percent: percentage,

    fuel_level_litres:
      percentage === null
        ? null
        : Number(
            (
              percentage * capacity / 100
            ).toFixed(2)
          ),

    observed_at: timestamp,

    age_seconds:
      Number.isFinite(age)
        ? Math.max(0, Math.floor(age / 1000))
        : null,

    fresh
  };
}

// ===========================================
// ESP32 UPLOAD
// ===========================================

router.post(
  '/fuel',
  deviceAuthMiddleware,
  requireHardware,
  hardwareFuelLimiter,
  async (req, res, next) => {
    try {
      const invalidSensor =
        req.body?.sensor_valid === false;

      const raw = req.body?.fuel_percent;

      if (
        !invalidSensor &&
        (
          typeof raw !== 'number' ||
          !Number.isFinite(raw) ||
          raw < 0 ||
          raw > 100
        )
      ) {
        throw new AppError(
          'fuel_percent must be between 0 and 100.',
          400,
          'INVALID_FUEL'
        );
      }

      const percentage = invalidSensor
        ? null
        : Number(raw.toFixed(2));

      await pool.execute(
        `INSERT INTO hardware_fuel
          (vehicle_id, fuel_percent, observed_at)
         VALUES (?, ?, NOW())
         ON CONFLICT (vehicle_id)
         DO UPDATE SET
           fuel_percent = EXCLUDED.fuel_percent,
           observed_at = EXCLUDED.observed_at`,
        [
          req.vehicle.id,
          percentage
        ]
      );

      const data = await getReading(req.vehicle);

      emitToUser(
        req.vehicle.user_id,
        'hardware:fuel',
        data
      );

      return res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// SIMULATOR SENSOR POLLING
// ===========================================

router.get(
  '/fuel',
  deviceAuthMiddleware,
  requireHardware,
  hardwareFuelLimiter,
  async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');

      return res.json({
        success: true,
        data: await getReading(req.vehicle)
      });
    } catch (error) {
      next(error);
    }
  }
);

// Dashboard endpoints require user JWT
router.use(authMiddleware);

// ===========================================
// DASHBOARD HARDWARE FUEL
// ===========================================

router.get('/:id/fuel', async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(
      req.params.id,
      req.user.id
    );

    if (
      !vehicle ||
      vehicle.device_id !== HARDWARE_DEVICE_ID
    ) {
      throw new AppError(
        'Hardware vehicle not found.',
        404,
        'NOT_FOUND'
      );
    }

    res.set('Cache-Control', 'no-store');

    return res.json({
      success: true,
      data: await getReading(vehicle)
    });
  } catch (error) {
    next(error);
  }
});

// ===========================================
// DEVICE STATUS
// ===========================================

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

    return res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        device_id: vehicle.device_id,
        status: vehicle.current_status,
        last_seen_at: vehicle.last_seen_at,
        offline_threshold_seconds:
          OFFLINE_THRESHOLD_SECONDS,
        last_reading:
          await telemetryModel.getLatestForVehicle(
            vehicle.id
          )
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
