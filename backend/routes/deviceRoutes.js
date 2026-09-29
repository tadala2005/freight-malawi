const express = require('express');

const vehicleModel = require('../models/vehicleModel');
const telemetryModel = require('../models/telemetryModel');
const { authMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { OFFLINE_THRESHOLD_SECONDS } = require('../services/notificationService');

const router = express.Router();
router.use(authMiddleware);

router.get('/:id/status', async (req, res, next) => {
  try {
    const vehicle = await vehicleModel.getByIdForUser(req.params.id, req.user.id);
    if (!vehicle) throw new AppError('Vehicle not found.', 404, 'NOT_FOUND');
    const latest = await telemetryModel.getLatestForVehicle(vehicle.id);
    res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        device_id: vehicle.device_id,
        status: vehicle.current_status,
        last_seen_at: vehicle.last_seen_at,
        offline_threshold_seconds: OFFLINE_THRESHOLD_SECONDS,
        last_reading: latest,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
