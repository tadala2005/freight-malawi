
'use strict';

// FREIGHT MALAWI — SIMULATION SCENARIOS
// Every truck refuels to 100% of its configured tank capacity.
// Truck 2 also demonstrates a stationary fuel-theft event.

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

// Demonstration-friendly event positions.
const REFUEL_AT = 0.08;
const THEFT_AT = 0.18;

// Fuel theft removes 35 litres while stationary.
const THEFT_LITRES = 35;

// Number of stationary readings before the event.
const BASELINE_TICKS = 4;

// Total stationary readings before driving resumes.
const STOP_TICKS = 8;

const rand = (min, max) =>
  min + Math.random() * (max - min);

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

function smoothToward(current, target, maximumChange) {
  if (!Number.isFinite(current)) {
    return target;
  }

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

  return [68, 73, 76, 70, 74][
    Math.floor(tick / 18) % 5
  ];
}

// Schedule one refuel for every truck.
// Schedule a separate theft stop for FUEL_THEFT.
function beginScheduledStop(scenario, progress, state) {
  if (state.fuelStop) return;

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

// Calculate simulated driving speed.
// Fuel stops override movement until the event is complete.
function speedForScenario(
  scenario,
  progress,
  tick,
  overspeedThreshold,
  state = {}
) {
  beginScheduledStop(scenario, progress, state);

  const current = Number.isFinite(state.currentSpeedKmh)
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
      target = [35, 105, 25, 100][
        Math.floor(tick / 4) % 4
      ];
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

  // Ensure vehicle is stationary for refuelling/theft.
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

    if (
      stop.eventSent &&
      stop.parkedTicks >= STOP_TICKS
    ) {
      state.fuelStop = null;
    }
  }

  return speed;
}

/*
 * FUEL EVENTS
 *
 * Refuelling:
 *   Amount added = tank capacity - current fuel
 *
 * This ensures the tank reaches 100%, not a fixed
 * increase of 60 litres.
 *
 * Fuel theft:
 *   Remove 35 litres while stationary.
 */
function fuelEventForScenario(
  scenario,
  progress,
  state = {},
  currentFuelLitres,
  tankCapacity
) {
  const stop = state.fuelStop;

  if (
    !stop ||
    stop.eventSent ||
    stop.parkedTicks < BASELINE_TICKS
  ) {
    return 0;
  }

  // =====================================
  // REFUELLING — FILL TO 100%
  // =====================================
  if (stop.kind === 'REFUEL') {
    const capacity = Number(tankCapacity);
    const current = Number(currentFuelLitres);

    if (
      !Number.isFinite(capacity) ||
      capacity <= 0 ||
      !Number.isFinite(current)
    ) {
      console.error(
        '[SIM EVENT] REFUEL skipped: invalid tank capacity or fuel reading'
      );

      return 0;
    }

    const remainingFuel = clamp(
      current,
      0,
      capacity
    );

    const litresAdded = Math.max(
      0,
      capacity - remainingFuel
    );

    stop.eventSent = true;
    state.refuelApplied = true;

    console.log(
      `[SIM EVENT] REFUEL +${litresAdded.toFixed(2)} L ` +
      `-> FULL ${capacity} L (100%) ` +
      `at ${(progress * 100).toFixed(1)}% route`
    );

    return litresAdded;
  }

  // =====================================
  // FUEL THEFT — TRUCK 2
  // =====================================
  if (
    stop.kind === 'THEFT' &&
    scenario === 'FUEL_THEFT'
  ) {
    stop.eventSent = true;
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

// Cargo weight and load scenarios.
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

// Route deviation scenario.
function isDeviating(scenario, progress) {
  return (
    scenario === 'ROUTE_DEVIATION' &&
    progress > 0.45 &&
    progress < 0.55
  );
}

// Starting fuel level.
function initialFuelPercent(scenario) {
  if (scenario === 'LOW_FUEL') {
    return rand(8, 13);
  }

  return 82;
}

// Device disconnect scenario.
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
