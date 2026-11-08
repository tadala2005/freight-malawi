'use strict';

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
  'ROUTE_COMPLETION'
];

const clamp = (v, a, b) =>
  Math.max(a, Math.min(b, v));

const rand = (a, b) =>
  a + Math.random() * (b - a);

function speedForScenario(
  scenario,
  progress,
  tick,
  limit = 80,
  state = {}
) {
  const dt = state.dtSeconds === undefined
    ? 2
    : Math.max(0, state.dtSeconds);

  const elapsed = state.elapsedSeconds || 0;

  let target = progress > 0.97 ? 30 : 65;
  let acceleration = 0.7;

  if (
    scenario === 'OVERSPEEDING' &&
    elapsed >= 20 &&
    elapsed < 80
  ) {
    target = Number(limit) + 12;
  }

  if (
    scenario === 'AGGRESSIVE_DRIVER' &&
    elapsed >= 20 &&
    elapsed < 100
  ) {
    target =
      Math.floor((elapsed - 20) / 8) % 2
        ? 30
        : 95;

    acceleration = 3;
  }

  if (
    scenario === 'EXCESSIVE_IDLE' &&
    elapsed < 660
  ) {
    target = 0;
  }

  if (
    !state.eventDone &&
    !state.fuelStop &&
    elapsed >= 30 &&
    ['REFUEL', 'FUEL_THEFT'].includes(scenario)
  ) {
    state.fuelStop = {
      kind: scenario === 'REFUEL'
        ? 'REFUEL'
        : 'THEFT',

      parkedSeconds: 0,
      removed: 0
    };
  }

  if (state.fuelStop) target = 0;

  const current = state.currentSpeedKmh || 0;
  const change = acceleration * 3.6 * dt;

  const speed = clamp(
    current + clamp(target - current, -change, change),
    0,
    120
  );

  state.currentSpeedKmh = speed;

  if (state.fuelStop) {
    state.fuelStop.parkedSeconds = speed < 0.1
      ? state.fuelStop.parkedSeconds + dt
      : 0;
  }

  return speed;
}

function fuelEventForScenario(
  scenario,
  progress,
  state,
  fuel,
  capacity
) {
  const stop = state.fuelStop;

  if (!stop || stop.parkedSeconds < 6) return 0;

  const dt = state.dtSeconds === undefined
    ? 2
    : Math.max(0, state.dtSeconds);

  let delta;

  if (stop.kind === 'REFUEL') {
    // Assumed demonstration pump rate: 40 L/min.
    delta = Math.min(
      Math.max(0, capacity - fuel),
      40 * dt / 60
    );

    if (capacity - (fuel + delta) < 0.001) {
      state.eventDone = true;
    }
  } else {
    // Assumed demonstration drain rate: 12 L/min.
    const target = Math.min(35, capacity * 0.15);

    delta = -Math.min(
      fuel,
      Math.max(0, target - stop.removed),
      12 * dt / 60
    );

    stop.removed -= delta;

    if (
      stop.removed >= target - 0.001 ||
      fuel + delta <= 0
    ) {
      state.eventDone = true;
    }
  }

  if (state.eventDone) state.fuelStop = null;

  return delta;
}

function cargoWeightForScenario(
  scenario,
  capacity,
  requested
) {
  capacity = Number(capacity) || 12000;

  if (scenario === 'OVERWEIGHT') {
    return capacity * 1.18;
  }

  return (
    requested != null &&
    Number.isFinite(Number(requested)) &&
    Number(requested) >= 0
  )
    ? Number(requested)
    : capacity * 0.75;
}

function initialFuelPercent(scenario) {
  return scenario === 'LOW_FUEL' ? 12 : 82;
}

function isDeviating() {
  // No instantaneous lateral jumps.
  return false;
}

function shouldDisconnectNow(scenario, tick) {
  return scenario === 'DEVICE_DISCONNECT' && tick === 20;
}

module.exports = {
  SCENARIOS,
  rand,
  speedForScenario,
  fuelEventForScenario,
  cargoWeightForScenario,
  initialFuelPercent,
  isDeviating,
  shouldDisconnectNow
};
