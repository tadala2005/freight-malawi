
'use strict';

const bcrypt = require('bcryptjs');

const { pool } = require('../config/db');

const {
  validateTelemetry
} = require('../utils/validators');

const {
  processTelemetry
} = require('../services/telemetryProcessor');

const telemetryModel =
  require('../models/telemetryModel');

const tripModel =
  require('../models/tripModel');

const logger =
  require('../utils/logger');

const connectedDevices = new Map();

async function authenticateDevice(deviceId, deviceKey) {
  if (!deviceId || !deviceKey) {
    return null;
  }

  const [rows] = await pool.execute(
    `SELECT
       id,
       user_id,
       name,
       license_plate,
       device_id,
       device_key_hash,
       fuel_tank_capacity,
       payload_capacity_kg,
       overspeed_threshold_kmh,
       idle_threshold_minutes,
       route_key,
       current_status
     FROM vehicles
     WHERE device_id = ?
     LIMIT 1`,
    [deviceId]
  );

  if (!rows.length || !rows[0].device_key_hash) {
    return null;
  }

  const match = await bcrypt.compare(
    String(deviceKey),
    rows[0].device_key_hash
  );

  return match ? rows[0] : null;
}

function sendIgnitionCommand(vehicleId, command) {
  const socket = connectedDevices.get(
    String(vehicleId)
  );

  if (!socket?.connected) {
    return false;
  }

  socket.emit('control:ignition', command);

  return true;
}

function isDeviceConnected(vehicleId) {
  const socket = connectedDevices.get(
    String(vehicleId)
  );

  return Boolean(socket?.connected);
}

function getConnectedVehicleIds() {
  return [...connectedDevices.keys()];
}

function attachDeviceSocket(io) {
  const namespace = io.of('/device');

  namespace.use(async (socket, next) => {
    try {
      const {
        deviceId,
        deviceKey
      } = socket.handshake.auth || {};

      const vehicle = await authenticateDevice(
        deviceId,
        deviceKey
      );

      if (!vehicle) {
        return next(
          new Error('DEVICE_UNAUTHORIZED')
        );
      }

      socket.vehicle = vehicle;

      return next();
    } catch (error) {
      logger.error(
        'Device authentication failure',
        {
          message: error.message,
          code: error.code || null
        }
      );

      return next(
        new Error('DEVICE_AUTH_ERROR')
      );
    }
  });

  namespace.on('connection', async (socket) => {
    const vehicleId = String(
      socket.vehicle.id
    );

    const previousSocket =
      connectedDevices.get(vehicleId);

    if (
      previousSocket &&
      previousSocket.id !== socket.id
    ) {
      previousSocket.disconnect(true);
    }

    connectedDevices.set(
      vehicleId,
      socket
    );

    logger.info(
      'Device socket connected',
      {
        vehicleId: socket.vehicle.id,
        deviceId: socket.vehicle.device_id
      }
    );

    // Restore existing simulator state
    try {
      const [latest, activeTrip] =
        await Promise.all([
          telemetryModel.getLatestForVehicle(
            socket.vehicle.id
          ),
          tripModel.getActiveForVehicle(
            socket.vehicle.id
          )
        ]);

      socket.emit('device:state', {
        reading: latest,
        trip: activeTrip
      });
    } catch (error) {
      logger.error(
        'Device state restoration failed',
        {
          vehicleId: socket.vehicle.id,
          message: error.message,
          code: error.code || null,
          stack: error.stack
        }
      );

      socket.emit('device:state', {
        reading: null,
        trip: null
      });
    }

    socket.on('telemetry', async (payload, ack) => {
      const reply = (data) => {
        if (typeof ack === 'function') {
          ack(data);
        }
      };

      try {
        const validation = validateTelemetry({
          ...payload,
          device_id: socket.vehicle.device_id
        });

        if (!validation.valid) {
          const message =
            validation.errors.join(' ');

          logger.warn(
            'Telemetry validation failed',
            {
              deviceId: socket.vehicle.device_id,
              vehicleId: socket.vehicle.id,
              message
            }
          );

          reply({
            success: false,
            code: 'VALIDATION_ERROR',
            message
          });

          return;
        }

        const outcome = await processTelemetry(
          socket.vehicle,
          payload
        );

        if (outcome?.vehicle) {
          socket.vehicle = {
            ...socket.vehicle,
            ...outcome.vehicle
          };
        }

        reply({
          success: true,
          duplicate: Boolean(
            outcome?.duplicate
          ),
          vehicleId: socket.vehicle.id
        });
      } catch (error) {
        const code =
          error.code || 'TELEMETRY_ERROR';

        logger.error(
          'TELEMETRY_PROCESSING_FAILED',
          {
            deviceId: socket.vehicle.device_id,
            vehicleId: socket.vehicle.id,
            code,
            message: error.message,
            detail: error.detail || null,
            constraint: error.constraint || null,
            table: error.table || null,
            stack: error.stack
          }
        );

        // Expected application validation failures
        // can safely return their message.
        const status = Number(
          error.statusCode || error.status
        );

        const clientMessage =
          status >= 400 && status < 500
            ? error.message
            : 'Backend telemetry processing failed. Check backend Render logs.';

        reply({
          success: false,
          code: status >= 400 && status < 500
            ? code
            : 'TELEMETRY_PROCESSING_FAILED',
          message: clientMessage
        });
      }
    });

    socket.on('disconnect', (reason) => {
      if (
        connectedDevices.get(vehicleId)?.id ===
        socket.id
      ) {
        connectedDevices.delete(vehicleId);
      }

      logger.info(
        'Device socket disconnected',
        {
          vehicleId: socket.vehicle.id,
          reason
        }
      );
    });
  });

  return namespace;
}

module.exports = {
  attachDeviceSocket,
  sendIgnitionCommand,
  isDeviceConnected,
  getConnectedVehicleIds
};
