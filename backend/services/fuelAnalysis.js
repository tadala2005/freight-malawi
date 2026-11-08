'use strict';

const { observe } = require('./fuelEvents');

const REFUEL_THRESHOLD_L = 5;
const DEFAULT_MIN_KM_PER_L = 2;
const MIN_DISTANCE_FOR_CONSUMPTION_CHECK_KM = 15;

function detectRefuel(previous, reading) {
  return observe(previous, reading).refuel || null;
}

function detectAbnormalConsumption(
  cumulativeDistanceKm,
  cumulativeFuelUsedL,
  thresholdKmPerL = DEFAULT_MIN_KM_PER_L
) {
  const distance = Number(cumulativeDistanceKm);
  const fuelUsed = Number(cumulativeFuelUsedL);

  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(fuelUsed) ||
    distance < MIN_DISTANCE_FOR_CONSUMPTION_CHECK_KM ||
    fuelUsed <= 0
  ) {
    return null;
  }

  const kmPerL = distance / fuelUsed;

  if (kmPerL >= thresholdKmPerL) return null;

  return {
    kmPerLitre: Number(kmPerL.toFixed(2)),
    threshold: thresholdKmPerL,

    message:
      `Fuel consumption is abnormally high: ` +
      `${kmPerL.toFixed(2)} km/L over this trip ` +
      `(expected at least ${thresholdKmPerL} km/L).`
  };
}

module.exports = {
  detectRefuel,
  detectAbnormalConsumption,
  REFUEL_THRESHOLD_L,
  DEFAULT_MIN_KM_PER_L
};
