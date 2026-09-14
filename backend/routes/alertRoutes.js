const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { listForUser, acknowledgeForUser } = require('../models/alertModel');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const alerts = await listForUser(req.user.id);
  res.json({ success: true, alerts });
}));

router.post('/:id/acknowledge', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: 'Invalid alert id' });
  }

  const updated = await acknowledgeForUser(id, req.user.id);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  res.json({ success: true });
}));

module.exports = router;
