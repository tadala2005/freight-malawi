
'use strict';

const rateLimit = require('express-rate-limit');

const respondWithLimit = (message) => (req, res) => {
  return res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message
    }
  });
};

const production = process.env.NODE_ENV === 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) ||
       (production ? 20 : 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: respondWithLimit(
    'Too many authentication attempts.'
  )
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: respondWithLimit(
    'Too many requests.'
  )
});

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: respondWithLimit(
    'Telemetry rate limit exceeded.'
  )
});

// Apply only AFTER deviceAuthMiddleware.
const hardwareFuelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (!req.vehicle?.id) {
      throw new Error(
        'Hardware limiter requires authenticated vehicle'
      );
    }

    return `hardware:${req.vehicle.id}`;
  },
  handler: respondWithLimit(
    'Hardware telemetry rate limit exceeded.'
  )
});

module.exports = {
  authLimiter,
  generalLimiter,
  telemetryLimiter,
  hardwareFuelLimiter
};
