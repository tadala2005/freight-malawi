const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const {
  validateTelemetry,
} = require('../utils/validators');
const {
  processTelemetry,
} = require('../services/telemetryProcessor');
const telemetryModel =
  require('../models/telemetryModel');
const tripModel =
  require('../models/tripModel');
const logger =
  require('../utils/logger');

const connectedDevices =
  new Map();

async function authenticateDevice(
  deviceId,
  deviceKey,
) {
  if (
    !deviceId ||
    !deviceKey
  ) {
    return null;
  }

  const [rows] =
    await pool.execute(
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
      [deviceId],
    );

  if (
    !rows.length ||
    !rows[0]
      .device_key_hash
  ) {
    return null;
  }

  const match =
    await bcrypt.compare(
      String(deviceKey),
      rows[0]
        .device_key_hash,
    );

  return match
    ? rows[0]
    : null;
}

/**
 * Sends an ignition command to the connected simulator/device.
 *
 * Returns true only when a live device socket exists.
 */
function sendIgnitionCommand(
  vehicleId,
  command,
) {
  const socket =
    connectedDevices.get(
      String(vehicleId),
    );

  if (
    !socket ||
    !socket.connected
  ) {
    return false;
  }

  socket.emit(
    'control:ignition',
    command,
  );

  return true;
}

function isDeviceConnected(
  vehicleId,
) {
  const socket =
    connectedDevices.get(
      String(vehicleId),
    );

  return Boolean(
    socket &&
      socket.connected,
  );
}

function getConnectedVehicleIds() {
  return [
    ...connectedDevices.keys(),
  ];
}

function attachDeviceSocket(
  io,
) {
  const namespace =
    io.of('/device');

  namespace.use(
    async (
      socket,
      next,
    ) => {
      try {
        const {
          deviceId,
          deviceKey,
        } =
          socket.handshake
            .auth || {};

        const vehicle =
          await authenticateDevice(
            deviceId,
            deviceKey,
          );

        if (!vehicle) {
          return next(
            new Error(
              'DEVICE_UNAUTHORIZED',
            ),
          );
        }

        socket.vehicle =
          vehicle;

        return next();
      } catch (error) {
        logger.error(
          'Device socket authentication failure',
          {
            message:
              error.message,
          },
        );

        return next(
          new Error(
            'DEVICE_AUTH_ERROR',
          ),
        );
      }
    },
  );

  namespace.on(
    'connection',
    async (socket) => {
      const vehicleId =
        String(
          socket.vehicle.id,
        );

      const oldSocket =
        connectedDevices.get(
          vehicleId,
        );

      if (
        oldSocket &&
        oldSocket.id !==
          socket.id
      ) {
        oldSocket.disconnect(
          true,
        );
      }

      connectedDevices.set(
        vehicleId,
        socket,
      );

      logger.info(
        'Device socket connected',
        {
          vehicleId:
            socket.vehicle.id,

          deviceId:
            socket.vehicle
              .device_id,
        },
      );

      try {
        const [
          latest,
          activeTrip,
        ] =
          await Promise.all(
            [
              telemetryModel.getLatestForVehicle(
                socket.vehicle
                  .id,
              ),

              tripModel.getActiveForVehicle(
                socket.vehicle
                  .id,
              ),
            ],
          );

        socket.emit(
          'device:state',
          {
            reading:
              latest,

            trip:
              activeTrip,
          },
        );
      } catch (error) {
        logger.error(
          'Unable to send device bootstrap state',
          {
            message:
              error.message,

            vehicleId:
              socket.vehicle
                .id,
          },
        );
      }

      socket.on(
        'telemetry',
        async (
          payload,
          ack,
        ) => {
          const validation =
            validateTelemetry(
              {
                ...payload,
                device_id:
                  socket.vehicle
                    .device_id,
              },
            );

          if (
            !validation.valid
          ) {
            if (
              typeof ack ===
              'function'
            ) {
              ack({
                success:
                  false,

                message:
                  validation
                    .errors
                    .join(
                      ' ',
                    ),
              });
            }

            return;
          }

          try {
            const outcome =
              await processTelemetry(
                socket.vehicle,
                payload,
              );

            if (
              outcome?.vehicle
            ) {
              socket.vehicle =
                {
                  ...socket.vehicle,

                  ...outcome.vehicle,
                };
            }

            if (
              typeof ack ===
              'function'
            ) {
              ack({
                success:
                  true,

                duplicate:
                  Boolean(
                    outcome?.duplicate,
                  ),

                vehicleId:
                  socket.vehicle
                    .id,
              });
            }
          } catch (error) {
            logger.error(
              'Device socket telemetry processing failed',
              {
                message:
                  error.message,

                vehicleId:
                  socket.vehicle
                    .id,
              },
            );

            if (
              typeof ack ===
              'function'
            ) {
              ack({
                success:
                  false,

                message:
                  'Telemetry processing error.',
              });
            }
          }
        },
      );

      socket.on(
        'disconnect',
        (reason) => {
          if (
            connectedDevices.get(
              vehicleId,
            )?.id ===
            socket.id
          ) {
            connectedDevices.delete(
              vehicleId,
            );
          }

          logger.debug(
            'Device socket disconnected',
            {
              vehicleId:
                socket.vehicle
                  .id,

              reason,
            },
          );
        },
      );
    },
  );

  return namespace;
}

module.exports = {
  attachDeviceSocket,
  sendIgnitionCommand,
  isDeviceConnected,
  getConnectedVehicleIds,
};