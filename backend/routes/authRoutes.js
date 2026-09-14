const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { createUser, findByUsername, findByEmail, findById } = require('../models/userModel');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );
}

router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'username, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const existingUsername = await findByUsername(username);
  if (existingUsername) {
    return res.status(409).json({ success: false, message: 'Username already taken' });
  }
  const existingEmail = await findByEmail(email);
  if (existingEmail) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = await createUser({ username, email, passwordHash });
  const user = { id, username, email };
  const token = signToken(user);

  res.status(201).json({ success: true, token, user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'username and password are required' });
  }

  const user = await findByUsername(username);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  const token = signToken(user);
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, email: user.email },
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, user });
}));

module.exports = router;
