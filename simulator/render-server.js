
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const {
  startHardwareSimulator
} = require('./hardware-simulator');

const PORT =
  Number(process.env.PORT) || 10000;

const simulatorPath =
  path.join(__dirname, 'simulate.js');

let simulator = null;
let hardwareSimulator = null;

let shuttingDown = false;
let simulatorRunning = false;
let forceExitTimer = null;

// ============================================
// RENDER HEALTH ENDPOINT
// ============================================

const server = http.createServer(
  (req, res) => {
    if (
      req.url === '/' ||
      req.url === '/health'
    ) {
      const healthy =
        !shuttingDown &&
        simulatorRunning;

      res.writeHead(
        healthy ? 200 : 503,
        {
          'Content-Type':
            'application/json',

          'Cache-Control':
            'no-store'
        }
      );

      return res.end(
        JSON.stringify({
          service:
            'Freight Malawi Simulator',

          status:
            healthy
              ? 'ok'
              : 'unavailable',

          simulatorRunning,

          timestamp:
            new Date().toISOString()
        })
      );
    }

    res.writeHead(
      404,
      {
        'Content-Type':
          'application/json'
      }
    );

    res.end(
      JSON.stringify({
        error: 'Not found'
      })
    );
  }
);

// ============================================
// EXISTING THREE VEHICLES
// ============================================

function startSimulator() {
  console.log(
    'Starting Freight Malawi simulator...'
  );

  console.log(
    `Simulator script: ${simulatorPath}`
  );

  simulator = spawn(
    process.execPath,
    [simulatorPath],
    {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true
    }
  );

  simulatorRunning = true;

  simulator.on(
    'error',
    (error) => {
      simulatorRunning = false;

      console.error(
        'Failed to start simulator:',
        error
      );

      stopService(1);
    }
  );

  simulator.on(
    'exit',
    (code, signal) => {
      simulatorRunning = false;

      console.error(
        `Simulator exited. Code: ${code}, signal: ${signal}`
      );

      if (!shuttingDown) {
        console.error(
          'Stopping service so the host can restart it.'
        );

        stopService(1);
      }
    }
  );
}

// ============================================
// CLEAN SHUTDOWN
// ============================================

function stopService(exitCode = 0) {
  if (shuttingDown) return;

  shuttingDown = true;

  if (
    simulator &&
    simulatorRunning
  ) {
    simulator.kill('SIGTERM');
  }

  if (hardwareSimulator) {
    hardwareSimulator.stop();
  }

  forceExitTimer = setTimeout(
    () => {
      if (
        simulator &&
        simulatorRunning
      ) {
        simulator.kill('SIGKILL');
      }

      process.exit(exitCode);
    },
    10000
  );

  if (forceExitTimer.unref) {
    forceExitTimer.unref();
  }

  server.close(() => {
    if (forceExitTimer) {
      clearTimeout(forceExitTimer);
    }

    process.exit(exitCode);
  });
}

// ============================================
// START SERVICES
// ============================================

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Health server listening on port ${PORT}`
    );

    // Existing simulator remains unchanged.
    startSimulator();

    // Separate hybrid simulator for HW 0001.
    hardwareSimulator =
      startHardwareSimulator();
  }
);

process.on(
  'SIGTERM',
  () => stopService(0)
);

process.on(
  'SIGINT',
  () => stopService(0)
);
