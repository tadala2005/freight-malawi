const express = require('express');
const jwt = require('jsonwebtoken');

const userModel = require('../models/userModel');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateRegister, validateLogin } = require('../utils/validators');
const { authLimiter } = require('../middleware/rateLimit');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '7d',
  });
}

router.post('/register', authLimiter, validate(validateRegister), async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const existingUsername = await userModel.findByUsername(username);
    if (existingUsername) {
      throw new AppError('That username is already taken.', 409, 'USERNAME_TAKEN');
    }
    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
      throw new AppError('That email is already registered.', 409, 'EMAIL_TAKEN');
    }

    const user = await userModel.createUser({ username, email, password });
    const token = signToken(user);
    res.status(201).json({ success: true, data: { token, user } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, validate(validateLogin), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await userModel.findByUsername(username);
    if (!user) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }
    const valid = await userModel.verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid username or password.', 401, 'INVALID_CREDENTIALS');
    }
    const token = signToken(user);
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, email: user.email } } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
