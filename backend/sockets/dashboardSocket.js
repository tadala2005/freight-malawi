const { verifyToken } = require('../middleware/auth');

/**
 * Registers dashboard real-time behaviour on the default ("/") namespace.
 * Clients connect with: io(URL, { auth: { token } })
 * Each authenticated socket joins a room `user_<id>` so telemetry/alerts
 * are only broadcast to the owning user's dashboards.
 */
function registerDashboardSocket(io) {
  io.use((socket, next) => {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const payload = verifyToken(token);
      socket.user = payload;
      return next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const room = `user_${socket.user.id}`;
    socket.join(room);
    console.log(`[${new Date().toISOString()}] Dashboard connected: ${socket.user.username} (room ${room})`);

    socket.on('disconnect', () => {
      console.log(`[${new Date().toISOString()}] Dashboard disconnected: ${socket.user.username}`);
    });
  });
}

module.exports = { registerDashboardSocket };
