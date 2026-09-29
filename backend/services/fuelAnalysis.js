// ============================================================================
// Refuelling detection and abnormal fuel-consumption detection. Both are
// deterministic, configurable rule-based checks — not machine learning.
// ============================================================================
const REFUEL_THRESHOLD_L = 30;
const DEFAULT_MIN_KM_PER_L = 2.0;
const MIN_DISTANCE_FOR_CONSUMPTION_CHECK_KM = 15;

function detectRefuel(prevReading, currentReading) {
  if (!prevReading) return null;
  const prevFuel = Number(prevReading.fuel_level_litres);
  const currentFuel = Number(currentReading.fuel_level_litres);
  const rise = currentFuel - prevFuel;
  if (rise < REFUEL_THRESHOLD_L) return null;
  return {
    litresAdded: Math.round(rise * 10) / 10,
    oldLevel: prevFuel,
    newLevel: currentFuel,
    message: `Refuelling detected. Fuel level rose by ${Math.round(rise * 10) / 10} L (from ${prevFuel} L to ${currentFuel} L).`,
  };
}

/**
 * Checks whether a trip's cumulative distance/fuel-used ratio has fallen
 * below the configured threshold. Only evaluated once enough distance has
 * accumulated to avoid noise from short segments.
 */
function detectAbnormalConsumption(cumulativeDistanceKm, cumulativeFuelUsedL, thresholdKmPerL = DEFAULT_MIN_KM_PER_L) {
  const distance = Number(cumulativeDistanceKm || 0);
  const fuelUsed = Number(cumulativeFuelUsedL || 0);
  if (distance < MIN_DISTANCE_FOR_CONSUMPTION_CHECK_KM || fuelUsed <= 0) return null;
  const kmPerL = distance / fuelUsed;
  if (kmPerL >= thresholdKmPerL) return null;
  return {
    kmPerLitre: Math.round(kmPerL * 100) / 100,
    threshold: thresholdKmPerL,
    message: `Fuel consumption is abnormally high: ${Math.round(kmPerL * 100) / 100} km/L over this trip (expected at least ${thresholdKmPerL} km/L).`,
  };
}

module.exports = { detectRefuel, detectAbnormalConsumption, REFUEL_THRESHOLD_L, DEFAULT_MIN_KM_PER_L };
