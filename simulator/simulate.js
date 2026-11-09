'use strict';

const crypto = require('crypto');
const { io } = require('socket.io-client');

const {
  totalDistanceKm,
  positionAtDistance
} = require('./routes');

const scenarios = require('./scenarios');
const config = require('./config.json');

const BACKEND_URL = String(
  process.env.BACKEND_URL ||
  process.env.SIMULATOR_BACKEND_URL ||
  config.backendUrl
).replace(/\/$/, '');

const INTERVAL_MS = Math.max(
  1000,
  Number(
    process.env.TELEMETRY_INTERVAL_MS ||
    config.telemetryIntervalMs
  ) || 2000
);

const TIME_SCALE = 1;
const SECRET = String(process.env.DEVICE_KEY_SECRET || '').trim();

const clamp = (v, a, b) =>
  Math.max(a, Math.min(b, v));

function deriveDeviceKey(secret, deviceId) {
  return crypto
    .createHmac('sha256', String(secret))
    .update(`freight-malawi/device-key/v1/${deviceId}`)
    .digest('base64url');
}

function resolveDeviceKey(cfg) {
  return SECRET
    ? deriveDeviceKey(SECRET, cfg.deviceId)
    : String(cfg.deviceKey || '');
}

function fuelConsumptionLPer100Km({
  speedKmh,
  cargoWeightKg,
  payloadCapacityKg,
  scenario,
  progressFraction
}) {
  const tonnes =
    Math.max(0, Number(cargoWeightKg) || 0) / 1000;

  const load =
    tonnes /
    (Math.max(1, Number(payloadCapacityKg) || 12000) / 1000);

  let rate = 30 + tonnes * 0.45;

  if (load > 1) rate += (load - 1) * 8;
  if (speedKmh > 75) rate += Math.min(5, (speedKmh - 75) * 0.08);
  if (speedKmh > 0 && speedKmh < 45) rate += 1.5;

  if (
    progressFraction >= 0.55 &&
    progressFraction <= 0.78
  ) {
    rate *= 1.05;
  }

  if (scenario === 'AGGRESSIVE_DRIVER') rate += 1.5;
  if (scenario === 'OVERSPEEDING') rate += 1;

  return clamp(rate, 28, 43);
}

class VehicleSimulator {
  constructor(cfg) {
    this.cfg = cfg;
    this.routeKey = null;
    this.progressKm = 0;
    this.odometerKm = 12000;
    this.engineHours = 0;
    this.tankCapacity = Number(cfg.tankCapacity) || 400;

    this.fuelLitres =
      scenarios.initialFuelPercent(cfg.scenario) *
      this.tankCapacity / 100;

    this.cargoWeightKg =
      scenarios.cargoWeightForScenario(
        cfg.scenario,
        cfg.payloadCapacity,
        cfg.cargoWeightKg
      );

    this.ignitionOn = false;
    this.pendingInitialTelemetry = false;
    this.tickIndex = 0;
    this.state = {};
    this.lastKnownPosition = null;
    this.bootstrapped = false;
    this.inFlight = false;
    this.lastTickAt = null;
    this.lastSentAt = 0;
    this.lastStartedTrip = null;

    this.log = (...args) =>
      console.log(`[${cfg.licensePlate}]`, ...args);
  }

