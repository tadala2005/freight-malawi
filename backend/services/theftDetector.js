/**
 * theftDetector.js
 *
 * Deterministic, rule-based fuel event detection for the Freight Malawi
 * prototype. This is intentionally NOT machine learning — it is a
 * transparent, explainable rule set appropriate for an academic prototype.
 *
 * Rules implemented:
 *   1. THEFT_SUSPECTED     — large fuel drop, in a short time window, while stationary
 *   2. ABNORMAL_CONSUMPTION — efficiency (km/L) falls below a configurable threshold
 *   3. REFUEL               — a sudden, large fuel increase
 *
 * State is kept in-memory (per running backend process) using a Map keyed
 * by vehicle id, holding the previous telemetry reading for that vehicle.
 * This is sufficient for the prototype; a production system would persist
 * rolling state elsewhere.
 */

const EARTH_RADIUS_KM = 6371;

const THEFT_MIN_DROP_LITRES = 5;
const THEFT_MAX_WINDOW_SECONDS = 60;
const THEFT_MAX_SPEED_KMH = 1;

const DEFAULT_MIN_EFFICIENCY_KM_PER_L = 2.0;
const ABNORMAL_MIN_DISTANCE_KM = 0.3;
const ABNORMAL_MIN_FUEL_USED_L = 0.5;

const REFUEL_MIN_INCREASE_LITRES = 30;

const DEFAULT_SPEED_LIMIT_KMH = 80;
const DEFAULT_MAX_PAYLOAD_KG = 30000;

const lastReadingByVehicle = new Map();

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

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

function evaluateTelemetry(
  vehicleId,
  current,
  options = {}
) {
  const minEfficiency =
    options.minEfficiencyKmPerL ||
    DEFAULT_MIN_EFFICIENCY_KM_PER_L;

  const previous =
    lastReadingByVehicle.get(vehicleId);

  const alerts = [];

  if (!previous) {
    if (current.engineOn === true) {
      alerts.push({
        alertType: 'ENGINE_START',
        severity: 'LOW',
        message:
          'Engine start detected. Driver trip logging is required.',
      });
    }

    lastReadingByVehicle.set(
      vehicleId,
      current
    );

    return alerts;
  }

  const deltaSeconds =
    (current.recordedAt.getTime() -
      previous.recordedAt.getTime()) /
    1000;

  const fuelDelta =
    current.fuelLevelLitres -
    previous.fuelLevelLitres;

  const distanceKm = haversineKm(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude
  );

  if (deltaSeconds > 0) {
    const engineStarted =
      current.engineOn === true &&
      previous.engineOn !== true;

    const engineIsOn =
      current.engineOn === true;

    if (engineStarted) {
      alerts.push({
        alertType: 'ENGINE_START',
        severity: 'LOW',
        message:
          'Engine start detected. Driver trip logging is required.',
      });
    }

    const currentSpeedLimit = Number(
      current.speedLimitKmh ||
        DEFAULT_SPEED_LIMIT_KMH
    );

    const previousWasOverspeeding =
      previous.speed >
      Number(
        previous.speedLimitKmh ||
          currentSpeedLimit
      );

    const currentIsOverspeeding =
      engineIsOn &&
      current.speed > currentSpeedLimit;

    if (
      currentIsOverspeeding &&
      !previousWasOverspeeding
    ) {
      alerts.push({
        alertType: 'OVERSPEEDING',
        severity:
          current.speed >=
          currentSpeedLimit + 20
            ? 'HIGH'
            : 'MEDIUM',

        message:
          `Overspeeding detected at ${current.speed.toFixed(
            1
          )} km/h against a ${currentSpeedLimit.toFixed(
            0
          )} km/h limit.`,
      });
    }

    const currentMaxPayload = Number(
      current.maxPayloadKg ||
        DEFAULT_MAX_PAYLOAD_KG
    );

    const previousWasOverweight =
      Number(previous.loadWeightKg || 0) >
      Number(
        previous.maxPayloadKg ||
          currentMaxPayload
      );

    const currentIsOverweight =
      Number(current.loadWeightKg || 0) >
      currentMaxPayload;

    if (
      currentIsOverweight &&
      !previousWasOverweight
    ) {
      alerts.push({
        alertType: 'OVERWEIGHT',
        severity: 'HIGH',

        message:
          `Overweight load detected: ${Number(
            current.loadWeightKg
          ).toFixed(
            0
          )} kg exceeds the ${currentMaxPayload.toFixed(
            0
          )} kg payload limit.`,
      });
    }

    if (
      current.routeCompleted === true &&
      previous.routeCompleted !== true
    ) {
      alerts.push({
        alertType: 'ROUTE_COMPLETED',
        severity: 'LOW',
        message:
          'Configured route completed. Vehicle reached its destination and is ready for the next trip.',
      });
    }

    const drop = -fuelDelta;

    if (
      drop >= THEFT_MIN_DROP_LITRES &&
      deltaSeconds <=
        THEFT_MAX_WINDOW_SECONDS &&
      current.speed <=
        THEFT_MAX_SPEED_KMH &&
      previous.speed <=
        THEFT_MAX_SPEED_KMH
    ) {
      alerts.push({
        alertType: 'THEFT_SUSPECTED',
        severity: 'HIGH',
        message:
          `Possible fuel theft detected. Fuel level dropped by ${drop.toFixed(
            1
          )} L while the vehicle was stationary.`,
      });
    } else if (
      fuelDelta >=
      REFUEL_MIN_INCREASE_LITRES
    ) {
      alerts.push({
        alertType: 'REFUEL',
        severity: 'LOW',
        message:
          `Refuelling detected. Fuel level increased by ${fuelDelta.toFixed(
            1
          )} L.`,
      });
    } else if (
      drop > 0 &&
      distanceKm >=
        ABNORMAL_MIN_DISTANCE_KM &&
      drop >= ABNORMAL_MIN_FUEL_USED_L
    ) {
      const kmPerLitre =
        distanceKm / drop;

      if (
        kmPerLitre <
        minEfficiency
      ) {
        alerts.push({
          alertType:
            'ABNORMAL_CONSUMPTION',
          severity: 'MEDIUM',
          message:
            `Abnormal fuel consumption detected. Efficiency of ${kmPerLitre.toFixed(
              2
            )} km/L is below the expected minimum of ${minEfficiency.toFixed(
              2
            )} km/L.`,
        });
      }
    }
  }

  lastReadingByVehicle.set(
    vehicleId,
    current
  );

  return alerts;
}

function resetVehicleState(vehicleId) {
  lastReadingByVehicle.delete(
    vehicleId
  );
}

module.exports = {
  evaluateTelemetry,
  resetVehicleState,
  haversineKm,
  DEFAULT_MIN_EFFICIENCY_KM_PER_L,
};