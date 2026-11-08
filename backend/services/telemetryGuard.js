'use strict';

const { pool } = require('../config/db');
const vehicles = require('../models/vehicleModel');
const telemetry = require('../models/telemetryModel');
const { AppError } = require('../middleware/errorHandler');

const queues = new Map();

function bad(message) {
  throw new AppError(message, 400, 'INVALID_TELEMETRY');
}

function normalise(vehicle, input) {
  const p = { ...input };

  function number(key, min, max, optional = false) {
    if (optional && p[key] === undefined) p[key] = 0;

    const value = p[key];

    if (
      value === null ||
      (typeof value === 'string' && !value.trim()) ||
      typeof value === 'boolean' ||
      !['number', 'string'].includes(typeof value) ||
      !Number.isFinite(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    ) {
      bad(`${key} must be between ${min} and ${max}.`);
    }

    p[key] = Number(value);
  }

  number('latitude', -90, 90);
  number('longitude', -180, 180);
  number('speed', 0, 250);
  number('heading', 0, 360, true);
  number('odometer_km', 0, 1e9);
  number('engine_hours', 0, 1e7);
  number('cargo_weight_kg', 0, 100000, true);
  number('fuel_percent', 0, 100);

  const capacity = Number(vehicle.fuel_tank_capacity);

  if (!Number.isFinite(capacity) || capacity <= 0) {
    bad('Invalid configured tank capacity.');
  }

  number('fuel_level_litres', 0, capacity);

  const calculatedPercent =
    p.fuel_level_litres * 100 / capacity;

  if (Math.abs(p.fuel_percent - calculatedPercent) > 0.25) {
    bad(
      'Fuel litres/percentage disagree with the vehicle tank capacity.'
    );
  }

  p.fuel_percent = Number(calculatedPercent.toFixed(2));

  if (typeof p.ignition_on !== 'boolean') {
    bad('ignition_on must be true or false.');
  }

  if (typeof p.gps_valid !== 'boolean') {
    bad('gps_valid must be true or false.');
  }

  if (
    typeof p.telemetry_uuid !== 'string' ||
    !p.telemetry_uuid.length ||
    p.telemetry_uuid.length > 64
  ) {
    bad('telemetry_uuid must contain 1–64 characters.');
  }

  const time = p.recorded_at === undefined
    ? Date.now()
    : Date.parse(p.recorded_at);

  if (
    !Number.isFinite(time) ||
    time > Date.now() + 5000 ||
    time < Date.now() - 60000
  ) {
    bad('Telemetry timestamp is invalid, stale or in the future.');
  }

  p.recorded_at = new Date(time).toISOString();

  return p;
}

function guardedProcess(process) {
  return function (vehicle, payload) {
    const key = String(vehicle.id);
    const previousTask = queues.get(key) || Promise.resolve();

    const task = previousTask.catch(() => {}).then(async () => {
      const freshVehicle =
        await vehicles.getByIdInternal(vehicle.id);

      if (!freshVehicle) bad('Vehicle no longer exists.');

      if (freshVehicle.device_id === 'ESP32-HW-001') {
        const [rows] = await pool.execute(
          `SELECT fuel_percent, observed_at
           FROM hardware_fuel
           WHERE vehicle_id = ?`,
          [vehicle.id]
        );

        const sensor = rows[0];

        const age = sensor
          ? Date.now() - new Date(sensor.observed_at).getTime()
          : Infinity;

        if (
          sensor?.fuel_percent == null ||
          age < 0 ||
          age > 10000
        ) {
          bad('Physical fuel sensor is stale or invalid.');
        }

        const percent = Number(sensor.fuel_percent);

        payload = {
          ...payload,
          fuel_percent: percent,
          sensor_observed_at: sensor.observed_at,
          fuel_level_litres:
            percent *
            Number(freshVehicle.fuel_tank_capacity) /
            100
        };
      }

      const p = normalise(freshVehicle, payload);

      const [duplicates] = await pool.execute(
        `SELECT vehicle_id
         FROM telemetry
         WHERE telemetry_uuid = ?
         LIMIT 1`,
        [p.telemetry_uuid]
      );

      if (duplicates.length) {
        if (String(duplicates[0].vehicle_id) !== key) {
          bad('Telemetry UUID belongs to another vehicle.');
        }

        return {
          duplicate: true,
          vehicle: freshVehicle
        };
      }

      const previous =
        await telemetry.getLatestForVehicle(vehicle.id);

      if (
        previous &&
        Date.parse(p.recorded_at) <=
          new Date(previous.recorded_at).getTime()
      ) {
        bad('Out-of-order telemetry rejected.');
      }

      return process(freshVehicle, p);
    });

    queues.set(key, task);

    const clean = () => {
      if (queues.get(key) === task) queues.delete(key);
    };

    task.then(clean, clean);

    return task;
  };
}

module.exports = {
  normalise,
  guardedProcess
};
