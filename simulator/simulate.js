// FREIGHT MALAWI SIMULATOR
//
// Virtual devices continuously report GPS and vehicle state.
// Movement itself is controlled by the Dashboard ignition switch.
//
// The simulation is accelerated for demonstration purposes, but:
//   - route distance is based on road kilometres
//   - odometer increases by actual simulated kilometres
//   - fuel falls according to kilometres travelled
//   - load affects fuel consumption
//   - aggressive driving increases consumption
//   - overspeeding increases consumption
//
// A Blantyre -> Lilongwe M1 trip therefore finishes at exactly 305 km
// instead of the shorter straight-line/sparse-waypoint distance.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const {
  totalDistanceKm,
  positionAtDistance,
  offsetPerpendicular,
} = require('./routes');

const scenarios = require('./scenarios');

const configPath =
  path.join(
    __dirname,
    'config.json',
  );

const config =
  JSON.parse(
    fs.readFileSync(
      configPath,
      'utf8',
    ),
  );

const BACKEND_URL =
  process.env.BACKEND_URL ||
  config.backendUrl ||
  'http://localhost:5000';

const INTERVAL_MS =
  Number(
    process.env.TELEMETRY_INTERVAL_MS ||
      config.telemetryIntervalMs ||
      5000,
  );

// 30x means:
// 5 real seconds = 150 simulated seconds.
// This lets a full M1 journey be demonstrated in minutes rather than hours.
const TIME_SCALE =
  Number(
    process.env.SIMULATION_TIME_SCALE ||
      config.simulationTimeScale ||
      30,
  );

const FALLBACK_ROUTE =
  'M1_LILONGWE_BLANTYRE';

const IDLE_CONSUMPTION_L_PER_HOUR =
  1.4;

// ---------------------------------------------------------------------------
// Fuel-consumption model
//
// Volvo's guidance for a full-load regional truck is approximately
// 30-40 L/100 km. This model stays within that broad range while applying
// practical adjustments for load, speed and driving behaviour.
// ---------------------------------------------------------------------------

function fuelConsumptionLPer100Km({
  speedKmh,
  cargoWeightKg,
  payloadCapacityKg,
  scenario,
  progressFraction,
}) {
  const cargoTonnes =
    Math.max(
      0,
      Number(
        cargoWeightKg || 0,
      ),
    ) / 1000;

  const capacityTonnes =
    Math.max(
      1,
      Number(
        payloadCapacityKg ||
          12000,
      ),
    ) / 1000;

  const loadRatio =
    Math.max(
      0,
      Math.min(
        1.25,
        cargoTonnes /
          capacityTonnes,
      ),
    );

  // Base regional-truck consumption.
  // 12,000 kg load => approximately 35.4 L/100 km before route/speed factors.
  let consumption =
    30 +
    cargoTonnes *
      0.45;

  // Overloading penalty.
  if (
    loadRatio > 1
  ) {
    consumption +=
      (loadRatio - 1) *
      8;
  }

  // Higher aerodynamic drag at higher road speed.
  if (
    speedKmh > 75
  ) {
    consumption +=
      Math.min(
        5,
        (speedKmh - 75) *
          0.08,
      );
  }

  // Stop/start traffic.
  if (
    speedKmh > 0 &&
    speedKmh < 45
  ) {
    consumption += 1.5;
  }

  // Approximate extra effort through part of the central highland corridor.
  if (
    progressFraction >= 0.55 &&
    progressFraction <= 0.78
  ) {
    consumption *= 1.05;
  }

  // Aggressive driving penalty.
  if (
    scenario ===
    'AGGRESSIVE_DRIVER'
  ) {
    consumption += 1.5;
  }

  // Sustained high-speed driving penalty.
  if (
    scenario ===
    'OVERSPEEDING'
  ) {
    consumption += 1.0;
  }

  return Math.max(
    28,
    Math.min(
      43,
      consumption,
    ),
  );
}

