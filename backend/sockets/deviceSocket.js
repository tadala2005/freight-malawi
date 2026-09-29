const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { validateTelemetry } = require('../utils/validators');
const { processTelemetry } = require('../services/telemetryProcessor');
const telemetryModel = require('../models/telemetryModel');
const tripModel = require('../models/tripModel');
const logger = require('../utils/logger');

const connectedDevices = new Map();

async function authenticateDevice(deviceId, deviceKey) {
  if (!deviceId || !deviceKey) return null;
  const [rows] = await pool.execute(
    `SELECT id, user_id, name, license_plate, device_id, device_key_hash,
            fuel_tank_capacity, payload_capacity_kg, overspeed_threshold_kmh,
            idle_threshold_minutes, route_key, current_status
     FROM vehicles WHERE device_id = ? LIMIT 1`,
    [deviceId],
  );
  if (!rows.length || !rows[0].device_key_hash) return null;
  const match = await bcrypt.compare(String(deviceKey), rows[0].device_key_hash);
  return match ? rows[0] : null;
}

function sendIgnitionCommand(vehicleId, command) {
  const socket = connectedDevices.get(String(vehicleId));
  if (!socket || !socket.connected) return false;
  socket.emit('control:ignition', command);
  return true;
}

function getConnectedVehicleIds() {
  return [...connectedDevices.keys()];
}

function attachDeviceSocket(io) {
  const nsp = io.of('/device');

  nsp.use(async (socket, next) => {
    try {
      const { deviceId, deviceKey } = socket.handshake.auth || {};
      const vehicle = await authenticateDevice(deviceId, deviceKey);
      if (!vehicle) return next(new Error('DEVICE_UNAUTHORIZED'));
      socket.vehicle = vehicle;
      return next();
    } catch (err) {
      logger.error('Device socket authentication failure', { message: err.message });
      return next(new Error('DEVICE_AUTH_ERROR'));
    }
  });

  nsp.on('connection', async (socket) => {
    const vehicleId = String(socket.vehicle.id);
    const oldSocket = connectedDevices.get(vehicleId);
    if (oldSocket && oldSocket.id !== socket.id) oldSocket.disconnect(true);
    connectedDevices.set(vehicleId, socket);

    logger.info('Device socket connected', { vehicleId: socket.vehicle.id, deviceId: socket.vehicle.device_id });

    try {
      const [latest, activeTrip] = await Promise.all([
        telemetryModel.getLatestForVehicle(socket.vehicle.id),
        tripModel.getActiveForVehicle(socket.vehicle.id),
      ]);
      socket.emit('device:state', { reading: latest, trip: activeTrip });
    } catch (err) {
      logger.error('Unable to send device bootstrap state', { message: err.message, vehicleId: socket.vehicle.id });
    }

    socket.on('telemetry', async (payload, ack) => {
      const result = validateTelemetry({ ...payload, device_id: socket.vehicle.device_id });
      if (!result.valid) {
        if (typeof ack === 'function') ack({ success: false, message: result.errors.join(' ') });
        return;
      }
      try {
        const outcome = await processTelemetry(socket.vehicle, payload);
        if (outcome?.vehicle) socket.vehicle = { ...socket.vehicle, ...outcome.vehicle };
        if (typeof ack === 'function') ack({ success: true, duplicate: !!outcome.duplicate });
      } catch (err) {
        logger.error('Device socket telemetry processing failed', { message: err.message });
        if (typeof ack === 'function') ack({ success: false, message: 'Processing error.' });
      }
    });

    socket.on('disconnect', () => {
      if (connectedDevices.get(vehicleId)?.id === socket.id) connectedDevices.delete(vehicleId);
      logger.debug('Device socket disconnected', { vehicleId: socket.vehicle.id });
    });
  });

  return nsp;
}

module.exports = { attachDeviceSocket, sendIgnitionCommand, getConnectedVehicleIds };
