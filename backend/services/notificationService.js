// ============================================================================
// Periodic device-offline sweep. Real connection status only — a vehicle is
// marked OFFLINE purely because its last telemetry is older than the
// configured threshold, never faked.
// ============================================================================
const { pool } = require('../config/db');
const alertService = require('./alertService');
const dashboardSocket = require('../sockets/dashboardSocket');
const logger = require('../utils/logger');

const OFFLINE_THRESHOLD_SECONDS = Number(process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS || 60);

async function sweepOfflineDevices() {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, name, license_plate FROM vehicles
       WHERE current_status <> 'OFFLINE'
         AND device_id IS NOT NULL
         AND (last_seen_at IS NULL OR last_seen_at < (NOW() - INTERVAL ? SECOND))`,
      [OFFLINE_THRESHOLD_SECONDS],
    );

    for (const vehicle of rows) {
      await pool.execute("UPDATE vehicles SET current_status = 'OFFLINE' WHERE id = ?", [vehicle.id]);
      dashboardSocket.emitToUser(vehicle.user_id, 'device:status', { vehicle_id: vehicle.id, status: 'OFFLINE' });
      await alertService.raiseAlert({
        userId: vehicle.user_id,
        vehicleId: vehicle.id,
        tripId: null,
        category: 'SYSTEM',
        type: 'DEVICE_OFFLINE',
        severity: 'MEDIUM',
        message: `${vehicle.name} (${vehicle.license_plate}) has stopped transmitting telemetry.`,
      });
    }
  } catch (err) {
    logger.error('Offline sweep failed', { message: err.message });
  }
}

function startOfflineSweep(intervalMs = 30000) {
  return setInterval(sweepOfflineDevices, intervalMs);
}

module.exports = { sweepOfflineDevices, startOfflineSweep, OFFLINE_THRESHOLD_SECONDS };
