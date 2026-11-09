
'use strict';

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

const {
  pool,
  checkDatabaseHealth,
  closePool
} = require('./config/db');

const {
  generalLimiter
} = require('./middleware/rateLimit');

const {
  notFoundHandler,
  errorHandler
} = require('./middleware/errorHandler');

const logger = require('./utils/logger');

const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const tripRoutes = require('./routes/tripRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const alertRoutes = require('./routes/alertRoutes');
const reportRoutes = require('./routes/reportRoutes');
const deviceRoutes = require('./routes/deviceRoutes');

const {
  attachDashboardSocket
} = require('./sockets/dashboardSocket');

const {
  attachDeviceSocket
} = require('./sockets/deviceSocket');

const {
  startOfflineSweep
} = require('./services/notificationService');

if (!process.env.JWT_SECRET?.trim()) {
  console.error('[FATAL] JWT_SECRET missing');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;

const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://localhost:5174'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST']
  },
  transports: ['polling', 'websocket'],
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6
});

// Security middleware
app.use(helmet());

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

app.use(compression());

app.use(express.json({
  limit: '256kb'
}));

// Hardware requests have their own authenticated
// per-vehicle limiter in deviceRoutes.js.
app.use((req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/api/devices/fuel'
  ) {
    return next();
  }

  return generalLimiter(req, res, next);
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const healthy = await checkDatabaseHealth();

    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      database: healthy ? 'connected' : 'unavailable',
      version: '2.1.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'degraded',
      database: 'unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/devices', deviceRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Real-time connections
attachDashboardSocket(io);
attachDeviceSocket(io);

// Vehicle availability checks
const offlineSweepHandle = startOfflineSweep(30000);

server.listen(PORT, async () => {
  const healthy = await checkDatabaseHealth();

  logger.info(
    `Freight Malawi API listening on port ${PORT}`,
    {
      databaseConnected: healthy,
      environment: process.env.NODE_ENV || 'development'
    }
  );

  if (!healthy) {
    logger.warn(
      'Database unavailable. Check DATABASE_URL.'
    );
  }
});

function shutdown(signal) {
  logger.info(`${signal} received`);

  clearInterval(offlineSweepHandle);

  io.close();

  server.close(async () => {
    try {
      await closePool();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = {
  app,
  server,
  io,
  pool
};