  connect() {
    this.socket = io(`${BACKEND_URL}/device`, {
      auth: {
        deviceId: this.cfg.deviceId,
        deviceKey: this.cfg.deviceKey
      },

      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      this.log('Connected; restoring vehicle state.');
    });

    this.socket.on(
      'device:state',
      ({ reading, trip } = {}) => {
        if (reading) {
          this.lastKnownPosition = {
            lat: Number(reading.latitude),
            lng: Number(reading.longitude),
            heading: Number(reading.heading) || 0
          };

          this.odometerKm = Number(reading.odometer_km) || 0;
          this.engineHours = Number(reading.engine_hours) || 0;

          this.fuelLitres = clamp(
            Number(reading.fuel_level_litres) || 0,
            0,
            this.tankCapacity
          );

          this.ignitionOn =
            Boolean(reading.ignition_on) &&
            trip?.status === 'ACTIVE';

          this.state.currentSpeedKmh =
            Number(reading.speed) || 0;
        }

        this.routeKey =
          trip?.status !== 'PENDING_DETAILS'
            ? trip?.route_key || null
            : null;

        this.progressKm =
          trip?.start_odometer_km != null
            ? Math.max(
                0,
                this.odometerKm -
                Number(trip.start_odometer_km)
              )
            : 0;

        if (this.routeKey) {
          this.progressKm = Math.min(
            this.progressKm,
            totalDistanceKm(this.routeKey)
          );
        }

        if (trip?.cargo_weight_kg != null) {
          this.cargoWeightKg =
            scenarios.cargoWeightForScenario(
              this.cfg.scenario,
              this.cfg.payloadCapacity,
              trip.cargo_weight_kg
            );
        }

        if (trip?.status === 'ACTIVE') {
          this.lastStartedTrip = String(trip.id);

          // Do not repeat staged incidents after a process restart.
          if (!this.state.fuelStop) {
            this.state.eventDone = true;
          }
        }

        this.lastTickAt = Date.now();
        this.bootstrapped = true;
        this.tick();
      }
    );

    this.socket.on('control:ignition', command => {
      if (typeof command?.ignition_on !== 'boolean') return;

      if (command.route_key) {
        this.routeKey = command.route_key;
      }

      if (command.cargo_weight_kg != null) {
        this.cargoWeightKg =
          scenarios.cargoWeightForScenario(
            this.cfg.scenario,
            this.cfg.payloadCapacity,
            command.cargo_weight_kg
          );
      }

      if (
        command.ignition_on &&
        command.new_trip &&
        String(command.trip_id) !== this.lastStartedTrip
      ) {
        this.lastStartedTrip = String(command.trip_id);
        this.progressKm = 0;
        this.state = {};
        this.tickIndex = 0;
        this.pendingInitialTelemetry = true;
        this.lastKnownPosition = null;
      }

      this.ignitionOn = command.ignition_on;

      if (!this.ignitionOn) {
        this.state.currentSpeedKmh = 0;
      }

      this.tick();
    });

    this.socket.on('connect_error', error => {
      this.log('Connection error:', error.message);
    });

    this.socket.on('disconnect', reason => {
      this.bootstrapped = false;
      this.inFlight = false;
      this.lastTickAt = Date.now();
      this.log('Disconnected:', reason);
    });
  }

  currentPosition() {
    if (this.routeKey) {
      return positionAtDistance(
        this.routeKey,
        this.progressKm
      );
    }

    return this.lastKnownPosition ||
      positionAtDistance('BLANTYRE_LILONGWE', 0);
  }

