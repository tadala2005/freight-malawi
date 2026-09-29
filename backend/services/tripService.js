const tripModel = require('../models/tripModel');
const alertService = require('./alertService');
const dashboardSocket = require('../sockets/dashboardSocket');
const routeService = require('./routeService');

/**
 * Trip lifecycle:
 * 1. The operator creates a PENDING_DETAILS trip from the Logbook.
 * 2. Dashboard ignition ON starts that pending trip on the first real ON packet.
 * 3. Ignition OFF ends the engine session but does not complete the trip.
 * 4. Route completion or operator completion closes the trip.
 */
async function ensureTripForIgnition({ vehicle, prevIgnitionOn, currentIgnitionOn, reading }) {
  const existingTrip = await tripModel.getActiveForVehicle(vehicle.id);
  const transitionedOn = !prevIgnitionOn && currentIgnitionOn;

  if (!existingTrip) return null;

  if (!currentIgnitionOn && existingTrip.status === 'ACTIVE' && !existingTrip.ignition_ended_at) {
    await tripModel.updateFields(existingTrip.id, { ignition_ended_at: new Date(reading.recorded_at) });
    return tripModel.getByIdInternal(existingTrip.id);
  }

  if (existingTrip.status === 'PENDING_DETAILS' && transitionedOn) {
    const trip = await tripModel.activatePendingTrip(existingTrip.id, reading);
    dashboardSocket.emitToUser(vehicle.user_id, 'trip:started', {
      ...trip,
      vehicle_name: vehicle.name,
      license_plate: vehicle.license_plate,
    });
    await alertService.raiseAlert({
      userId: vehicle.user_id,
      vehicleId: vehicle.id,
      tripId: trip.id,
      category: 'TRIP',
      type: 'IGNITION_STARTED',
      severity: 'LOW',
      message: `Trip started — ${vehicle.name} (${vehicle.license_plate}).`,
    });
    return trip;
  }

  if (existingTrip.status === 'ACTIVE' && transitionedOn) {
    await tripModel.updateFields(existingTrip.id, { ignition_started_at: new Date(reading.recorded_at), ignition_ended_at: null });
    return tripModel.getByIdInternal(existingTrip.id);
  }

  return existingTrip;
}

async function checkRouteCompletion({ vehicle, trip, reading }) {
  if (!trip || trip.status !== 'ACTIVE' || !trip.route_key) return trip;
  const reached = routeService.isNearDestination(trip.route_key, reading.latitude, reading.longitude, 3);
  if (!reached) return trip;

  const updated = await tripModel.markRouteCompleted(trip.id, reading);
  dashboardSocket.emitToUser(vehicle.user_id, 'trip:updated', updated);

  await alertService.raiseAlert({
    userId: vehicle.user_id,
    vehicleId: vehicle.id,
    tripId: trip.id,
    category: 'TRIP',
    type: 'ROUTE_COMPLETED',
    severity: 'LOW',
    message: `Route completed — ${vehicle.name} (${vehicle.license_plate}) has arrived. Review the trip before completing it.`,
  });
  return updated;
}

module.exports = { ensureTripForIgnition, checkRouteCompletion };
