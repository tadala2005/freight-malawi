
'use strict';

// FREIGHT MALAWI — HYBRID HARDWARE VEHICLE
//
// Real input:
//   Fuel percentage from the ESP32 ultrasonic sensor.
//
// Simulated:
//   Ignition, route, speed, location,
//   odometer, engine hours and trip progress.
//
// Existing three-vehicle simulator remains unchanged.

const {
  VehicleSimulator,
  BACKEND_URL,
  INTERVAL_MS,
  TIME_SCALE
} = require('./simulate');

const {
  totalDistanceKm,
  positionAtDistance
} = require('./routes');

const scenarios = require('./scenarios');

const DEVICE_ID = 'ESP32-HW-001';
const SENSOR_POLL_MS = 2500;
const SENSOR_LOG_MS = 30000;

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

class HardwareHybridSimulator extends VehicleSimulator {
  constructor(key) {
    super({
      deviceId: DEVICE_ID,
      deviceKey: key,
      licensePlate: 'HW 0001',
      tankCapacity: 400,
      payloadCapacity: 10000,
      overspeedThresholdKmh: 80,
      scenario: 'NORMAL'
    });

    this.sensorPercent = null;
    this.sensorPollTimer = null;
    this.polling = false;

    this.lastSensorLogAt = 0;
    this.lastSensorState = '';
  }

  // ============================================
  // 1. FETCH LIVE ESP32 FUEL MEASUREMENT
  // ============================================

