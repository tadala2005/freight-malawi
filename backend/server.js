require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { verifyConnection } = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { registerDeviceSocket } = require('./sockets/deviceSocket');
const { registerDashboardSocket } = require('./sockets/dashboardSocket');

const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const alertRoutes = require('./routes/alertRoutes');
const tripRoutes = require('./routes/tripRoutes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = String(process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsOrigin(origin, callback) {
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error('Origin not allowed by CORS'));
}

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});
app.set('io', io);

registerDashboardSocket(io);
registerDeviceSocket(io);

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'freight-malawi-backend', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/trips', tripRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await verifyConnection();
    server.listen(PORT, HOST, () => {
      console.log(`[${new Date().toISOString()}] Server listening on ${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

start();
