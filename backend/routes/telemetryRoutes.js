const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { processTelemetry } = require('../services/telemetryProcessor');

const router = express.Router();

// POST /api/telemetry/device
// Used directly by the ESP32 firmware (via HTTP POST) and can also be used
// by any telemetry source that prefers plain HTTP over Socket.IO.
router.post('/device', asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  try {
    const result = await processTelemetry(req.body);
    const { vehicle, alerts } = result;

    if (io) {
      io.to(`user_${vehicle.user_id}`).emit('vehicle:update', {
        vehicleId: vehicle.id,
        deviceId: vehicle.device_id,
        ...req.body,
      });
      alerts.forEach((alert) => {
        io.to(`user_${vehicle.user_id}`).emit('alert:new', alert);
      });
      if (result.tripCreated && result.trip) {
        io.to(`user_${vehicle.user_id}`).emit('trip:created', result.trip);
      }
      if (result.tripCompleted) {
        io.to(`user_${vehicle.user_id}`).emit('trip:completed', result.tripCompleted);
      }
    }

    const primaryAlert = alerts[0];
    res.json({
      success: true,
      alert: alerts.length > 0,
      message: primaryAlert ? primaryAlert.message : 'Telemetry recorded',
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message, details: err.details });
    }
    throw err;
  }
}));

module.exports = router;
