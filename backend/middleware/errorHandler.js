function logError(err, req) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ${req.method} ${req.originalUrl} -> ${err.message}`);
  if (err.stack) console.error(err.stack);
}

/**
 * Wraps an async Express handler so rejected promises are forwarded to next().
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Central error-handling middleware. Must be registered last, after all routes.
 * Never leaks raw stack traces to the client.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logError(err, req);
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, message });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { asyncHandler, errorHandler, notFound };