  tick() {
    if (
      !this.socket?.connected ||
      !this.bootstrapped ||
      this.inFlight
    ) {
      return;
    }

    const now = Date.now();

    const dt = this.lastTickAt
      ? clamp((now - this.lastTickAt) / 1000, 0, 5)
      : 0;

    this.lastTickAt = now;
    this.tickIndex++;

    const scenario = this.cfg.scenario || 'NORMAL';

    if (
      scenario === 'DEVICE_DISCONNECT' &&
      !this.state.disconnectedOnce &&
      this.tickIndex >= 20
    ) {
      this.state.disconnectedOnce = true;
      this.socket.disconnect();

      this.reconnectTimer = setTimeout(
        () => this.socket.connect(),
        100000
      );

      return;
    }

    const total = this.routeKey
      ? totalDistanceKm(this.routeKey)
      : 0;

    const originOnly = this.pendingInitialTelemetry;
    this.pendingInitialTelemetry = false;

    this.state.dtSeconds = dt;

    if (this.ignitionOn && !originOnly) {
      this.state.elapsedSeconds =
        (this.state.elapsedSeconds || 0) + dt;
    }

    let speed = 0;
    let engineRunning = this.ignitionOn;

    if (
      !originOnly &&
      this.ignitionOn &&
      total > 0 &&
      this.fuelLitres > 0
    ) {
      const previousSpeed =
        this.state.currentSpeedKmh || 0;

      speed = scenarios.speedForScenario(
        scenario,
        this.progressKm / total,
        this.tickIndex,
        this.cfg.overspeedThresholdKmh,
        this.state
      );

      const rate = fuelConsumptionLPer100Km({
        speedKmh: speed,
        cargoWeightKg: this.cargoWeightKg,
        payloadCapacityKg: this.cfg.payloadCapacity,
        scenario,
        progressFraction: this.progressKm / total
      });

      let distance = Math.min(
        Math.max(0, total - this.progressKm),
        (previousSpeed + speed) / 2 * dt / 3600
      );

      if (!this.cfg.physicalFuel) {
        distance = Math.min(
          distance,
          this.fuelLitres * 100 / rate
        );
      }

      this.progressKm += distance;
      this.odometerKm += distance;

      if (!this.cfg.physicalFuel) {
        this.fuelLitres -= distance * rate / 100;
      }
    }

    if (this.state.fuelStop && speed < 0.1) {
      engineRunning = false;
    }

    if (engineRunning) {
      this.engineHours += dt / 3600;

      if (!this.cfg.physicalFuel && speed < 0.1) {
        this.fuelLitres -= 1.4 * dt / 3600;
      }
    }

    if (
      !this.cfg.physicalFuel &&
      this.ignitionOn &&
      speed < 0.1
    ) {
      this.fuelLitres += scenarios.fuelEventForScenario(
        scenario,
        0,
        this.state,
        Math.max(0, this.fuelLitres),
        this.tankCapacity
      );
    }

    this.fuelLitres = clamp(
      this.fuelLitres,
      0,
      this.tankCapacity
    );

    if (
      this.fuelLitres <= 0 ||
      (total > 0 && this.progressKm >= total)
    ) {
      speed = 0;
      engineRunning = false;
      this.ignitionOn = false;
      this.state.currentSpeedKmh = 0;
    }

    this.lastKnownPosition = this.currentPosition();

    const p = this.lastKnownPosition;

    this.lastSentAt = Math.max(
      now,
      this.lastSentAt + 1
    );

    const payload = {
      device_id: this.cfg.deviceId,
      telemetry_uuid: crypto.randomUUID(),

      latitude: Number(p.lat.toFixed(6)),
      longitude: Number(p.lng.toFixed(6)),
      heading: Number((p.heading || 0).toFixed(1)),
      speed: Number(speed.toFixed(1)),

      fuel_level_litres:
        Number(this.fuelLitres.toFixed(2)),

      fuel_percent: Number(
        (
          this.fuelLitres *
          100 /
          this.tankCapacity
        ).toFixed(2)
      ),

      odometer_km: Number(this.odometerKm.toFixed(3)),
      engine_hours: Number(this.engineHours.toFixed(4)),
      ignition_on: engineRunning,
      cargo_weight_kg: this.cargoWeightKg,

      // Valid simulation coordinates, not physical GPS measurements.
      gps_valid: !this.cfg.physicalFuel,

      recorded_at:
        new Date(this.lastSentAt).toISOString()
    };

    this.inFlight = true;

    this.socket.timeout(10000).emit(
      'telemetry',
      payload,
      (error, ack) => {
        this.inFlight = false;

        if (error || !ack?.success) {
          this.log(
            'Telemetry not confirmed:',
            error?.message || ack?.message
          );
        }
      }
    );
  }

  start() {
    this.connect();

    this.interval = setInterval(
      () => this.tick(),
      INTERVAL_MS
    );
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.reconnectTimer);
    this.socket?.disconnect();
  }
}

function main() {
  if (SECRET && SECRET.length < 32) {
    throw new Error(
      'DEVICE_KEY_SECRET must contain at least 32 characters.'
    );
  }

  if (!config.vehicles?.length) {
    throw new Error('No simulator vehicles configured.');
  }

  const simulators = config.vehicles.map(cfg => {
    const deviceKey = resolveDeviceKey(cfg);

    if (!deviceKey) {
      throw new Error(
        `Missing device key for ${cfg.deviceId}.`
      );
    }

    if (cfg.scenario === 'ROUTE_DEVIATION') {
      throw new Error(
        'ROUTE_DEVIATION requires a continuous alternate route; ' +
        'select another scenario.'
      );
    }

    return new VehicleSimulator({
      ...cfg,
      deviceKey
    });
  });

  console.log(
    `Freight Malawi: real-time simulation, ` +
    `${INTERVAL_MS} ms interval, ${BACKEND_URL}`
  );

  simulators.forEach(sim => sim.start());

  const stop = () => {
    simulators.forEach(sim => sim.stop());
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) main();

module.exports = {
  VehicleSimulator,
  deriveDeviceKey,
  resolveDeviceKey,
  fuelConsumptionLPer100Km,
  BACKEND_URL,
  INTERVAL_MS,
  TIME_SCALE
};
