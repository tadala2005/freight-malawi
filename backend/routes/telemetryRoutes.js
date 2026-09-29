const express = require('express');

const { deviceAuthMiddleware } = require('../middleware/deviceAuth');
const { telemetryLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validation');
const { validateTelemetry } = require('../utils/validators');
const { processTelemetry } = require('../services/telemetryProcessor');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/telemetry/device — used by both the ESP32 hardware and the simulator.
router.post('/device', telemetryLimiter, deviceAuthMiddleware, validate(validateTelemetry), async (req, res, next) => {
  try {
    const result = await processTelemetry(req.vehicle, req.body);
    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      data: {
        duplicate: !!result.duplicate,
        vehicle_status: result.vehicle ? result.vehicle.current_status : undefined,
        trip_id: result.trip ? result.trip.id : null,
        trip_status: result.trip ? result.trip.status : null,
        alerts_raised: (result.alerts || []).map((a) => ({ type: a.type, severity: a.severity })),
      },
    });
  } catch (err) {
    logger.error('Telemetry processing error', { message: err.message });
    next(err);
  }
});

module.exports = router;
