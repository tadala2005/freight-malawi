const express = require('express');

const alertModel = require('../models/alertModel');
const alertService = require('../services/alertService');
const { authMiddleware } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const { scope, category, severity, vehicleId, tripId, acknowledged, from, to, limit } = req.query;
    const parsedAck = acknowledged === undefined ? undefined : acknowledged === 'true';
    const alerts = await alertModel.listForUser(req.user.id, {
      scope, category, severity, vehicleId, tripId, acknowledged: parsedAck, from, to, limit,
    });
    res.json({ success: true, data: alerts });
  } catch (err) { next(err); }
});

router.get('/badge', async (req, res, next) => {
  try {
    const [count, latest] = await Promise.all([
      alertModel.countActiveUnacknowledged(req.user.id),
      alertModel.listActiveForBell(req.user.id, 10),
    ]);
    res.json({ success: true, data: { count, latest } });
  } catch (err) { next(err); }
});

router.post('/:id/acknowledge', async (req, res, next) => {
  try {
    const alert = await alertService.acknowledgeAlert(req.params.id, req.user.id);
    if (!alert) throw new AppError('Alert not found.', 404, 'NOT_FOUND');
    res.json({ success: true, data: alert });
  } catch (err) { next(err); }
});

module.exports = router;
