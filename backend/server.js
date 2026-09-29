// ============================================================================
// FREIGHT MALAWI — API SERVER
// Express REST API + Socket.IO real-time layer.
// ============================================================================
const path = require('path');

// Load .env from the file sitting next to this file, NOT from
// process.cwd(). This matters because dotenv's default behaviour
// (`require('dotenv').config()`) only finds ".env" if the process was
// launched with its working directory set to backend/ — starting the
// server from the repo root, from an IDE "run" button, or via a script in
// a different folder will silently skip loading it. When that happens,
// every process.env.* read below returns undefined with NO error — the
// app keeps running, but with nothing configured.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

const { pool, checkDatabaseHealth, closePool } = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const tripRoutes = require('./routes/tripRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const alertRoutes = require('./routes/alertRoutes');
const reportRoutes = require('./routes/reportRoutes');
const deviceRoutes = require('./routes/deviceRoutes');

const { attachDashboardSocket } = require('./sockets/dashboardSocket');
const { attachDeviceSocket } = require('./sockets/deviceSocket');
const { startOfflineSweep } = require('./services/notificationService');

// --- Fail fast on missing configuration ------------------------------------
// A missing/unloaded .env is easy to miss: MySQL still "works" because
// config/db.js falls back to XAMPP-compatible defaults (localhost/root/no
// password), so registration and the /health check both look fine. There is
// intentionally NO fallback for JWT_SECRET (a hardcoded fallback would be a
// security hole), so without it every register/login call throws inside
// jwt.sign() and surfaces as a generic 500. Catch that here, once, loudly,
// instead of leaving it to be diagnosed request-by-request.
if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[FATAL] JWT_SECRET is not set.\n' +
    `  Expected a backend/.env file at: ${path.join(__dirname, '.env')}\n` +
    '  Fix: copy backend/.env.example to backend/.env and set JWT_SECRET to a long random string,\n' +
    '  then restart the backend (this must be run from a process whose behaviour you control,\n' +
    '  e.g. `cd backend && npm start` — not double-clicked from an unrelated working directory).\n',
  );
  process.exit(1);
}
if (process.env.JWT_SECRET === 'change_this_to_a_long_random_string_before_deploying') {
  // eslint-disable-next-line no-console
  console.warn('[WARN] JWT_SECRET is still the placeholder value from .env.example — fine for local demo use, but change it before deploying.');
}

const PORT = process.env.PORT || 5000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'] },
});

// --- Security & platform middleware ----------------------------------------
app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(generalLimiter);

// --- Health check ------------------------------------------------------------
app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    database: dbHealthy ? 'connected' : 'unavailable',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// --- API routes --------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/devices', deviceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// --- Sockets -------------------------------------------------------------
attachDashboardSocket(io);
attachDeviceSocket(io);

// --- Background jobs ---------------------------------------------------------
const offlineSweepHandle = startOfflineSweep(30000);

// --- Startup -------------------------------------------------------------
server.listen(PORT, async () => {
  const dbHealthy = await checkDatabaseHealth();
  logger.info(`Freight Malawi API listening on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development',
    databaseConnected: dbHealthy,
    corsOrigins: CORS_ORIGINS,
    envFile: path.join(__dirname, '.env'),
  });
  if (!dbHealthy) {
    logger.warn(`Started with database unavailable — check DB_CLIENT/DATABASE_URL (or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME for local MySQL) in .env`);
  }
});

// --- Graceful shutdown ---------------------------------------------------
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  clearInterval(offlineSweepHandle);
  io.close();
  server.close(async () => {
    await closePool();
    logger.info('Shutdown complete.');
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io, pool };
