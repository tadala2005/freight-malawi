'use strict';

const tripModel = require('../models/tripModel');
const alerts = require('./alertService');
const dashboard = require('../sockets/dashboardSocket');
const routes = require('./routeService');

async function ensureTripForIgnition({
  vehicle,
  prevIgnitionOn,
  currentIgnitionOn,
  reading
}) {
  const existing =
    await tripModel.getActiveForVehicle(vehicle.id);

  if (!existing) return null;

  if (
    !currentIgnitionOn &&
    existing.status === 'ACTIVE' &&
    !existing.ignition_ended_at
  ) {
    return tripModel.updateFields(existing.id, {
      ignition_ended_at: new Date(reading.recorded_at)
    });
  }

  if (
    existing.status === 'PENDING_DETAILS' &&
    currentIgnitionOn
  ) {
    const trip = await tripModel.activatePendingTrip(
      existing.id,
      reading
    );

    dashboard.emitToUser(
      vehicle.user_id,
      'trip:started',
      {
        ...trip,
        vehicle_name: vehicle.name,
        license_plate: vehicle.license_plate
      }
    );

    await alerts.raiseAlert({
      userId: vehicle.user_id,
      vehicleId: vehicle.id,
      tripId: trip.id,
      category: 'TRIP',
      type: 'IGNITION_STARTED',
      severity: 'LOW',
      message:
        `Trip started — ${vehicle.name} ` +
        `(${vehicle.license_plate}).`
    });

    return trip;
  }

  if (
    existing.status === 'ACTIVE' &&
    currentIgnitionOn &&
    !prevIgnitionOn
  ) {
    return tripModel.updateFields(existing.id, {
      ignition_started_at: new Date(reading.recorded_at),
      ignition_ended_at: null
    });
  }

  return existing;
}

async function checkRouteCompletion({
  vehicle,
  trip,
  reading
}) {
  if (
    !trip ||
    trip.status !== 'ACTIVE' ||
    !trip.route_key ||
    Number(reading.speed) > 2 ||
    reading.ignition_on
  ) {
    return trip;
  }

  // The physical bench device has explicitly simulated coordinates.
  if (
    !reading.gps_valid &&
    vehicle.device_id !== 'ESP32-HW-001'
  ) {
    return trip;
  }

  const reached = routes.isNearDestination(
    trip.route_key,
    reading.latitude,
    reading.longitude,
    0.3
  );

  if (!reached) return trip;

  const updated = await tripModel.markRouteCompleted(
    trip.id,
    reading
  );

  dashboard.emitToUser(
    vehicle.user_id,
    'trip:updated',
    updated
  );

  await alerts.raiseAlert({
    userId: vehicle.user_id,
    vehicleId: vehicle.id,
    tripId: trip.id,
    category: 'TRIP',
    type: 'ROUTE_COMPLETED',
    severity: 'LOW',
    message:
      `Route completed — ${vehicle.name} has stopped ` +
      'near the destination. Review the trip before completing it.'
  });

  return updated;
}

module.exports = {
  ensureTripForIgnition,
  checkRouteCompletion
};