class VehicleSimulator {
  constructor(cfg) {
    this.cfg = cfg;

    this.routeKey = null;

    this.progressKm = 0;

    this.odometerKm =
      12000 +
      Math.round(
        Math.random() *
          5000,
      );

    this.engineHours = 0;

    this.tankCapacity =
      Number(
        cfg.tankCapacity ||
          400,
      );

    this.fuelLitres =
      (
        scenarios.initialFuelPercent(
          cfg.scenario,
        ) / 100
      ) *
      this.tankCapacity;

    this.ignitionOn = false;

    // A newly prepared trip must publish an origin/ignition packet before
    // any kilometres are applied. This makes the trip start odometer the
    // true origin value and guarantees the M1 journey closes at exactly 305 km.
    this.pendingInitialTelemetry = false;

    this.tickIndex = 0;

    this.state = {};

    this.cargoWeightKg =
      scenarios.cargoWeightForScenario(
        cfg.scenario,
        cfg.payloadCapacity ||
          12000,
        cfg.cargoWeightKg,
      );

    this.lastKnownPosition =
      null;

    this.bootstrapped = false;

    this.socket = null;

    this.interval = null;

    this.log = (...args) =>
      console.log(
        `[${cfg.licensePlate}]`,
        ...args,
      );
  }

  connect() {
    this.socket =
      io(
        `${BACKEND_URL}/device`,
        {
          auth: {
            deviceId:
              this.cfg
                .deviceId,

            deviceKey:
              this.cfg
                .deviceKey,
          },

          reconnection: true,

          reconnectionDelay:
            2000,

          timeout: 8000,
        },
      );

    this.socket.on(
      'connect',
      () => {
        this.log(
          'connected; waiting for Dashboard ignition command',
        );
      },
    );

    this.socket.on(
      'device:state',
      ({ reading, trip }) => {
        if (reading) {
          this.lastKnownPosition =
            {
              lat: Number(
                reading.latitude,
              ),

              lng: Number(
                reading.longitude,
              ),

              heading: Number(
                reading.heading ||
                  0,
              ),
            };

          if (
            Number.isFinite(
              Number(
                reading
                  .odometer_km,
              ),
            )
          ) {
            this.odometerKm =
              Number(
                reading
                  .odometer_km,
              );
          }

          if (
            Number.isFinite(
              Number(
                reading
                  .engine_hours,
              ),
            )
          ) {
            this.engineHours =
              Number(
                reading
                  .engine_hours,
              );
          }

          if (
            Number.isFinite(
              Number(
                reading
                  .fuel_level_litres,
              ),
            )
          ) {
            this.fuelLitres =
              Number(
                reading
                  .fuel_level_litres,
              );
          }
        }

        if (
          trip?.route_key
        ) {
          this.routeKey =
            trip.route_key;
        }

        if (
          trip?.cargo_weight_kg !=
          null
        ) {
          this.cargoWeightKg =
            Number(
              trip.cargo_weight_kg,
            );
        }

        this.bootstrapped =
          true;

        this.tick();
      },
    );

    this.socket.on(
      'control:ignition',
      (command = {}) => {
        const nextIgnition =
          !!command.ignition_on;

        if (
          nextIgnition &&
          command.route_key
        ) {
          this.routeKey =
            command.route_key;
        }

        if (
          nextIgnition &&
          command.cargo_weight_kg !=
            null
        ) {
          this.cargoWeightKg =
            scenarios.cargoWeightForScenario(
              this.cfg.scenario,
              this.cfg
                .payloadCapacity ||
                12000,
              Number(
                command.cargo_weight_kg,
              ),
            );
        }

        // Starting a PENDING_DETAILS trip creates a fresh virtual journey.
        if (
          nextIgnition &&
          command.new_trip
        ) {
          this.progressKm =
            0;

          this.state = {};

          this.tickIndex = 0;

          this.ignitionOn =
            false;

          this.pendingInitialTelemetry = true;

          const origin =
            positionAtDistance(
              this.routeKey ||
                FALLBACK_ROUTE,
              0,
            );

          this.lastKnownPosition =
            {
              lat:
                origin.lat,
              lng:
                origin.lng,
              heading:
                origin.heading,
            };
        }

        this.ignitionOn =
          nextIgnition;

        this.log(
          nextIgnition
            ? `IGNITION ON${
                this.routeKey
                  ? ` · ${this.routeKey}`
                  : ''
              }`
            : 'IGNITION OFF · GPS tracking remains active',
        );

        this.tick();
      },
    );

    this.socket.on(
      'connect_error',
      (err) => {
        this.log(
          'connection error:',
          err.message,
        );

        if (
          String(
            err.message,
          ).includes(
            'DEVICE_UNAUTHORIZED',
          )
        ) {
          this.log(
            'Run: cd backend && node scripts/provisionSimulatorDevices.js',
          );
        }
      },
    );

    this.socket.on(
      'disconnect',
      (reason) => {
        this.log(
          'disconnected:',
          reason,
        );
      },
    );
  }

