// ============================================================================
// Rate limiters. Auth endpoints get a strict limit to slow brute-forcing;
// telemetry gets a more generous per-device-friendly limit since a fleet of
// vehicles may share a NAT/proxy IP in some deployments.
// ============================================================================
const rateLimit = require('express-rate-limit');

const jsonLimitResponse = (message) => (req, res) => {
  res.status(429).json({ success: false, error: { message, code: 'RATE_LIMITED' } });
};

// 20/15min in production; configurable (default 100/15min) outside production
// so local QA — including the deliberate repeated-attempt security tests —
// doesn't get locked out mid-session.
const isProduction = process.env.NODE_ENV === 'production';
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 20 : 100);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many attempts. Please wait a few minutes and try again.'),
});

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // supports several vehicles reporting every ~5s from one gateway
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Telemetry rate limit exceeded.'),
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitResponse('Too many requests. Please slow down.'),
});

module.exports = { authLimiter, telemetryLimiter, generalLimiter };
