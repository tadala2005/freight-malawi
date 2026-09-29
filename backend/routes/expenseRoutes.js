const express = require('express');

const expenseModel = require('../models/expenseModel');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateExpense } = require('../utils/validators');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authMiddleware);

router.put('/:id', validate(validateExpense), async (req, res, next) => {
  try {
    const expense = await expenseModel.update(req.params.id, req.user.id, req.body);
    if (!expense) throw new AppError('Expense not found.', 404, 'NOT_FOUND');
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await expenseModel.remove(req.params.id, req.user.id);
    if (!deleted) throw new AppError('Expense not found.', 404, 'NOT_FOUND');
    res.json({ success: true, data: { id: Number(req.params.id) } });
  } catch (err) { next(err); }
});

module.exports = router;
