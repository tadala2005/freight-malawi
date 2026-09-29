// ============================================================================
// Canonical alert type -> category mapping. Kept in one place so the
// telemetry pipeline, reports and the frontend all agree on grouping.
// ============================================================================
const CATEGORY_BY_TYPE = {
  THEFT_SUSPECTED: 'FUEL',
  ABNORMAL_CONSUMPTION: 'FUEL',
  REFUEL: 'FUEL',
  LOW_FUEL: 'FUEL',
  OVERSPEEDING: 'SAFETY',
  HARSH_DRIVING: 'DRIVER',
  AGGRESSIVE_DRIVING: 'DRIVER',
  EXCESSIVE_IDLE: 'DRIVER',
  FREQUENT_SPEED_VARIATION: 'DRIVER',
  OVERWEIGHT: 'LOAD',
  ROUTE_DEVIATION: 'ROUTE',
  POWER_LOSS: 'SYSTEM',
  DEVICE_OFFLINE: 'SYSTEM',
  DEVICE_RECONNECTED: 'SYSTEM',
  IGNITION_STARTED: 'TRIP',
  ROUTE_COMPLETED: 'TRIP',
  TRIP_PENDING_DETAILS: 'TRIP',
};

const LOW_FUEL_PERCENT_THRESHOLD = 15;

function categoryFor(type) {
  return CATEGORY_BY_TYPE[type] || 'SYSTEM';
}

module.exports = { CATEGORY_BY_TYPE, categoryFor, LOW_FUEL_PERCENT_THRESHOLD };
