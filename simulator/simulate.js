const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const config = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'config.json'),
    'utf8'
  )
);

const ROUTE_WAYPOINTS = [
  [-13.9626, 33.7741],
  [-14.0500, 33.8500],
  [-14.3779, 34.3333],
  [-14.7000, 34.5000],
  [-15.0000, 34.6500],
  [-15.3000, 34.8500],
  [-15.5500, 34.9500],
  [-15.7861, 35.0058],
];

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function bearingDeg([lat1, lon1], [lat2, lon2]) {
  const y =
    Math.sin(toRad(lon2 - lon1)) *
    Math.cos(toRad(lat2));

  const x =
    Math.cos(toRad(lat1)) *
      Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));

  return (
    (toDeg(Math.atan2(y, x)) + 360) % 360
  );
}

const segmentLengths = [];
let totalRouteKm = 0;

for (
  let index = 1;
  index < ROUTE_WAYPOINTS.length;
  index += 1
) {
  const distance = haversineKm(
    ROUTE_WAYPOINTS[index - 1],
    ROUTE_WAYPOINTS[index]
  );

  segmentLengths.push(distance);
  totalRouteKm += distance;
}

function positionAtDistance(distanceKm) {
  const clamped = Math.max(
    0,
    Math.min(totalRouteKm, distanceKm)
  );

  let remaining = clamped;

  for (
    let index = 0;
    index < segmentLengths.length;
    index += 1
  ) {
    const segmentLength =
      segmentLengths[index];

    const from =
      ROUTE_WAYPOINTS[index];

    const to =
      ROUTE_WAYPOINTS[index + 1];

    if (
      remaining <= segmentLength ||
      index === segmentLengths.length - 1
    ) {
      const fraction =
        segmentLength === 0
          ? 0
          : Math.min(
              1,
              remaining / segmentLength
            );

      return {
        lat:
          from[0] +
          (to[0] - from[0]) *
            fraction,

        lon:
          from[1] +
          (to[1] - from[1]) *
            fraction,

        heading: bearingDeg(
          from,
          to
        ),
      };
    }

    remaining -= segmentLength;
  }

  const last =
    ROUTE_WAYPOINTS[
      ROUTE_WAYPOINTS.length - 1
    ];

  return {
    lat: last[0],
    lon: last[1],
    heading: 0,
  };
}

function jitter(base, pct) {
  return (
    base +
    base *
      pct *
      (Math.random() * 2 - 1)
  );
}

class SimulatedTruck {
  constructor(vehicleConfig, index) {
    this.deviceId =
      vehicleConfig.deviceId;

    this.licensePlate =
      vehicleConfig.licensePlate;

    this.tankCapacity =
      vehicleConfig.tankCapacity;

    this.baseEfficiencyKmPerL =
      vehicleConfig.baseEfficiencyKmPerL ||
      3.3;

    this.speedLimitKmh =
      vehicleConfig.speedLimitKmh ||
      80;

    this.maxPayloadKg =
      vehicleConfig.maxPayloadKg ||
      30000;

    this.normalLoadWeightKg =
      vehicleConfig.normalLoadWeightKg ||
      Math.round(
        this.maxPayloadKg * 0.72
      );

    this.fuelLitres =
      (vehicleConfig.startFuelPercent / 100) *
      this.tankCapacity;

    this.distanceAlongRoute =
      Math.random() *
        totalRouteKm *
        0.15 +
      index * 4;

    this.direction = 1;

    this.cruiseSpeedKmh = jitter(
      vehicleConfig.cruiseSpeedKmh ||
        68,
      0.12
    );

    this.loadWeightKg =
      this.normalLoadWeightKg;

    this.engineOn = true;
    this.routePauseTicks = 0;
    this.routeCompleted = false;
    this.tripNumber = 1;

    const now = Date.now();

    const theftInterval =
      (config.theftIntervalMinutes || 3) *
      60000;

    const refuelInterval =
      (config.refuelIntervalMinutes || 7) *
      60000;

    const offset =
      Math.max(0, index * 15000);

    this.nextTheftAt =
      now +
      theftInterval +
      Math.random() *
        theftInterval *
        0.3 +
      offset;

    this.nextRefuelAt =
      now +
      refuelInterval +
      offset;

    this.nextOverspeedAt =
      now +
      (config.overspeedIntervalSeconds ||
        60) *
        1000 +
      offset;

    this.nextOverweightAt =
      now +
      (config.overweightIntervalSeconds ||
        90) *
        1000 +
      offset;

    this.overspeedTicksRemaining = 0;
    this.overweightTicksRemaining = 0;

    this.stoppedForTheft = false;
    this.theftDropPending = false;

    this.socket = null;
  }

