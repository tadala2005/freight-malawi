// ============================================================================
// Deterministic, rule-based fuel-theft suspicion detector (NOT machine
// learning — this is an explicit, documented threshold rule, per the
// project's academic-accuracy requirement).
//
// Rule: fuel drop > 5 litres AND time difference < 60 seconds AND the
// vehicle was stationary (speed effectively zero) for both readings.
// ============================================================================
const FUEL_DROP_THRESHOLD_L = 5;
const MAX_WINDOW_SECONDS = 60;
const STATIONARY_SPEED_KMH = 2; // treat <=2 km/h as "stationary" to absorb GPS/sensor jitter

function detectTheft(previous, reading) {
  return require('./fuelEvents')
    .observe(previous, reading)
    .theft || null;
}

module.exports = { detectTheft, FUEL_DROP_THRESHOLD_L, MAX_WINDOW_SECONDS };
