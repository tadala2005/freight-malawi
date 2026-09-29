const express = require('express');

const reportModel = require('../models/reportModel');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/fleet', async (req, res, next) => {
  try {
    const { from, to, vehicleId, status } = req.query;
    const summary = await reportModel.fleetSummary(req.user.id, { from, to, vehicleId, status });
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.get('/trips', async (req, res, next) => {
  try {
    const { from, to, vehicleId, status } = req.query;
    const rows = await reportModel.tripReportRows(req.user.id, { from, to, vehicleId, status });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
