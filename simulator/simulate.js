const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const {
  totalDistanceKm,
  positionAtDistance,
  offsetPerpendicular,
} = require('./routes');

const scenarios =
  require('./scenarios');

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
  (
    process.env.BACKEND_URL ||
    process.env.SIMULATOR_BACKEND_URL ||
    config.backendUrl ||
    'http://localhost:5000'
  ).replace(
    /\/$/,
    '',
  );

const INTERVAL_MS =
  Number(
    process.env.TELEMETRY_INTERVAL_MS ||
      config.telemetryIntervalMs ||
      2000,
  );

const TIME_SCALE =
  Number(
    process.env.SIMULATION_TIME_SCALE ||
      config.simulationTimeScale ||
      30,
  );

const FALLBACK_ROUTE =
  'BLANTYRE_LILONGWE';

const IDLE_CONSUMPTION_L_PER_HOUR =
  1.4;

function clamp(
  value,
  min,
  max,
) {
  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );
}

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
    clamp(
      cargoTonnes /
        capacityTonnes,
      0,
      1.25,
    );

  let consumption =
    30 +
    cargoTonnes *
      0.45;

  if (
    loadRatio > 1
  ) {
    consumption +=
      (
        loadRatio - 1
      ) *
      8;
  }

  if (
    speedKmh > 75
  ) {
    consumption +=
      Math.min(
        5,
        (
          speedKmh - 75
        ) *
          0.08,
      );
  }

  if (
    speedKmh > 0 &&
    speedKmh < 45
  ) {
    consumption += 1.5;
  }

  if (
    progressFraction >= 0.55 &&
    progressFraction <= 0.78
  ) {
    consumption *= 1.05;
  }

  if (
    scenario ===
    'AGGRESSIVE_DRIVER'
  ) {
    consumption += 1.5;
  }

  if (
    scenario ===
    'OVERSPEEDING'
  ) {
    consumption += 1;
  }

  return clamp(
    consumption,
    28,
    43,
  );
}

class VehicleSimulator {
  constructor(cfg) {
    this.cfg = cfg;

    this.routeKey =
      null;

    this.progressKm =
      0;

    this.odometerKm =
      12000 +
      Math.round(
        Math.random() *
          5000,
      );

    this.engineHours =
      0;

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

    this.ignitionOn =
      false;

    this.pendingInitialTelemetry =
      false;

    this.tickIndex =
      0;

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

    this.bootstrapped =
      false;

    this.socket =
      null;

    this.interval =
      null;

    this.log = (
      ...args
    ) =>
      console.log(
        `[${cfg.licensePlate}]`,
        ...args,
      );
  }

