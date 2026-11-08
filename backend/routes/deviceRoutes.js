'use strict';

const express = require('express');
const { pool } = require('../config/db');
const vehicleModel = require('../models/vehicleModel');
const telemetryModel = require('../models/telemetryModel');

const {
  deviceAuthMiddleware
} = require('../middleware/deviceAuth');

const {
  telemetryLimiter
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

const DEVICE = 'ESP32-HW-001';
const FRESH_MS = 10000;

function requireHardware(req, res, next) {
  if (req.vehicle.device_id !== DEVICE) {
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

  const age = row
    ? Date.now() - new Date(row.observed_at).getTime()
    : Infinity;

  const percent = row?.fuel_percent == null
    ? null
    : Number(row.fuel_percent);

  return {
    vehicle_id: vehicle.id,
    device_id: vehicle.device_id,
    fuel_percent: percent,

    fuel_level_litres: percent === null
      ? null
      : Number(
          (
            percent *
            Number(vehicle.fuel_tank_capacity) /
            100
          ).toFixed(2)
        ),

    observed_at: row?.observed_at || null,

    age_seconds: Number.isFinite(age)
      ? Math.max(0, Math.floor(age / 1000))
      : null,

    fresh:
      percent !== null &&
      age >= 0 &&
      age <= FRESH_MS
  };
}

router.post(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  async (req, res, next) => {
    try {
      const raw = req.body?.fuel_percent;
      const invalidSensor = req.body?.sensor_valid === false;

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
          'fuel_percent must be a number between 0 and 100.',
          400,
          'INVALID_FUEL'
        );
      }

      const percent = invalidSensor
        ? null
        : Number(raw.toFixed(2));

      await pool.execute(
        `INSERT INTO hardware_fuel
           (vehicle_id, fuel_percent, observed_at)
         VALUES (?, ?, NOW())
         ON CONFLICT (vehicle_id) DO UPDATE
         SET fuel_percent = EXCLUDED.fuel_percent,
             observed_at = EXCLUDED.observed_at`,
        [req.vehicle.id, percent]
      );

      const data = await getReading(req.vehicle);

      emitToUser(
        req.vehicle.user_id,
        'hardware:fuel',
        data
      );

      res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/fuel',
  telemetryLimiter,
  deviceAuthMiddleware,
  requireHardware,
  async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');

      res.json({
        success: true,
        data: await getReading(req.vehicle)
      });
    } catch (error) {
      next(error);
    }
  }
);

router.use(authMiddleware);

router.get('/:id/fuel', async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(
      req.params.id,
      req.user.id
    );

    if (!vehicle || vehicle.device_id !== DEVICE) {
      throw new AppError(
        'Hardware vehicle not found.',
        404,
        'NOT_FOUND'
      );
    }

    res.set('Cache-Control', 'no-store');

    res.json({
      success: true,
      data: await getReading(vehicle)
    });
  } catch (error) {
    next(error);
  }
});

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

    res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        device_id: vehicle.device_id,
        status: vehicle.current_status,
        last_seen_at: vehicle.last_seen_at,
        offline_threshold_seconds: OFFLINE_THRESHOLD_SECONDS,
        last_reading:
          await telemetryModel.getLatestForVehicle(vehicle.id)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