  connect() {
    this.socket = io(
      `${config.backendUrl}/device`,
      {
        query: {
          deviceId: this.deviceId,
        },

        reconnection: true,
        reconnectionDelay: 2000,
      }
    );

    this.socket.on(
      'connect',
      () => {
        console.log(
          `[${new Date().toISOString()}] ${this.deviceId} connected`
        );
      }
    );

    this.socket.on(
      'connect_error',
      (error) => {
        console.error(
          `[${new Date().toISOString()}] ${this.deviceId} connection error: ${error.message}`
        );
      }
    );

    this.socket.on(
      'disconnect',
      (reason) => {
        console.warn(
          `[${new Date().toISOString()}] ${this.deviceId} disconnected (${reason})`
        );
      }
    );
  }

  updateScenarioTimers(now) {
    if (
      now >= this.nextOverspeedAt &&
      this.overspeedTicksRemaining === 0 &&
      this.engineOn
    ) {
      this.overspeedTicksRemaining =
        Math.max(
          1,
          Math.round(
            (config.overspeedDurationSeconds ||
              20) /
              config.tickIntervalSeconds
          )
        );

      this.nextOverspeedAt =
        now +
        (config.overspeedIntervalSeconds ||
          60) *
          1000;

      console.log(
        `[${new Date().toISOString()}] ${this.deviceId} SCENARIO: OVERSPEEDING`
      );
    }

    if (
      now >= this.nextOverweightAt &&
      this.overweightTicksRemaining === 0 &&
      this.engineOn
    ) {
      this.overweightTicksRemaining =
        Math.max(
          1,
          Math.round(
            (config.overweightDurationSeconds ||
              25) /
              config.tickIntervalSeconds
          )
        );

      this.loadWeightKg =
        Math.round(
          this.maxPayloadKg *
            (config.overweightFactor ||
              1.18)
        );

      this.nextOverweightAt =
        now +
        (config.overweightIntervalSeconds ||
          90) *
          1000;

      console.log(
        `[${new Date().toISOString()}] ${this.deviceId} SCENARIO: OVERWEIGHT ${this.loadWeightKg} kg`
      );
    }
  }

