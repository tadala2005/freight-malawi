// ============================================================================
// Centralized error handler. Every response follows the same shape:
//   { success: false, error: { code: "...", message: "..." } }
//
// In production (NODE_ENV=production), a 5xx always returns the generic
// message below — internal details never reach the client. Outside
// production, the real err.message is returned instead, specifically so a
// misconfiguration (e.g. a missing JWT_SECRET, a bad SQL column name) is
// visible directly in the browser's Network tab / API response instead of
// being diagnosed blind. The full stack trace is always logged server-side
// regardless of environment.
// ============================================================================
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const isServerError = statusCode >= 500;
  const message = isServerError && isProduction ? 'An unexpected error occurred. Please try again.' : err.message;

  logger.error('Request error', {
    path: req.originalUrl,
    method: req.method,
    statusCode,
    code,
    message: err.message,
    stack: err.stack,
  });

  const body = { success: false, error: { code, message } };
  if (isServerError && !isProduction) {
    // Development-only hint: which layer actually threw. Never sent in production.
    body.devHint = 'NODE_ENV is not "production", so the real error message is shown above instead of a generic one. Check the backend terminal for the full stack trace.';
  }

  res.status(statusCode).json(body);
}

module.exports = { AppError, notFoundHandler, errorHandler };
