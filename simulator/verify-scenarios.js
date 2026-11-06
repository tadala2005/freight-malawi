
'use strict';

const assert = require('node:assert/strict');
const scenarios = require('./scenarios');

const {
  totalDistanceKm
} = require('./routes');

const {
  detectTheft
} = require('../backend/services/theftDetector');

const {
  detectRefuel
} = require('../backend/services/fuelAnalysis');

const routeKm = totalDistanceKm(
  'BLANTYRE_LILONGWE'
);

assert.ok(routeKm > 0, 'Missing route');

function run(scenario, capacity, timeScale) {
  const state = {};

  const intervalSeconds = 2;

  let travelledKm = 0;
  let fuelLitres = capacity * 0.82;

  let previous = null;
  let refuels = 0;
  let thefts = 0;

  let firstRefuelSeconds = null;
  let firstTheftSeconds = null;

  for (
    let tick = 1;
    tick <= 900 && travelledKm < routeKm;
    tick++
  ) {
    const progressFraction =
      travelledKm / routeKm;

    const speed = scenarios.speedForScenario(
      scenario,
      progressFraction,
      tick,
      80,
      state
    );

    const distance = Math.min(
      routeKm - travelledKm,
      speed * intervalSeconds * timeScale / 3600
    );

    travelledKm += distance;

    const fuelEvent =
      scenarios.fuelEventForScenario(
        scenario,
        progressFraction,
        state
      );

    fuelLitres = Math.min(
      capacity,
      Math.max(
        0,
        fuelLitres - distance * 0.35 + fuelEvent
      )
    );

    const current = {
      speed,
      fuel_level_litres:
        Math.round(fuelLitres * 100) / 100,
      recorded_at: new Date(
        1762500000000 + tick * 2000
      ).toISOString()
    };

    if (detectRefuel(previous, current)) {
      refuels++;
      firstRefuelSeconds ??=
        tick * intervalSeconds;
    }

    if (detectTheft(previous, current)) {
      thefts++;
      firstTheftSeconds ??=
        tick * intervalSeconds;
    }

    previous = current;
  }

  assert.equal(
    refuels,
    1,
    `${scenario} must generate one refuel`
  );

  assert.equal(
    thefts,
    scenario === 'FUEL_THEFT' ? 1 : 0,
    `${scenario} incorrect theft count`
  );

  assert.ok(
    firstRefuelSeconds < 100,
    `${scenario} refuel was too late`
  );

  if (scenario === 'FUEL_THEFT') {
    assert.ok(
      firstTheftSeconds < 210,
      'Theft was too late'
    );
  }

  return {
    scenario,
    timeScale,
    refuels,
    thefts,
    refuelAfterSeconds: firstRefuelSeconds,
    theftAfterSeconds: firstTheftSeconds
  };
}

const cases = [
  ['NORMAL', 400],
  ['FUEL_THEFT', 450],
  ['AGGRESSIVE_DRIVER', 350]
];

for (const scale of [30, 90]) {
  for (const [scenario, capacity] of cases) {
    const result = run(
      scenario,
      capacity,
      scale
    );

    console.log('PASS', result);
  }
}

console.log(
  'All scenario/backend-rule simulations passed.'
);
