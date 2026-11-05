
'use strict';

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

/**
 * Authenticate simulator and ESP32 devices.
 *
 * Supports:
 * - X-Device-ID header
 * - X-Device-Key header
 * - device_id in JSON body (backward compatibility)
 * - device_key in JSON body (backward compatibility)
 *
 * Authentication is always verified against the bcrypt hash
 * stored in the vehicles table.
 */
async function deviceAuthMiddleware(req, res, next) {
  const body = req.body || {};

  const deviceId = String(
    req.get('X-Device-ID') ||
    body.device_id ||
    ''
  ).trim();

  const deviceKey =
    req.get('X-Device-Key') ||
    body.device_key;

  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Device ID is required.',
        code: 'VALIDATION_ERROR'
      }
    });
  }

  if (!deviceKey) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Device key is required.',
        code: 'DEVICE_AUTH_REQUIRED'
      }
    });
  }

  try {
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

    if (
      !rows.length ||
      !rows[0].device_key_hash
    ) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Unknown or unauthorized device.',
          code: 'DEVICE_UNAUTHORIZED'
        }
      });
    }

    const vehicle = rows[0];

    const isValid = await bcrypt.compare(
      String(deviceKey),
      vehicle.device_key_hash
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Unknown or unauthorized device.',
          code: 'DEVICE_UNAUTHORIZED'
        }
      });
    }

    req.vehicle = vehicle;

    return next();

  } catch (error) {
    logger.error('Device authentication failure', {
      deviceId,
      message: error.message
    });

    return res.status(500).json({
      success: false,
      error: {
        message: 'Device authentication failed.',
        code: 'INTERNAL_ERROR'
      }
    });
  }
}

module.exports = {
  deviceAuthMiddleware
};
