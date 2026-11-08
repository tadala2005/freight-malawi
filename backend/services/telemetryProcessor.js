'use strict';

const telemetryModel = require('../models/telemetryModel');
const vehicleModel = require('../models/vehicleModel');
const tripModel = require('../models/tripModel');
const alertModel = require('../models/alertModel');

const theftDetector = require('./theftDetector');
const fuelAnalysis = require('./fuelAnalysis');
const driver = require('./driverBehaviour');
const routes = require('./routeService');
const trips = require('./tripService');
const alerts = require('./alertService');

const dashboard = require('../sockets/dashboardSocket');
const { categoryFor } = require('../utils/alertTypes');
const { guardedProcess } = require('./telemetryGuard');

const lowFuel = new Set();
const overweight = new Set();
const speeding = new Set();
const consumption = new Set();
const deviationAt = new Map();

const n = value => Number(value) || 0;

async function processTelemetry(vehicle, payload) {
  // Explicit field selection prevents credentials entering broadcasts.
  const reading = {
    telemetry_uuid: payload.telemetry_uuid,
    latitude: payload.latitude,
    longitude: payload.longitude,
    speed: payload.speed,
    heading: payload.heading,
    fuel_level_litres: payload.fuel_level_litres,
    fuel_percent: payload.fuel_percent,
    odometer_km: payload.odometer_km,
    engine_hours: payload.engine_hours,
    ignition_on: payload.ignition_on,
    cargo_weight_kg: payload.cargo_weight_kg,
    gps_valid: payload.gps_valid,
    sensor_observed_at: payload.sensor_observed_at,
    vehicle_id: vehicle.id,
    recorded_at: new Date(payload.recorded_at),
    fuel_tank_capacity: Number(vehicle.fuel_tank_capacity),
    physical_fuel: vehicle.device_id === 'ESP32-HW-001'
  };

  const previous =
    await telemetryModel.getLatestForVehicle(vehicle.id);

  const trip = await trips.ensureTripForIgnition({
    vehicle,
    prevIgnitionOn: Boolean(previous?.ignition_on),
    currentIgnitionOn: reading.ignition_on,
    reading
  });

  reading.trip_id = trip?.id || null;

  const { inserted } = await telemetryModel.insert(reading);

  if (!inserted) {
    return {
      duplicate: true,
      vehicle,
      trip
    };
  }

  const status = reading.ignition_on
    ? (reading.speed > 3 ? 'MOVING' : 'IDLE')
    : 'STOPPED';

  await vehicleModel.updateStatus(
    vehicle.id,
    status,
    reading.recorded_at,
    reading.latitude,
    reading.longitude
  );

  const raised = [];

  async function raise(type, severity, message, meta) {
    const result = await alerts.raiseAlert({
      userId: vehicle.user_id,
      vehicleId: vehicle.id,
      tripId: trip?.id || null,
      category: categoryFor(type),
      type,
      severity,
      message,
      meta
    });

    raised.push(result);
    return result;
  }

  async function driverEvent(type, severity, event) {
    await raise(type, severity, event.message, event);

    await alerts.recordDriverEvent({
      vehicleId: vehicle.id,
      tripId: trip?.id || null,
      eventType: type,
      severity,
      speedKmh: reading.speed,
      details: event
    });
  }

  if (vehicle.current_status === 'OFFLINE') {
    await alertModel.recordDeviceAction(
      vehicle.id,
      'RECONNECTED',
      { at: reading.recorded_at }
    );

    await raise(
      'DEVICE_RECONNECTED',
      'LOW',
      `${vehicle.name} has reconnected.`
    );
  }

  const dt = previous
    ? (
        reading.recorded_at -
        new Date(previous.recorded_at)
      ) / 1000
    : 0;

  let theft = null;

  if (previous) {
    theft = theftDetector.detectTheft(previous, reading);

    if (theft) {
      await raise(
        'THEFT_SUSPECTED',
        'CRITICAL',
        theft.message,
        theft
      );
    }

    const refuel =
      fuelAnalysis.detectRefuel(previous, reading);

    if (refuel) {
      await raise(
        'REFUEL',
        'LOW',
        refuel.message,
        refuel
      );
    }
  }

  const active = trip?.status === 'ACTIVE';

  const sameTrip =
    previous &&
    String(previous.trip_id) === String(trip?.id);

  if (active) {
    const odoDelta = previous
      ? reading.odometer_km - n(previous.odometer_km)
      : 0;

    if (
      !previous ||
      (odoDelta >= 0 && odoDelta < 20)
    ) {
      const distance = trip.start_odometer_km == null
        ? 0
        : Math.max(
            0,
            reading.odometer_km -
            Number(trip.start_odometer_km)
          );

      await tripModel.updateFields(trip.id, {
        end_odometer_km: reading.odometer_km,
        distance_km: Number(distance.toFixed(2))
      });
    }

    const drop = previous
      ? n(previous.fuel_level_litres) -
        reading.fuel_level_litres
      : 0;

    // The physical bench container does not measure engine consumption.
    if (
      sameTrip &&
      !reading.physical_fuel &&
      previous.ignition_on &&
      reading.ignition_on &&
      dt > 0 &&
      dt <= 10 &&
      drop > 0 &&
      drop < 20 &&
      !theft
    ) {
      await tripModel.accumulateFuelUsed(
        trip.id,
        drop
      );
    }

    await tripModel.bumpMaxSpeed(
      trip.id,
      reading.speed
    );

    const updated =
      await tripModel.getByIdInternal(trip.id);

    if (
      !reading.physical_fuel &&
      !consumption.has(String(trip.id))
    ) {
      const abnormal =
        fuelAnalysis.detectAbnormalConsumption(
          updated.distance_km,
          updated.fuel_used_litres
        );

      if (abnormal) {
        await raise(
          'ABNORMAL_CONSUMPTION',
          'HIGH',
          abnormal.message,
          abnormal
        );

        consumption.add(String(trip.id));
      }
    }
  }

  const key = String(vehicle.id);

  if (
    reading.fuel_percent <= 15 &&
    !lowFuel.has(key)
  ) {
    await raise(
      'LOW_FUEL',
      'MEDIUM',
      `Low fuel: ${vehicle.name} is at ` +
      `${reading.fuel_percent}% ` +
      `(${reading.fuel_level_litres.toFixed(2)} L` +
      `${reading.physical_fuel ? ' equivalent' : ''}).`
    );

    lowFuel.add(key);
  } else if (reading.fuel_percent >= 18) {
    lowFuel.delete(key);
  }

  const overspeed = driver.detectOverspeeding(
    reading.speed,
    vehicle.overspeed_threshold_kmh
  );

  if (overspeed && !speeding.has(key)) {
    await driverEvent(
      'OVERSPEEDING',
      overspeed.severity,
      overspeed
    );

    speeding.add(key);
  } else if (!overspeed) {
    speeding.delete(key);
  }

  if (
    previous?.ignition_on &&
    reading.ignition_on &&
    dt > 0 &&
    dt <= 8
  ) {
    const harsh =
      driver.detectHarshDriving(previous, reading);

    if (harsh) {
      await driverEvent(
        'HARSH_DRIVING',
        'MEDIUM',
        harsh
      );

      const aggressive =
        driver.registerHarshEventAndCheckAggressive(
          vehicle.id,
          +reading.recorded_at
        );

      if (aggressive) {
        await driverEvent(
          'AGGRESSIVE_DRIVING',
          'HIGH',
          aggressive
        );
      }
    }
  }

  // Gaps must not count as continuously observed idling.
  if (!active || dt > 10 || !sameTrip) {
    driver.trackIdle(
      vehicle.id,
      false,
      0,
      +reading.recorded_at
    );
  }

  if (active) {
    if (
      sameTrip &&
      previous.ignition_on &&
      n(previous.speed) <= 1 &&
      reading.ignition_on &&
      reading.speed <= 1 &&
      dt > 0 &&
      dt <= 10
    ) {
      await tripModel.incrementIdleSeconds(
        trip.id,
        Math.round(dt)
      );
    }

    const threshold =
      Number(vehicle.idle_threshold_minutes) || 10;

    const idle = driver.trackIdle(
      vehicle.id,
      reading.ignition_on,
      reading.speed,
      +reading.recorded_at,
      threshold
    );

    if (idle.triggered) {
      await driverEvent(
        'EXCESSIVE_IDLE',
        'MEDIUM',
        {
          idleSeconds: idle.idleSeconds,
          thresholdMinutes: threshold,
          message:
            `${vehicle.name} has idled for ` +
            `${Math.round(idle.idleSeconds / 60)} minutes.`
        }
      );
    }
  }

  if (
    reading.cargo_weight_kg >
    Number(vehicle.payload_capacity_kg)
  ) {
    if (!overweight.has(key)) {
      await raise(
        'OVERWEIGHT',
        'HIGH',
        `${vehicle.name}: ${reading.cargo_weight_kg} kg ` +
        `exceeds ${vehicle.payload_capacity_kg} kg capacity.`,
        {
          cargo_weight_kg: reading.cargo_weight_kg,
          capacity: Number(vehicle.payload_capacity_kg)
        }
      );

      overweight.add(key);
    }
  } else {
    overweight.delete(key);
  }

  if (
    active &&
    trip.route_key &&
    reading.gps_valid
  ) {
    const km = routes.deviationDistanceKm(
      trip.route_key,
      reading.latitude,
      reading.longitude
    );

    if (
      km !== null &&
      km > 5 &&
      +reading.recorded_at -
        (deviationAt.get(key) || 0) > 300000
    ) {
      await driverEvent(
        'ROUTE_DEVIATION',
        'MEDIUM',
        {
          deviationKm: km,
          message:
            `${vehicle.name} is ${km.toFixed(1)} km ` +
            'from its assigned corridor.'
        }
      );

      deviationAt.set(key, +reading.recorded_at);
    }
  }

  const updatedTrip = trip
    ? await trips.checkRouteCompletion({
        vehicle,
        trip,
        reading
      })
    : null;

  if (updatedTrip?.status === 'ROUTE_COMPLETED') {
    consumption.delete(String(updatedTrip.id));
  }

  const freshVehicle =
    await vehicleModel.getByIdInternal(vehicle.id);

  dashboard.emitToUser(
    vehicle.user_id,
    'telemetry:update',
    {
      vehicle_id: vehicle.id,
      reading,
      trip_id: reading.trip_id
    }
  );

  dashboard.emitToUser(
    vehicle.user_id,
    'vehicle:update',
    freshVehicle
  );

  return {
    duplicate: false,
    vehicle: freshVehicle,
    trip: updatedTrip,
    reading,
    alerts: raised
  };
}

module.exports = {
  processTelemetry: guardedProcess(processTelemetry)
};
