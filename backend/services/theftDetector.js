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

function detectTheft(prevReading, currentReading) {
  if (!prevReading) return null;

  const prevFuel = Number(prevReading.fuel_level_litres);
  const currentFuel = Number(currentReading.fuel_level_litres);
  const drop = prevFuel - currentFuel;
  if (drop <= FUEL_DROP_THRESHOLD_L) return null;

  const prevTime = new Date(prevReading.recorded_at).getTime();
  const currentTime = new Date(currentReading.recorded_at).getTime();
  const dtSeconds = (currentTime - prevTime) / 1000;
  if (dtSeconds <= 0 || dtSeconds > MAX_WINDOW_SECONDS) return null;

  const prevStationary = Number(prevReading.speed) <= STATIONARY_SPEED_KMH;
  const currentStationary = Number(currentReading.speed) <= STATIONARY_SPEED_KMH;
  if (!prevStationary || !currentStationary) return null;

  return {
    dropLitres: Math.round(drop * 10) / 10,
    dtSeconds: Math.round(dtSeconds),
    message: `Possible fuel theft detected. Fuel level dropped by ${Math.round(drop * 10) / 10} L while the vehicle was stationary.`,
  };
}

module.exports = { detectTheft, FUEL_DROP_THRESHOLD_L, MAX_WINDOW_SECONDS };
