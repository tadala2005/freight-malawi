const jwt = require('jsonwebtoken');

/**
 * Protects REST routes. Expects: Authorization: Bearer <token>
 * On success attaches req.user = { id, username, email }
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Missing or malformed authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, username: payload.username, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * Verifies a raw JWT string (used by the Socket.IO dashboard namespace,
 * which cannot use Express middleware directly).
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { requireAuth, verifyToken };