  currentPosition() {
    if (!this.routeKey) {
      if (
        this.lastKnownPosition
      ) {
        return this.lastKnownPosition;
      }

      const fallback =
        positionAtDistance(
          FALLBACK_ROUTE,
          0,
        );

      return {
        lat: fallback.lat,
        lng: fallback.lng,
        heading:
          fallback.heading,
      };
    }

    let position =
      positionAtDistance(
        this.routeKey,
        this.progressKm,
      );

    const totalKm =
      totalDistanceKm(
        this.routeKey,
      );

    const fraction =
      totalKm > 0
        ? Math.min(
            1,
            this.progressKm /
              totalKm,
          )
        : 0;

    if (
      scenarios.isDeviating(
        this.cfg.scenario,
        fraction,
      )
    ) {
      position = {
        ...position,
        ...offsetPerpendicular(
          position.lat,
          position.lng,
          position.heading,
          8,
        ),
      };
    }

    return position;
  }

  tick() {
    this.tickIndex += 1;

    if (
      !this.socket?.connected ||
      !this.bootstrapped
    ) {
      return;
    }

    const scenario =
      this.cfg.scenario ||
      'NORMAL';

    const virtualDtHours =
      (INTERVAL_MS / 1000) *
      TIME_SCALE /
      3600;

    const routeAvailable =
      !!this.routeKey;

    const totalKm =
      routeAvailable
        ? totalDistanceKm(
            this.routeKey,
          )
        : 0;

    let speed = 0;

    let distanceThisTick =
      0;

    // -----------------------------------------------------------------------
    // Move the virtual truck
    // -----------------------------------------------------------------------

    const publishOriginOnly = this.pendingInitialTelemetry;
    this.pendingInitialTelemetry = false;

    if (
      !publishOriginOnly &&
      this.ignitionOn &&
      routeAvailable &&
      totalKm > 0
    ) {
      const beforeKm =
        this.progressKm;

      const fraction =
        Math.min(
          1,
          beforeKm /
            totalKm,
        );

      speed =
        scenarios.speedForScenario(
          scenario,
          fraction,
          this.tickIndex,
          this.cfg
            .overspeedThresholdKmh ||
            80,
          this.state,
        );

      const requestedDistanceKm =
        speed *
        virtualDtHours;

      const afterKm =
        Math.min(
          totalKm,
          beforeKm +
            requestedDistanceKm,
        );

      // IMPORTANT:
      // Use actual applied movement, not requested movement.
      // This prevents the final packet from adding extra kilometres.
      distanceThisTick =
        Math.max(
          0,
          afterKm -
            beforeKm,
        );

      this.progressKm =
        afterKm;

      this.odometerKm +=
        distanceThisTick;

      this.engineHours +=
        virtualDtHours;

      if (
        this.progressKm >=
        totalKm
      ) {
        this.progressKm =
          totalKm;
      }
    }

    const progressFraction =
      totalKm > 0
        ? Math.min(
            1,
            this.progressKm /
              totalKm,
          )
        : 0;

    let position =
      this.currentPosition();

    // -----------------------------------------------------------------------
    // Fuel model
    // -----------------------------------------------------------------------

    const consumption =
      fuelConsumptionLPer100Km(
        {
          speedKmh: speed,

          cargoWeightKg:
            this.cargoWeightKg,

          payloadCapacityKg:
            this.cfg
              .payloadCapacity ||
            12000,

          scenario,

          progressFraction,
        },
      );

    let fuelDelta =
      -(
        distanceThisTick *
        consumption /
        100
      );

    if (
      speed === 0 &&
      this.ignitionOn
    ) {
      fuelDelta -=
        IDLE_CONSUMPTION_L_PER_HOUR *
        virtualDtHours;
    }

    fuelDelta +=
      scenarios.fuelEventForScenario(
        scenario,
        progressFraction,
        this.state,
      );

    this.fuelLitres =
      Math.max(
        0,
        Math.min(
          this.tankCapacity,
          this.fuelLitres +
            fuelDelta,
        ),
      );

    // Destination reached.
    if (
      this.progressKm >=
        totalKm &&
      totalKm > 0 &&
      this.ignitionOn
    ) {
      speed = 0;

      this.ignitionOn =
        false;

      this.state
        .currentSpeedKmh = 0;

      position =
        positionAtDistance(
          this.routeKey,
          totalKm,
        );
    }

    // Keep the latest physical position even when the truck is OFFLINE or
    // ignition is OFF.
    this.lastKnownPosition =
      {
        lat: position.lat,
        lng: position.lng,
        heading:
          position.heading ||
          this.lastKnownPosition
            ?.heading ||
          0,
      };

    this.cargoWeightKg =
      scenarios.cargoWeightForScenario(
        scenario,
        this.cfg
          .payloadCapacity ||
          12000,
        this.cargoWeightKg,
      );

    const fuelPercent =
      (
        this.fuelLitres /
        this.tankCapacity
      ) *
      100;

    const payload = {
      device_id:
        this.cfg.deviceId,

      device_key:
        this.cfg.deviceKey,

      telemetry_uuid:
        `${this.cfg.deviceId}-${Date.now()}-${this.tickIndex}`,

      latitude:
        Number(
          this.lastKnownPosition
            .lat.toFixed(6),
        ),

      longitude:
        Number(
          this.lastKnownPosition
            .lng.toFixed(6),
        ),

      speed:
        Number(
          Math.max(
            0,
            speed,
          ).toFixed(1),
        ),

      heading:
        Number(
          this.lastKnownPosition
            .heading.toFixed(1),
        ),

      fuel_level_litres:
        Number(
          this.fuelLitres.toFixed(2),
        ),

      fuel_percent:
        Number(
          Math.max(
            0,
            Math.min(
              100,
              fuelPercent,
            ),
          ).toFixed(1),
        ),

      odometer_km:
        Number(
          this.odometerKm.toFixed(
            2,
          ),
        ),

      engine_hours:
        Number(
          this.engineHours.toFixed(
            2,
          ),
        ),

      ignition_on:
        this.ignitionOn,

      cargo_weight_kg:
        this.cargoWeightKg,

      gps_valid: true,

      recorded_at:
        new Date().toISOString(),
    };

    this.socket.emit(
      'telemetry',
      payload,
      (ack) => {
        if (
          !ack ||
          !ack.success
        ) {
          this.log(
            'telemetry rejected:',
            ack?.message ||
              'unknown error',
          );
        }
      },
    );
  }

