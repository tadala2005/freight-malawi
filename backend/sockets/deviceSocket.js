const { findByDeviceId } = require('../models/vehicleModel');
const { processTelemetry } = require('../services/telemetryProcessor');

/**
 * Registers the /device namespace.
 * Devices (ESP32 hardware or the Node simulator) connect with:
 *   io("http://localhost:5000/device", { query: { deviceId: "ESP32-001" } })
 *
 * Unknown device IDs are rejected at connection time.
 */
function registerDeviceSocket(io) {
  const deviceNamespace = io.of('/device');

  deviceNamespace.use(async (socket, next) => {
    const { deviceId } = socket.handshake.query;
    if (!deviceId) {
      return next(new Error('deviceId is required to connect'));
    }
    try {
      const vehicle = await findByDeviceId(deviceId);
      if (!vehicle) {
        return next(new Error(`Unknown device: ${deviceId}`));
      }
      socket.deviceId = deviceId;
      socket.vehicle = vehicle;
      return next();
    } catch (err) {
      return next(new Error('Device authentication failed'));
    }
  });

  deviceNamespace.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] Device connected: ${socket.deviceId}`);

    socket.on('telemetry', async (payload, ack) => {
      try {
        const fullPayload = { ...payload, deviceId: socket.deviceId };
        const { vehicle, alerts } = await processTelemetry(fullPayload);

        io.to(`user_${vehicle.user_id}`).emit('vehicle:update', {
          vehicleId: vehicle.id,
          deviceId: vehicle.device_id,
          ...fullPayload,
        });

        alerts.forEach((alert) => {
          io.to(`user_${vehicle.user_id}`).emit('alert:new', alert);
        });

        if (typeof ack === 'function') {
          ack({ success: true, alert: alerts.length > 0, alerts });
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Telemetry error from ${socket.deviceId}: ${err.message}`);
        if (typeof ack === 'function') {
          ack({ success: false, message: err.message });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[${new Date().toISOString()}] Device disconnected: ${socket.deviceId}`);
    });
  });
}

module.exports = { registerDeviceSocket };
