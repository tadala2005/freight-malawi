
'use strict';

// FREIGHT MALAWI — SIMULATION SCENARIOS
// Every vehicle refuels once during a new trip.
// FUEL_THEFT makes a second stop with a sudden fuel drop.
// Existing backend rules determine alert severity.

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

const REFUEL_AT = 0.42;
const THEFT_AT = 0.62;

const REFUEL_LITRES = 60;
const THEFT_LITRES = 35;

// Keep the vehicle stationary long enough for
// the backend to establish a fuel baseline.
const STATIONARY_BASELINE_TICKS = 3;
const STOP_DURATION_TICKS = 6;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothToward(current, target, maxDelta) {
  if (!Number.isFinite(current)) {
    return target;
  }

  const difference = target - current;

  if (Math.abs(difference) <= maxDelta) {
    return target;
  }

  return current + Math.sign(difference) * maxDelta;
}

function baselineTarget(progressFraction, tickIndex) {
  if (
    progressFraction < 0.04 ||
    progressFraction > 0.96
  ) {
    return 42;
  }

  return [
    68,
    73,
    76,
    70,
    74,
  ][Math.floor(tickIndex / 18) % 5];
}

// Automatically schedule a fuel stop.
function beginScheduledStop(
  scenario,
  progressFraction,
  state
) {
  if (state.fuelStop) {
    return;
  }

  // Every truck refuels once per prepared trip.
  if (
    !state.refuelApplied &&
    progressFraction >= REFUEL_AT &&
    progressFraction < 0.95
  ) {
    state.fuelStop = {
      kind: 'REFUEL',
      parkedTicks: 0,
      eventSent: false,
    };

    return;
  }

  // The theft scenario has a separate stop.
  if (
    scenario === 'FUEL_THEFT' &&
    state.refuelApplied &&
    !state.theftApplied &&
    progressFraction >= THEFT_AT &&
    progressFraction < 0.95
  ) {
    state.fuelStop = {
      kind: 'THEFT',
      parkedTicks: 0,
      eventSent: false,
    };
  }
}

function speedForScenario(
  scenario,
  progressFraction,
  tickIndex,
  overspeedThreshold,
  state = {}
) {
  beginScheduledStop(
    scenario,
    progressFraction,
    state
  );

  const current = Number.isFinite(
    state.currentSpeedKmh
  )
    ? state.currentSpeedKmh
    : 0;

  let target = baselineTarget(
    progressFraction,
    tickIndex
  );

  let maxDelta = 8;

  switch (scenario) {
    case 'OVERSPEEDING':
      target = clamp(
        Number(overspeedThreshold || 80) + 12,
        88,
        98
      );
      break;

    case 'AGGRESSIVE_DRIVER':
      target = [
        35,
        105,
        25,
        100,
      ][Math.floor(tickIndex / 4) % 4];

      maxDelta = 60;
      break;

    case 'ROUTE_COMPLETION':
      target = 72;
      maxDelta = 7;
      break;

    case 'EXCESSIVE_IDLE':
      // A bounded idle stop, so movement can resume.
      if (
        !state.extraIdleDone &&
        progressFraction >= 0.30 &&
        !state.fuelStop
      ) {
        state.extraIdleTicks =
          (state.extraIdleTicks || 0) + 1;

        target = 0;

        if (
          state.extraIdleTicks >= 25 &&
          current <= 1
        ) {
          state.extraIdleDone = true;
        }
      }
      break;

    default:
      break;
  }

  // Scheduled stop overrides the driving scenario.
  if (state.fuelStop) {
    target = 0;
    maxDelta = 12;
  }

  const next = clamp(
    smoothToward(current, target, maxDelta),
    0,
    120
  );

  state.currentSpeedKmh = next;

  const stop = state.fuelStop;

  if (stop) {
    if (next <= 0.1) {
      stop.parkedTicks += 1;
    } else {
      stop.parkedTicks = 0;
    }

    // Allow several readings after the fuel event
    // before the truck begins moving again.
    if (
      stop.eventSent &&
      stop.parkedTicks >= STOP_DURATION_TICKS
    ) {
      state.fuelStop = null;
    }
  }

  return next;
}

function fuelEventForScenario(
  scenario,
  progressFraction,
  state = {}
) {
  const stop = state.fuelStop;

  if (
    !stop ||
    stop.eventSent ||
    stop.parkedTicks < STATIONARY_BASELINE_TICKS
  ) {
    return 0;
  }

  stop.eventSent = true;

  if (stop.kind === 'REFUEL') {
    state.refuelApplied = true;

    return REFUEL_LITRES;
  }

  if (
    stop.kind === 'THEFT' &&
    scenario === 'FUEL_THEFT'
  ) {
    state.theftApplied = true;

    return -THEFT_LITRES;
  }

  return 0;
}

function cargoWeightForScenario(
  scenario,
  payloadCapacityKg,
  requestedWeightKg
) {
  const capacity = Math.max(
    1,
    Number(payloadCapacityKg || 12000)
  );

  const requested = Number(requestedWeightKg);

  if (scenario === 'OVERWEIGHT') {
    return Math.round(capacity * 1.18);
  }

  if (
    Number.isFinite(requested) &&
    requested > 0
  ) {
    return Math.round(requested * 100) / 100;
  }

  return Math.round(capacity * 0.75);
}

function isDeviating(
  scenario,
  progressFraction
) {
  return (
    scenario === 'ROUTE_DEVIATION' &&
    progressFraction > 0.45 &&
    progressFraction < 0.55
  );
}

function initialFuelPercent(scenario) {
  if (scenario === 'LOW_FUEL') {
    return rand(8, 13);
  }

  return 82;
}

function shouldDisconnectNow(
  scenario,
  tickIndex
) {
  return (
    scenario === 'DEVICE_DISCONNECT' &&
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
