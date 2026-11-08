'use strict';

const { observe } = require('./fuelEvents');

const FUEL_DROP_THRESHOLD_L = 5;
const MAX_WINDOW_SECONDS = 20;

function detectTheft(previous, reading) {
  return observe(previous, reading).theft || null;
}

module.exports = {
  detectTheft,
  FUEL_DROP_THRESHOLD_L,
  MAX_WINDOW_SECONDS
};
