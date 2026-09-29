// ============================================================================
// Dashboard-facing Socket.IO namespace ("/"). Every connecting client must
// present a valid JWT (same one used for REST auth) via the connection
// `auth` payload. Clients are placed in a room scoped to their user id so
// telemetry/alerts/trip events are only ever broadcast to their owner —
// never to the whole fleet or other tenants.
// ============================================================================
const { verifySocketToken } = require('../middleware/auth');
const logger = require('../utils/logger');

let ioRef = null;

function userRoom(userId) {
  return `user_${userId}`;
}

function attachDashboardSocket(io) {
  ioRef = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    const payload = verifySocketToken(token);
    if (!payload) return next(new Error('INVALID_TOKEN'));
    socket.userId = payload.sub;
    return next();
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.userId));
    logger.info('Dashboard socket connected', { userId: socket.userId, socketId: socket.id });

    socket.on('disconnect', () => {
      logger.debug('Dashboard socket disconnected', { userId: socket.userId, socketId: socket.id });
    });
  });

  return io;
}

/** Broadcasts an event to every dashboard client belonging to a given user. */
function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  ioRef.to(userRoom(userId)).emit(event, payload);
}

module.exports = { attachDashboardSocket, emitToUser, userRoom };
