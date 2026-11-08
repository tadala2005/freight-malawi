'use strict';

const states = new Map();

function observe(previous, reading) {
  const key = String(reading.vehicle_id);
  const now = new Date(reading.recorded_at).getTime();
  const litres = Number(reading.fuel_level_litres);
  const capacity = Number(reading.fuel_tank_capacity);

  const threshold = Math.max(
    5,
    capacity * (reading.physical_fuel ? 0.08 : 0.03)
  );

  let state = states.get(key);

  if (state?.uuid === reading.telemetry_uuid) {
    return state.result;
  }

  const dt = previous
    ? (
        now -
        new Date(previous.recorded_at).getTime()
      ) / 1000
    : 0;

  const stationary =
    previous &&
    Number(previous.speed) <= 2 &&
    Number(reading.speed) <= 2;

  if (
    !stationary ||
    dt <= 0 ||
    dt > 20 ||
    !Number.isFinite(threshold)
  ) {
    states.delete(key);
    return {};
  }

  if (!state || now - state.lastAt > 20000) {
    state = {
      baseline: Number(previous.fuel_level_litres),
      direction: 0,
      confirmations: 0,
      latched: false,
      lastFuel: litres,
      quietSince: now
    };
  }

  const delta = litres - state.baseline;

  const direction = Math.abs(delta) >= threshold
    ? Math.sign(delta)
    : 0;

  state.result = {};

  if (!state.latched && direction) {
    state.confirmations =
      direction === state.direction
        ? state.confirmations + 1
        : 1;

    state.direction = direction;

    if (state.confirmations >= 3) {
      const amount = Number(
        Math.abs(delta).toFixed(2)
      );

      const event = {
        oldLevel: state.baseline,
        newLevel: litres,

        message:
          `${direction > 0 ? 'Refuelling' : 'Possible fuel loss'}: ` +
          `confirmed stationary ${direction > 0 ? 'rise' : 'drop'} ` +
          `of ${amount} L` +
          `${reading.physical_fuel ? ' equivalent (scaled model)' : ''}. ` +
          'Investigate sensor readings and activity.',

        ...(direction > 0
          ? { litresAdded: amount }
          : { dropLitres: amount })
      };

      state.result[
        direction > 0 ? 'refuel' : 'theft'
      ] = event;

      state.latched = true;
      state.quietSince = now;
    }
  } else if (!direction) {
    state.confirmations = 0;
    state.direction = 0;
  }

  const movementTolerance = Math.max(
    0.05,
    capacity * 0.0005
  );

  if (
    Math.abs(litres - state.lastFuel) >
    movementTolerance
  ) {
    state.quietSince = now;
  }

  // Rearm after the level settles.
  if (now - state.quietSince >= 10000) {
    state.baseline = litres;
    state.latched = false;
    state.confirmations = 0;
    state.quietSince = now;
  }

  state.lastFuel = litres;
  state.lastAt = now;
  state.uuid = reading.telemetry_uuid;

  states.set(key, state);

  return state.result;
}

module.exports = { observe };
