const express = require('express');

const vehicleModel = require('../models/vehicleModel');
const telemetryModel = require('../models/telemetryModel');
const alertModel = require('../models/alertModel');
const reportModel = require('../models/reportModel');
const tripModel = require('../models/tripModel');

const {
  authMiddleware,
} = require('../middleware/auth');

const {
  validate,
} = require('../middleware/validation');

const {
  validateVehicle,
} = require('../utils/validators');

const {
  AppError,
} = require('../middleware/errorHandler');

const {
  sendIgnitionCommand,
} = require('../sockets/deviceSocket');

const router =
  express.Router();

router.use(
  authMiddleware,
);

// ---------------------------------------------------------------------------
// VEHICLE LIST
// ---------------------------------------------------------------------------

router.get(
  '/',
  async (req, res, next) => {
    try {
      const vehicles =
        await vehicleModel.listByUser(
          req.user.id,
        );

      const latestReadings =
        await telemetryModel.getLatestForVehicles(
          vehicles.map(
            (vehicle) =>
              vehicle.id,
          ),
        );

      const byVehicle =
        new Map(
          latestReadings.map(
            (reading) => [
              reading.vehicle_id,
              reading,
            ],
          ),
        );

      const activeTrips =
        await Promise.all(
          vehicles.map(
            (vehicle) =>
              tripModel.getActiveForVehicle(
                vehicle.id,
              ),
          ),
        );

      const enriched =
        vehicles.map(
          (vehicle, index) => ({
            ...vehicle,

            latest_telemetry:
              byVehicle.get(
                vehicle.id,
              ) || null,

            active_trip:
              activeTrips[index] ||
              null,
          }),
        );

      res.json({
        success: true,
        data: enriched,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// CREATE VEHICLE
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate(validateVehicle),
  async (req, res, next) => {
    try {
      const existingByDevice =
        req.body.device_id
          ? await vehicleModel.getByDeviceId(
              req.body.device_id,
            )
          : null;

      if (existingByDevice) {
        throw new AppError(
          'That device ID is already assigned to a vehicle.',
          409,
          'DEVICE_ID_TAKEN',
        );
      }

      const vehicle =
        await vehicleModel.create(
          req.user.id,
          req.body,
        );

      res.status(201).json({
        success: true,
        data: vehicle,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// IGNITION CONTROL
//
// Dashboard starts/stops the physical/simulated ignition.
// A trip must already be prepared in the Logbook.
// ---------------------------------------------------------------------------

router.post(
  '/:id/ignition',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
          req.params.id,
          req.user.id,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      const ignitionOn =
        !!req.body?.ignition_on;

      const trip =
        await tripModel.getActiveForVehicle(
          vehicle.id,
        );

      if (ignitionOn) {
        if (!trip) {
          throw new AppError(
            'Create and prepare a trip in the Logbook before starting the ignition.',
            409,
            'TRIP_REQUIRED',
          );
        }

        if (
          trip.status ===
          'ROUTE_COMPLETED'
        ) {
          throw new AppError(
            'This trip has reached its destination. Complete it before starting the ignition again.',
            409,
            'TRIP_AT_DESTINATION',
          );
        }

        if (
          trip.status ===
            'COMPLETED' ||
          trip.status ===
            'CANCELLED'
        ) {
          throw new AppError(
            'Create a new trip in the Logbook first.',
            409,
            'TRIP_REQUIRED',
          );
        }

        if (!vehicle.device_id) {
          throw new AppError(
            'This vehicle has no device ID.',
            400,
            'DEVICE_NOT_CONFIGURED',
          );
        }
      }

      const sent =
        sendIgnitionCommand(
          vehicle.id,
          {
            ignition_on:
              ignitionOn,

            trip_id:
              trip?.id ||
              null,

            route_key:
              trip?.route_key ||
              null,

            cargo_weight_kg:
              trip?.cargo_weight_kg ??
              null,

            new_trip:
              ignitionOn &&
              trip?.status ===
                'PENDING_DETAILS',
          },
        );

      if (!sent) {
        throw new AppError(
          'The vehicle device is offline. Start the simulator or reconnect the device first.',
          409,
          'DEVICE_OFFLINE',
        );
      }

      res.json({
        success: true,

        data: {
          accepted: true,

          ignition_on:
            ignitionOn,

          vehicle_id:
            vehicle.id,

          trip_id:
            trip?.id ||
            null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// SINGLE VEHICLE
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
          req.params.id,
          req.user.id,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      const [
        latest,
        activeTrip,
        behaviour,
      ] =
        await Promise.all([
          telemetryModel.getLatestForVehicle(
            vehicle.id,
          ),

          tripModel.getActiveForVehicle(
            vehicle.id,
          ),

          alertModel.driverBehaviourScoreForVehicle(
            vehicle.id,
          ),
        ]);

      res.json({
        success: true,

        data: {
          ...vehicle,

          latest_telemetry:
            latest,

          active_trip:
            activeTrip,

          behaviour_indicator:
            behaviour,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// UPDATE VEHICLE
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  validate(
    validateVehicle,
    {
      partial: true,
    },
  ),
  async (req, res, next) => {
    try {
      if (req.body.device_id) {
        const existingByDevice =
          await vehicleModel.getByDeviceId(
            req.body.device_id,
          );

        if (
          existingByDevice &&
          String(
            existingByDevice.id,
          ) !==
            String(
              req.params.id,
            )
        ) {
          throw new AppError(
            'That device ID is already assigned to a vehicle.',
            409,
            'DEVICE_ID_TAKEN',
          );
        }
      }

      const vehicle =
        await vehicleModel.update(
          req.params.id,
          req.user.id,
          req.body,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      res.json({
        success: true,
        data: vehicle,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE VEHICLE
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  async (req, res, next) => {
    try {
      const deleted =
        await vehicleModel.remove(
          req.params.id,
          req.user.id,
        );

      if (!deleted) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      res.json({
        success: true,

        data: {
          id: Number(
            req.params.id,
          ),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// VEHICLE TELEMETRY
// ---------------------------------------------------------------------------

router.get(
  '/:id/telemetry',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
          req.params.id,
          req.user.id,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      const {
        from,
        to,
        tripId,
        limit,
      } = req.query;

      const rows =
        await telemetryModel.getHistory(
          vehicle.id,
          {
            from,
            to,
            tripId,
            limit,
          },
        );

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// HISTORY MAP DATA
// ---------------------------------------------------------------------------

router.get(
  '/:id/history',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
          req.params.id,
          req.user.id,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      const {
        from,
        to,
        tripId,
        limit,
      } = req.query;

      const rows =
        await telemetryModel.getHistory(
          vehicle.id,
          {
            from,
            to,
            tripId,
            limit:
              limit ||
              3000,
          },
        );

      const points =
        rows.map(
          (reading) => ({
            lat: Number(
              reading.latitude,
            ),

            lng: Number(
              reading.longitude,
            ),

            speed: Number(
              reading.speed,
            ),

            fuel_percent:
              Number(
                reading.fuel_percent,
              ),

            fuel_level_litres:
              Number(
                reading.fuel_level_litres,
              ),

            recorded_at:
              reading.recorded_at,

            ignition_on:
              !!reading.ignition_on,
          }),
        );

      res.json({
        success: true,

        data: {
          vehicle_id:
            vehicle.id,

          points,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// VEHICLE REPORT
// ---------------------------------------------------------------------------

router.get(
  '/:id/report',
  async (req, res, next) => {
    try {
      const vehicle =
        await vehicleModel.getByIdForUser(
          req.params.id,
          req.user.id,
        );

      if (!vehicle) {
        throw new AppError(
          'Vehicle not found.',
          404,
          'NOT_FOUND',
        );
      }

      const {
        from,
        to,
      } = req.query;

      const report =
        await reportModel.vehicleReport(
          vehicle.id,
          req.user.id,
          {
            from,
            to,
          },
        );

      res.json({
        success: true,
        data: report,
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;