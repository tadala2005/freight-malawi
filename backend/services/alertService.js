const alertModel = require('../models/alertModel');
const dashboardSocket = require('../sockets/dashboardSocket');

/**
 * Persists an alert, then broadcasts alert:new plus a fresh notification
 * badge count to the owning user's dashboard sockets in real time.
 */
async function raiseAlert({ userId, vehicleId, tripId, category, type, severity, message, meta }) {
  const alert = await alertModel.createAlert({ userId, vehicleId, tripId, category, type, severity, message, meta });
  dashboardSocket.emitToUser(userId, 'alert:new', alert);
  const count = await alertModel.countActiveUnacknowledged(userId);
  dashboardSocket.emitToUser(userId, 'notification:update', { count });
  return alert;
}

async function acknowledgeAlert(alertId, userId) {
  const alert = await alertModel.acknowledge(alertId, userId);
  if (!alert) return null;
  dashboardSocket.emitToUser(userId, 'alert:updated', alert);
  const count = await alertModel.countActiveUnacknowledged(userId);
  dashboardSocket.emitToUser(userId, 'notification:update', { count });
  return alert;
}

async function recordDriverEvent({ vehicleId, tripId, eventType, severity, speedKmh, details }) {
  return alertModel.createDriverEvent({ vehicleId, tripId, eventType, severity, speedKmh, details });
}

module.exports = { raiseAlert, acknowledgeAlert, recordDriverEvent };