  connect() {
    this.log(
      `connecting to ${BACKEND_URL}`,
    );

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

          transports: [
            'websocket',
            'polling',
          ],

          reconnection:
            true,

          reconnectionDelay:
            2000,

          reconnectionDelayMax:
            10000,

          timeout:
            10000,
        },
      );

    this.socket.on(
      'connect',
      () => {
        this.log(
          `CONNECTED to ${BACKEND_URL}`,
        );

        this.log(
          'waiting for Dashboard ignition command',
        );
      },
    );

    this.socket.on(
      'device:state',
      ({
        reading,
        trip,
      }) => {
        if (reading) {
          this.lastKnownPosition =
            {
              lat: Number(
                reading.latitude,
              ),

              lng: Number(
                reading.longitude,
              ),

              heading:
                Number(
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
          Boolean(
            command.ignition_on,
          );

        if (
          command.route_key
        ) {
          this.routeKey =
            command.route_key;
        }

        if (
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

        if (
          nextIgnition &&
          command.new_trip
        ) {
          this.progressKm =
            0;

          this.state = {};

          this.tickIndex =
            0;

          this.pendingInitialTelemetry =
            true;

          this.lastKnownPosition =
            null;

          if (
            this.routeKey
          ) {
            const origin =
              positionAtDistance(
                this.routeKey,
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

          this.log(
            `NEW TRIP command received: ${this.routeKey || 'NO ROUTE'}`,
          );

          this.log(
            `Cargo weight: ${this.cargoWeightKg} kg`,
          );
        }

        this.ignitionOn =
          nextIgnition;

        this.log(
          this.ignitionOn
            ? 'IGNITION ON'
            : 'IGNITION OFF',
        );

        this.tick();
      },
    );

    this.socket.on(
      'connect_error',
      (error) => {
        this.log(
          `connection error: ${error.message}`,
        );

        if (
          String(
            error.message,
          ).includes(
            'DEVICE_UNAUTHORIZED',
          )
        ) {
          this.log(
            'DEVICE UNAUTHORIZED: run backend npm run provision against the SAME production Supabase database.',
          );
        }

        if (
          error.message ===
          'ECONNREFUSED'
        ) {
          this.log(
            `Cannot reach ${BACKEND_URL}`,
          );
        }
      },
    );

    this.socket.on(
      'disconnect',
      (reason) => {
        this.log(
          `DISCONNECTED: ${reason}`,
        );
      },
    );
  }

  currentPosition() {
    if (
      this.routeKey
    ) {
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
          ? clamp(
              this.progressKm /
                totalKm,
              0,
              1,
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
      lat:
        fallback.lat,

      lng:
        fallback.lng,

      heading:
        fallback.heading,
    };
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
      (
        INTERVAL_MS /
        1000
      ) *
      TIME_SCALE /
      3600;

    const totalKm =
      this.routeKey
        ? totalDistanceKm(
            this.routeKey,
          )
        : 0;

    let speed = 0;

    let distanceThisTick =
      0;

    const publishOriginOnly =
      this
        .pendingInitialTelemetry;

    this.pendingInitialTelemetry =
      false;

    if (
      !publishOriginOnly &&
      this.ignitionOn &&
      this.routeKey &&
      totalKm > 0
    ) {
      const beforeKm =
        this.progressKm;

      const fraction =
        clamp(
          beforeKm /
            totalKm,
          0,
          1,
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
    }

    const progressFraction =
      totalKm > 0
        ? clamp(
            this.progressKm /
              totalKm,
            0,
            1,
          )
        : 0;

    let position =
      this.currentPosition();

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
      this.ignitionOn &&
      speed === 0
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
      clamp(
        this.fuelLitres +
          fuelDelta,
        0,
        this.tankCapacity,
      );

    if (
      this.progressKm >=
        totalKm &&
      totalKm > 0
    ) {
      this.progressKm =
        totalKm;

      speed = 0;

      this.ignitionOn =
        false;

      this.state
        .currentSpeedKmh =
        0;

      position =
        positionAtDistance(
          this.routeKey,
          totalKm,
        );

      this.log(
        `DESTINATION REACHED: ${totalKm.toFixed(
          1,
        )} km`,
      );
    }

    if (
      position
    ) {
      this.lastKnownPosition =
        {
          lat:
            position.lat,

          lng:
            position.lng,

          heading:
            position.heading ||
            0,
        };
    }

    const fuelPercent =
      this.tankCapacity >
      0
        ? (
            this.fuelLitres /
            this.tankCapacity
          ) *
          100
        : 0;

    const payload = {
      device_id:
        this.cfg.deviceId,

      device_key:
        this.cfg.deviceKey,

      telemetry_uuid:
        `${this.cfg.deviceId}-${Date.now()}-${this.tickIndex}`,

      latitude:
        Number(
          (
            this
              .lastKnownPosition
              ?.lat || 0
          ).toFixed(6),
        ),

      longitude:
        Number(
          (
            this
              .lastKnownPosition
              ?.lng || 0
          ).toFixed(6),
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
          (
            this
              .lastKnownPosition
              ?.heading || 0
          ).toFixed(1),
        ),

      fuel_level_litres:
        Number(
          this.fuelLitres.toFixed(
            2,
          ),
        ),

      fuel_percent:
        Number(
          clamp(
            fuelPercent,
            0,
            100,
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
            `telemetry rejected: ${
              ack?.message ||
              'unknown error'
            }`,
          );
        }
      },
    );
  }

  start() {
    this.connect();

    this.interval =
      setInterval(
        () =>
          this.tick(),
        INTERVAL_MS,
      );
  }

  stop() {
    if (
      this.interval
    ) {
      clearInterval(
        this.interval,
      );
    }

    if (
      this.socket
    ) {
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
    ` Backend: ${BACKEND_URL}`,
  );

  console.log(
    ` Interval: ${INTERVAL_MS}ms`,
  );

  console.log(
    ` Simulation time scale: ${TIME_SCALE}x`,
  );

  console.log(
    ' Ignition: controlled from Dashboard',
  );

  console.log(
    ' GPS: continuous device telemetry',
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
      'No simulator vehicles configured.',
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

  process.on(
    'SIGTERM',
    () => {
      simulators.forEach(
        (simulator) =>
          simulator.stop(),
      );

      process.exit(0);
    },
  );
}

if (
  require.main ===
  module
) {
  main();
}

module.exports = {
  VehicleSimulator,
  fuelConsumptionLPer100Km,
  BACKEND_URL,
  INTERVAL_MS,
  TIME_SCALE,
};