
'use strict';

const alertModel = require('../models/alertModel');

const dashboardSocket =
  require('../sockets/dashboardSocket');

const logger = require('../utils/logger');

const {
  sendCriticalAlert
} = require('./externalAlertService');

/**
 * Create an alert, update the dashboard,
 * and dispatch external notifications
 * when severity is CRITICAL.
 */
async function raiseAlert({
  userId,
  vehicleId,
  tripId,
  category,
  type,
  severity,
  message,
  meta
}) {
  // Save the alert in Supabase.
  const alert = await alertModel.createAlert({
    userId,
    vehicleId,
    tripId,
    category,
    type,
    severity,
    message,
    meta,
  });

  // Update dashboard in real time.
  dashboardSocket.emitToUser(
    userId,
    'alert:new',
    alert
  );

  // Update notification badge.
  const count =
    await alertModel.countActiveUnacknowledged(userId);

  dashboardSocket.emitToUser(
    userId,
    'notification:update',
    { count }
  );

  // Send external notifications for critical incidents.
  if (
    String(severity || '').toUpperCase() === 'CRITICAL'
  ) {
    // Email/SMS failures must never stop
    // vehicle telemetry processing.
    void sendCriticalAlert(alert, userId)
      .catch((error) => {
        logger.error(
          'Critical alert dispatch failed',
          {
            alertId: alert.id,
            message: error.message,
          }
        );
      });
  }

  return alert;
}

/**
 * Acknowledge an alert.
 */
async function acknowledgeAlert(alertId, userId) {
  const alert = await alertModel.acknowledge(
    alertId,
    userId
  );

  if (!alert) return null;

  dashboardSocket.emitToUser(
    userId,
    'alert:updated',
    alert
  );

  const count =
    await alertModel.countActiveUnacknowledged(userId);

  dashboardSocket.emitToUser(
    userId,
    'notification:update',
    { count }
  );

  return alert;
}

/**
 * Store driver behaviour events.
 */
async function recordDriverEvent({
  vehicleId,
  tripId,
  eventType,
  severity,
  speedKmh,
  details
}) {
  return alertModel.createDriverEvent({
    vehicleId,
    tripId,
    eventType,
    severity,
    speedKmh,
    details,
  });
}

module.exports = {
  raiseAlert,
  acknowledgeAlert,
  recordDriverEvent,
};