  start() {
    this.connect();

    this.interval =
      setInterval(
        () => this.tick(),
        INTERVAL_MS,
      );
  }

  stop() {
    clearInterval(
      this.interval,
    );

    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

function main() {
  console.log(
    '============================================================',
  );

  console.log(
    ' FREIGHT MALAWI SIMULATOR',
  );

  console.log(
    ` Backend: ${BACKEND_URL}   Interval: ${INTERVAL_MS}ms   Time scale: ${TIME_SCALE}x`,
  );

  console.log(
    ' Mode: GPS reporting continuous; movement controlled by Dashboard ignition',
  );

  console.log(
    ' M1 Blantyre ↔ Lilongwe reference distance: 305 km',
  );

  console.log(
    '============================================================',
  );

  if (
    !Array.isArray(
      config.vehicles,
    ) ||
    config.vehicles.length ===
      0
  ) {
    console.error(
      'No vehicles configured in simulator/config.json.',
    );

    process.exit(1);
  }

  const simulators =
    config.vehicles.map(
      (vehicle) =>
        new VehicleSimulator(
          vehicle,
        ),
    );

  simulators.forEach(
    (simulator) =>
      simulator.start(),
  );

  process.on(
    'SIGINT',
    () => {
      console.log(
        '\nStopping simulator...',
      );

      simulators.forEach(
        (simulator) =>
          simulator.stop(),
      );

      process.exit(0);
    },
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  VehicleSimulator,
  fuelConsumptionLPer100Km,
  BACKEND_URL,
  INTERVAL_MS,
  TIME_SCALE,
};
