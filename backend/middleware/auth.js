// ============================================================================
// Verifies the JWT on protected REST routes and attaches req.user = { id, username }.
// Ownership is still enforced separately at the query level in every model —
// this middleware only proves *who* is asking.
// ============================================================================
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: { message: 'Authentication token is required.', code: 'AUTH_REQUIRED' } });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json({ success: false, error: { message: 'Invalid or expired session. Please log in again.', code } });
  }
}

/** Verifies a JWT for Socket.IO dashboard connections. Returns payload or null. */
function verifySocketToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { authMiddleware, verifySocketToken };
