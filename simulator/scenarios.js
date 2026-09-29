// ============================================================================
// FREIGHT MALAWI DRIVER SCENARIOS
//
// NORMAL:
//   Smooth, believable speed changes.
//
// OVERSPEEDING:
//   Smoothly maintains a speed above the configured threshold.
//
// AGGRESSIVE_DRIVER:
//   Deliberately creates large acceleration/braking events.
//
// FUEL_THEFT:
//   Vehicle stops and fuel drops suddenly.
//
// REFUEL:
//   Vehicle stops and fuel rises suddenly.
//
// OVERWEIGHT:
//   Cargo exceeds the configured vehicle payload capacity.
//
// EXCESSIVE_IDLE:
//   Vehicle remains stationary with ignition ON.
//
// ROUTE_DEVIATION:
//   Vehicle moves outside the route corridor.
//
// LOW_FUEL:
//   Vehicle starts with a low fuel level.
//
// DEVICE_DISCONNECT:
//   Simulator periodically disconnects and reconnects.
//
// ROUTE_COMPLETION:
//   Vehicle completes its assigned route.
// ============================================================================

const SCENARIOS = [
  'NORMAL',
  'FUEL_THEFT',
  'REFUEL',
  'OVERSPEEDING',
  'OVERWEIGHT',
  'AGGRESSIVE_DRIVER',
  'EXCESSIVE_IDLE',
  'ROUTE_DEVIATION',
  'LOW_FUEL',
  'DEVICE_DISCONNECT',
  'ROUTE_COMPLETION',
];

function rand(min, max) {
  return (
    min +
    Math.random() *
      (max - min)
  );
}

function clamp(
  value,
  min,
  max,
) {
  return Math.max(
    min,
    Math.min(max, value),
  );
}

function smoothToward(
  current,
  target,
  maxDelta,
) {
  if (
    !Number.isFinite(current)
  ) {
    return target;
  }

  const difference =
    target - current;

  if (
    Math.abs(difference) <=
    maxDelta
  ) {
    return target;
  }

  return (
    current +
    Math.sign(difference) *
      maxDelta
  );
}

function baselineTarget(
  progressFraction,
  tickIndex,
) {
  // City-entry/exit traffic.
  if (
    progressFraction < 0.04 ||
    progressFraction > 0.96
  ) {
    return 42;
  }

  // Long-haul M1 cruising pattern.
  const phase =
    Math.floor(tickIndex / 18) %
    5;

  return [
    68,
    73,
    76,
    70,
    74,
  ][phase];
}

function speedForScenario(
  scenario,
  progressFraction,
  tickIndex,
  overspeedThreshold,
  state = {},
) {
  const current =
    Number.isFinite(
      state.currentSpeedKmh,
    )
      ? state.currentSpeedKmh
      : 0;

  let target;
  let maxDelta = 8;

  switch (scenario) {
    case 'OVERSPEEDING': {
      target = clamp(
        Number(
          overspeedThreshold || 80,
        ) + 12,
        88,
        98,
      );

      // Smooth changes prevent the overspeeding vehicle from also looking like
      // an aggressive driver.
      maxDelta = 8;
      break;
    }

    case 'AGGRESSIVE_DRIVER': {
      const phase =
        Math.floor(tickIndex / 4) %
        4;

      target = [
        35,
        105,
        25,
        100,
      ][phase];

      // Large speed changes intentionally produce genuine acceleration or
      // braking above the backend's harsh-driving threshold.
      maxDelta = 60;
      break;
    }

    case 'ROUTE_COMPLETION':
      target = 72;
      maxDelta = 7;
      break;

    case 'FUEL_THEFT':
      target =
        progressFraction > 0.38 &&
        progressFraction < 0.44
          ? 0
          : baselineTarget(
              progressFraction,
              tickIndex,
            );

      maxDelta = 8;
      break;

    case 'REFUEL':
      target =
        progressFraction > 0.58 &&
        progressFraction < 0.63
          ? 0
          : baselineTarget(
              progressFraction,
              tickIndex,
            );

      maxDelta = 8;
      break;

    case 'EXCESSIVE_IDLE':
      target =
        progressFraction > 0.30 &&
        progressFraction < 0.55
          ? 0
          : baselineTarget(
              progressFraction,
              tickIndex,
            );

      maxDelta = 8;
      break;

    default:
      target =
        baselineTarget(
          progressFraction,
          tickIndex,
        );

      maxDelta = 8;
      break;
  }

  const next =
    clamp(
      smoothToward(
        current,
        target,
        maxDelta,
      ),
      0,
      120,
    );

  state.currentSpeedKmh =
    next;

  return next;
}

function fuelEventForScenario(
  scenario,
  progressFraction,
  state,
) {
  if (
    scenario ===
      'FUEL_THEFT' &&
    progressFraction >= 0.40 &&
    progressFraction < 0.405 &&
    !state.theftApplied
  ) {
    state.theftApplied = true;

    return -18;
  }

  if (
    scenario === 'REFUEL' &&
    progressFraction >= 0.60 &&
    progressFraction < 0.605 &&
    !state.refuelApplied
  ) {
    state.refuelApplied = true;

    return 70;
  }

  return 0;
}

function cargoWeightForScenario(
  scenario,
  payloadCapacityKg,
  requestedWeightKg,
) {
  const capacity =
    Math.max(
      1,
      Number(
        payloadCapacityKg ||
          12000,
      ),
    );

  const requested =
    Number(requestedWeightKg);

  if (
    scenario ===
    'OVERWEIGHT'
  ) {
    return Math.round(
      capacity * 1.18,
    );
  }

  // If Logbook supplied a cargo weight, that exact weight is used for the
  // whole trip.
  if (
    Number.isFinite(requested) &&
    requested > 0
  ) {
    return Math.round(
      requested * 100,
    ) / 100;
  }

  // Default loaded truck = 75% of rated payload.
  return Math.round(
    capacity * 0.75,
  );
}

function isDeviating(
  scenario,
  progressFraction,
) {
  return (
    scenario ===
      'ROUTE_DEVIATION' &&
    progressFraction > 0.45 &&
    progressFraction < 0.55
  );
}

function initialFuelPercent(
  scenario,
) {
  if (
    scenario === 'LOW_FUEL'
  ) {
    return rand(8, 13);
  }

  return 82;
}

function shouldDisconnectNow(
  scenario,
  tickIndex,
) {
  return (
    scenario ===
      'DEVICE_DISCONNECT' &&
    tickIndex > 0 &&
    tickIndex % 36 === 0
  );
}

module.exports = {
  SCENARIOS,
  rand,
  speedForScenario,
  fuelEventForScenario,
  cargoWeightForScenario,
  isDeviating,
  initialFuelPercent,
  shouldDisconnectNow,
};