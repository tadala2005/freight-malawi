
'use strict';

// FREIGHT MALAWI — SIMULATION SCENARIOS
// These functions are called by simulate.js.
// Keep the exported functions and their arguments unchanged.

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

// Earlier, deterministic events for project demonstration.
const REFUEL_AT = 0.08;
const THEFT_AT = 0.18;

const REFUEL_LITRES = 60;
const THEFT_LITRES = 35;

// Four stationary readings before changing fuel.
// Eight stationary readings before driving resumes.
const BASELINE_TICKS = 4;
const STOP_TICKS = 8;

const rand = (min, max) =>
  min + Math.random() * (max - min);

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

function smoothToward(current, target, maximumChange) {
  if (!Number.isFinite(current)) return target;

  const difference = target - current;

  if (Math.abs(difference) <= maximumChange) {
    return target;
  }

  return current +
    Math.sign(difference) * maximumChange;
}

function baselineTarget(progress, tick) {
  if (progress < 0.04 || progress > 0.96) {
    return 42;
  }

  return [
    68,
    73,
    76,
    70,
    74
  ][Math.floor(tick / 18) % 5];
}

function beginScheduledStop(scenario, progress, state) {
  if (state.fuelStop) return;

  // Every vehicle refuels once per new trip.
  if (
    !state.refuelApplied &&
    progress >= REFUEL_AT &&
    progress < 0.95
  ) {
    state.fuelStop = {
      kind: 'REFUEL',
      parkedTicks: 0,
      eventSent: false
    };

    return;
  }

  // Truck 2 makes a second stop for fuel theft.
  if (
    scenario === 'FUEL_THEFT' &&
    state.refuelApplied &&
    !state.theftApplied &&
    progress >= THEFT_AT &&
    progress < 0.95
  ) {
    state.fuelStop = {
      kind: 'THEFT',
      parkedTicks: 0,
      eventSent: false
    };
  }
}

function speedForScenario(
  scenario,
  progress,
  tick,
  overspeedThreshold,
  state = {}
) {
  beginScheduledStop(scenario, progress, state);

  const current = Number.isFinite(
    state.currentSpeedKmh
  )
    ? state.currentSpeedKmh
    : 0;

  let target = baselineTarget(progress, tick);
  let maximumChange = 8;

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
        100
      ][Math.floor(tick / 4) % 4];

      maximumChange = 60;
      break;

    case 'ROUTE_COMPLETION':
      target = 72;
      maximumChange = 7;
      break;

    case 'EXCESSIVE_IDLE':
      if (
        !state.extraIdleDone &&
        progress >= 0.30 &&
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

  // Fuel events require several consecutive readings
  // showing that the vehicle is stationary.
  if (state.fuelStop) {
    target = 0;
    maximumChange = 12;
  }

  const speed = clamp(
    smoothToward(current, target, maximumChange),
    0,
    120
  );

  state.currentSpeedKmh = speed;

  if (state.fuelStop) {
    const stop = state.fuelStop;

    stop.parkedTicks = speed <= 0.1
      ? stop.parkedTicks + 1
      : 0;

    // Hold the vehicle stationary after refuelling
    // or theft so the backend receives follow-up data.
    if (
      stop.eventSent &&
      stop.parkedTicks >= STOP_TICKS
    ) {
      state.fuelStop = null;
    }
  }

  return speed;
}

function fuelEventForScenario(
  scenario,
  progress,
  state = {}
) {
  const stop = state.fuelStop;

  if (
    !stop ||
    stop.eventSent ||
    stop.parkedTicks < BASELINE_TICKS
  ) {
    return 0;
  }

  stop.eventSent = true;

  if (stop.kind === 'REFUEL') {
    state.refuelApplied = true;

    console.log(
      `[SIM EVENT] REFUEL +${REFUEL_LITRES} L at ` +
      `${(progress * 100).toFixed(1)}% route`
    );

    return REFUEL_LITRES;
  }

  if (
    stop.kind === 'THEFT' &&
    scenario === 'FUEL_THEFT'
  ) {
    state.theftApplied = true;

    console.log(
      `[SIM EVENT] THEFT -${THEFT_LITRES} L ` +
      `while STOPPED at ` +
      `${(progress * 100).toFixed(1)}% route`
    );

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

  if (scenario === 'OVERWEIGHT') {
    return Math.round(capacity * 1.18);
  }

  const requested = Number(requestedWeightKg);

  return Number.isFinite(requested) &&
    requested > 0
    ? Math.round(requested * 100) / 100
    : Math.round(capacity * 0.75);
}

function isDeviating(scenario, progress) {
  return (
    scenario === 'ROUTE_DEVIATION' &&
    progress > 0.45 &&
    progress < 0.55
  );
}

function initialFuelPercent(scenario) {
  return scenario === 'LOW_FUEL'
    ? rand(8, 13)
    : 82;
}

function shouldDisconnectNow(scenario, tick) {
  return (
    scenario === 'DEVICE_DISCONNECT' &&
    tick > 0 &&
    tick % 36 === 0
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
  shouldDisconnectNow
};
