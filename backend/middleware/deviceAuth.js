// ============================================================================
// Authenticates incoming telemetry from an ESP32 device or the simulator.
// A device_id alone is NEVER treated as a credential — every request must
// also present the matching device key (X-Device-Key header, or device_key
// in the JSON body as a fallback for constrained hardware). The key is
// compared against a bcrypt hash stored on the vehicle row.
// ============================================================================
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

async function deviceAuthMiddleware(req, res, next) {
  const deviceId = req.body && req.body.device_id;
  const deviceKey = req.headers['x-device-key'] || (req.body && req.body.device_key);

  if (!deviceId) {
    return res.status(400).json({ success: false, error: { message: 'device_id is required.', code: 'VALIDATION_ERROR' } });
  }
  if (!deviceKey) {
    return res.status(401).json({ success: false, error: { message: 'Device key is required.', code: 'DEVICE_AUTH_REQUIRED' } });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, user_id, name, license_plate, device_id, device_key_hash,
              fuel_tank_capacity, payload_capacity_kg, overspeed_threshold_kmh,
              idle_threshold_minutes, route_key, current_status
       FROM vehicles WHERE device_id = ? LIMIT 1`,
      [deviceId],
    );

    if (!rows.length || !rows[0].device_key_hash) {
      return res.status(401).json({ success: false, error: { message: 'Unknown or unauthorized device.', code: 'DEVICE_UNAUTHORIZED' } });
    }

    const vehicle = rows[0];
    const match = await bcrypt.compare(String(deviceKey), vehicle.device_key_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: { message: 'Unknown or unauthorized device.', code: 'DEVICE_UNAUTHORIZED' } });
    }

    req.vehicle = vehicle;
    return next();
  } catch (err) {
    logger.error('Device auth failure', { message: err.message });
    return res.status(500).json({ success: false, error: { message: 'Authentication error.', code: 'INTERNAL_ERROR' } });
  }
}

module.exports = { deviceAuthMiddleware };