  tick(tickSeconds) {
    const now = Date.now();

    let routeCompletedThisTick =
      false;

    if (this.routePauseTicks > 0) {
      this.engineOn = false;

      this.routePauseTicks -= 1;

      if (this.routePauseTicks === 0) {
        this.direction *= -1;

        this.engineOn = true;
        this.tripNumber += 1;

        console.log(
          `[${new Date().toISOString()}] ${this.deviceId} ENGINE START — trip ${this.tripNumber}`
        );
      }
    }

    this.updateScenarioTimers(now);

    const wasStopped =
      this.stoppedForTheft;

    if (
      this.engineOn &&
      !this.stoppedForTheft &&
      now >= this.nextTheftAt
    ) {
      this.stoppedForTheft = true;
      this.theftDropPending = true;
    }

    const isTheftStop =
      this.stoppedForTheft;

    let speedKmh =
      this.engineOn &&
      !isTheftStop
        ? this.cruiseSpeedKmh
        : 0;

    if (
      this.overspeedTicksRemaining > 0 &&
      this.engineOn &&
      !isTheftStop
    ) {
      speedKmh =
        this.speedLimitKmh +
        jitter(24, 0.1);

      this.overspeedTicksRemaining -= 1;
    }

    const movementMultiplier =
      config.movementMultiplier ||
      15;

    const distanceKm =
      speedKmh *
      (tickSeconds / 3600) *
      movementMultiplier;

    if (
      this.engineOn &&
      !isTheftStop &&
      this.routePauseTicks === 0
    ) {
      this.distanceAlongRoute +=
        this.direction * distanceKm;

      if (
        this.distanceAlongRoute >=
        totalRouteKm
      ) {
        this.distanceAlongRoute =
          totalRouteKm;

        routeCompletedThisTick =
          true;
      } else if (
        this.distanceAlongRoute <= 0
      ) {
        this.distanceAlongRoute = 0;

        routeCompletedThisTick =
          true;
      }
    }

    const {
      lat,
      lon,
      heading,
    } = positionAtDistance(
      this.distanceAlongRoute
    );

    const facingHeading =
      this.direction === 1
        ? heading
        : (heading + 180) % 360;

    if (
      this.engineOn &&
      !isTheftStop &&
      distanceKm > 0
    ) {
      const efficiency =
        jitter(
          this.baseEfficiencyKmPerL,
          0.08
        );

      const consumed =
        distanceKm / efficiency;

      this.fuelLitres = Math.max(
        0,
        this.fuelLitres -
          consumed
      );
    }

    if (
      this.stoppedForTheft &&
      this.theftDropPending &&
      wasStopped
    ) {
      const drop = jitter(
        20,
        0.2
      );

      this.fuelLitres = Math.max(
        0,
        this.fuelLitres - drop
      );

      this.theftDropPending = false;
      this.stopTicksRemaining = 1;

      console.log(
        `[${new Date().toISOString()}] ${this.deviceId} SCENARIO: THEFT -${drop.toFixed(1)} L`
      );
    }

    if (this.stoppedForTheft) {
      this.stopTicksRemaining =
        (this.stopTicksRemaining || 2) -
        1;

      if (
        this.stopTicksRemaining <= 0 &&
        !this.theftDropPending
      ) {
        this.stoppedForTheft = false;

        this.nextTheftAt =
          now +
          (config.theftIntervalMinutes ||
            3) *
            60000;
      }
    }

    if (
      this.overweightTicksRemaining >
      0
    ) {
      this.overweightTicksRemaining -= 1;
    } else {
      this.loadWeightKg =
        this.normalLoadWeightKg;
    }

    if (
      now >= this.nextRefuelAt &&
      this.engineOn &&
      !isTheftStop
    ) {
      const before =
        this.fuelLitres;

      this.fuelLitres = Math.min(
        this.tankCapacity,
        this.fuelLitres + 150
      );

      this.nextRefuelAt =
        now +
        (config.refuelIntervalMinutes ||
          7) *
          60000;

      console.log(
        `[${new Date().toISOString()}] ${this.deviceId} SCENARIO: REFUEL +${(this.fuelLitres - before).toFixed(1)} L`
      );
    }

    if (routeCompletedThisTick) {
      this.routeCompleted =
        true;

      this.routePauseTicks =
        config.routePauseTicks ||
        2;

      this.engineOn = false;
      speedKmh = 0;

      console.log(
        `[${new Date().toISOString()}] ${this.deviceId} ROUTE COMPLETED`
      );
    } else {
      this.routeCompleted =
        false;
    }

    const fuelPercent =
      (this.fuelLitres /
        this.tankCapacity) *
      100;

    const payload = {
      deviceId: this.deviceId,

      latitude:
        Number(lat.toFixed(7)),

      longitude:
        Number(lon.toFixed(7)),

      speed:
        Number(speedKmh.toFixed(1)),

      heading:
        Number(facingHeading.toFixed(1)),

      fuelLevelLitres:
        Number(
          this.fuelLitres.toFixed(2)
        ),

      fuelPercent:
        Number(
          fuelPercent.toFixed(2)
        ),

      engineOn:
        this.engineOn,

      speedLimitKmh:
        this.speedLimitKmh,

      loadWeightKg:
        Number(
          this.loadWeightKg.toFixed(0)
        ),

      maxPayloadKg:
        this.maxPayloadKg,

      routeCompleted:
        this.routeCompleted,

      timestamp:
        new Date().toISOString(),
    };

    if (
      this.socket?.connected
    ) {
      this.socket.emit(
        'telemetry',
        payload,
        (ack) => {
          if (
            ack?.success === false
          ) {
            console.error(
              `[${new Date().toISOString()}] ${this.deviceId} telemetry rejected: ${ack.message}`
            );
          }

          if (
            ack?.alert &&
            Array.isArray(ack.alerts)
          ) {
            console.log(
              `[${new Date().toISOString()}] ${this.deviceId} ALERT: ${ack.alerts
                .map(
                  (alert) =>
                    alert.alertType
                )
                .join(', ')}`
            );
          }
        }
      );
    }
  }
}

function main() {
  const tickSeconds =
    config.tickIntervalSeconds ||
    5;

  const trucks =
    config.trucks.map(
      (truck, index) =>
        new SimulatedTruck(
          truck,
          index
        )
    );

  console.log(
    `[${new Date().toISOString()}] Freight Malawi simulator starting`
  );

  console.log(
    `[${new Date().toISOString()}] Trucks: ${trucks.length}`
  );

  console.log(
    `[${new Date().toISOString()}] Backend: ${config.backendUrl}`
  );

  console.log(
    `[${new Date().toISOString()}] Route length: ${totalRouteKm.toFixed(1)} km`
  );

  console.log(
    `[${new Date().toISOString()}] Movement multiplier: ${
      config.movementMultiplier || 15
    }x`
  );

  trucks.forEach(
    (truck) => truck.connect()
  );

  setInterval(
    () =>
      trucks.forEach(
        (truck) =>
          truck.tick(tickSeconds)
      ),
    tickSeconds * 1000
  );
}

main();