  async pollSensor() {
    if (this.polling) return;

    this.polling = true;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/devices/fuel`,
        {
          headers: {
            'X-Device-ID':
              DEVICE_ID,

            'X-Device-Key':
              this.cfg.deviceKey
          },

          signal:
            AbortSignal.timeout(10000)
        }
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const json = await response.json();
      const data = json?.data;

      const percentage =
        Number(data?.fuel_percent);

      const fresh =
        data?.fresh === true &&
        data.fuel_percent !== null &&
        Number.isFinite(percentage) &&
        percentage >= 0 &&
        percentage <= 100;

      this.sensorPercent = fresh
        ? percentage
        : null;

      const state =
        this.sensorPercent === null
          ? 'WAITING / STALE'
          : 'LIVE';

      if (
        state !== this.lastSensorState ||
        Date.now() - this.lastSensorLogAt >
          SENSOR_LOG_MS
      ) {
        const value =
          this.sensorPercent === null
            ? ''
            : ` ${this.sensorPercent.toFixed(1)}%`;

        this.log(
          `[PHYSICAL FUEL] ${state}${value}`
        );

        this.lastSensorState = state;
        this.lastSensorLogAt = Date.now();
      }

    } catch (error) {
      this.sensorPercent = null;

      if (
        this.lastSensorState !== 'ERROR'
      ) {
        this.log(
          `[PHYSICAL FUEL] ${error.message}`
        );

        this.lastSensorState = 'ERROR';
      }

    } finally {
      this.polling = false;
    }
  }

  // ============================================
  // 2. COMBINED HYBRID TELEMETRY
  // ============================================

  tick() {
    if (
      !this.socket?.connected ||
      !this.bootstrapped ||
      this.sensorPercent === null
    ) {
      return;
    }

    this.tickIndex++;

    // No fabricated refuelling or fuel theft.
    // These events must come from the real sensor.
    this.state.refuelApplied = true;
    this.state.theftApplied = true;

    const virtualHours =
      INTERVAL_MS /
      1000 *
      TIME_SCALE /
      3600;

    const routeKm =
      this.routeKey
        ? totalDistanceKm(this.routeKey)
        : 0;

    const initialPacket =
      this.pendingInitialTelemetry;

    this.pendingInitialTelemetry = false;

    let speed = 0;

    // ==========================================
    // 3. SIMULATED VEHICLE MOVEMENT
    // ==========================================

    if (
      !initialPacket &&
      this.ignitionOn &&
      this.routeKey &&
      routeKm > 0
    ) {
      const progress = clamp(
        this.progressKm / routeKm,
        0,
        1
      );

      speed =
        scenarios.speedForScenario(
          'NORMAL',
          progress,
          this.tickIndex,
          this.cfg.overspeedThresholdKmh,
          this.state
        );

      const deltaKm = Math.min(
        routeKm - this.progressKm,
        speed * virtualHours
      );

      this.progressKm += deltaKm;

      this.odometerKm += deltaKm;

      this.engineHours += virtualHours;
    }

    // Obtain position from the prepared route.
    let position = this.currentPosition();

    // ==========================================
    // 4. ROUTE COMPLETION
    // ==========================================

    if (
      routeKm > 0 &&
      this.progressKm >= routeKm
    ) {
      this.progressKm = routeKm;

      speed = 0;
      this.ignitionOn = false;

      this.state.currentSpeedKmh = 0;

      position = positionAtDistance(
        this.routeKey,
        routeKm
      );

      if (!this.state.arrivedLogged) {
        this.log(
          'DESTINATION REACHED'
        );

        this.state.arrivedLogged = true;
      }
    }

    this.lastKnownPosition = {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading || 0
    };

    // ==========================================
    // 5. FUEL FROM ACTUAL ULTRASONIC SENSOR
    // ==========================================

    this.fuelLitres = clamp(
      this.sensorPercent *
        this.tankCapacity /
        100,
      0,
      this.tankCapacity
    );

    // ==========================================
    // 6. TELEMETRY PAYLOAD
    // ==========================================

    const payload = {
      device_id: DEVICE_ID,

      device_key:
        this.cfg.deviceKey,

      telemetry_uuid:
        `${DEVICE_ID}-${Date.now()}-${this.tickIndex}`,

      latitude:
        Number(
          position.lat.toFixed(6)
        ),

      longitude:
        Number(
          position.lng.toFixed(6)
        ),

      speed:
        Number(
          speed.toFixed(1)
        ),

      heading:
        Number(
          (position.heading || 0).toFixed(1)
        ),

      fuel_level_litres:
        Number(
          this.fuelLitres.toFixed(2)
        ),

      fuel_percent:
        Number(
          this.sensorPercent.toFixed(2)
        ),

      odometer_km:
        Number(
          this.odometerKm.toFixed(2)
        ),

      engine_hours:
        Number(
          this.engineHours.toFixed(2)
        ),

      ignition_on:
        this.ignitionOn,

      cargo_weight_kg:
        this.cargoWeightKg,

      // Coordinates are simulated, not GPS measured.
      gps_valid: false,

      recorded_at:
        new Date().toISOString()
    };

    // ==========================================
    // 7. SEND TO EXISTING BACKEND PIPELINE
    // ==========================================

    this.socket.emit(
      'telemetry',
      payload,
      (ack) => {
        if (!ack?.success) {
          this.log(
            `[HYBRID TELEMETRY] Rejected: ${
              ack?.message || 'unknown error'
            }`
          );
        }
      }
    );
  }

  // ============================================
  // 8. START AND STOP
  // ============================================

  start() {
    // This connects to the same device Socket.IO
    // namespace used by the other simulator trucks.
    this.connect();

    this.pollSensor();

    this.sensorPollTimer =
      setInterval(
        () => this.pollSensor(),
        SENSOR_POLL_MS
      );

    this.interval =
      setInterval(
        () => this.tick(),
        INTERVAL_MS
      );
  }

  stop() {
    if (this.sensorPollTimer) {
      clearInterval(
        this.sensorPollTimer
      );
    }

    super.stop();
  }
}

// ============================================
// 9. START THE FOURTH VEHICLE
// ============================================

function startHardwareSimulator() {
  const key = String(
    process.env.HARDWARE_DEVICE_KEY || ''
  ).trim();

  if (!key) {
    console.log(
      '[HW 0001] Hybrid vehicle disabled: ' +
      'HARDWARE_DEVICE_KEY not configured'
    );

    return null;
  }

  const instance =
    new HardwareHybridSimulator(key);

  instance.start();

  return instance;
}

module.exports = {
  HardwareHybridSimulator,
  startHardwareSimulator
};
