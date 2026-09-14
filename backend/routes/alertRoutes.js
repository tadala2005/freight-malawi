const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { listForUser, acknowledgeForUser, countOpenForUser } = require('../models/alertModel');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const historical = String(req.query.historical || '').toLowerCase() === 'true';
  const alerts = await listForUser(req.user.id, { historical });
  const openCount = await countOpenForUser(req.user.id);
  res.json({ success: true, alerts, openCount });
}));

router.post('/:id/acknowledge', asyncHandler(async (req, res) => {
  const ok = await acknowledgeForUser(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Alert not found' });
  res.json({ success: true });
}));

module.exports = router;
