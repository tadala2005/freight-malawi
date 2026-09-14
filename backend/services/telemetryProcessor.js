const { findByDeviceId } = require('../models/vehicleModel');
const { insertTelemetry } = require('../models/telemetryModel');
const { createAlert } = require('../models/alertModel');
const { evaluateTelemetry } = require('./theftDetector');
const { createPendingFromEngineStart, completeTrip } = require('./tripService');
const { findOpenByVehicle } = require('../models/tripModel');

function validateTelemetryPayload(payload) {
  const errors = [];
  const { deviceId, latitude, longitude, speed, heading, fuelLevelLitres, fuelPercent, timestamp, engineOn, speedLimitKmh, loadWeightKg, maxPayloadKg, routeCompleted } = payload || {};
  if (!deviceId || typeof deviceId !== 'string') errors.push('deviceId is required');
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) errors.push('latitude must be between -90 and 90');
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) errors.push('longitude must be between -180 and 180');
  if (typeof speed !== 'number' || speed < 0) errors.push('speed must be a number >= 0');
  if (typeof heading !== 'number' || heading < 0 || heading > 360) errors.push('heading must be between 0 and 360');
  if (typeof fuelLevelLitres !== 'number' || fuelLevelLitres < 0) errors.push('fuelLevelLitres must be a number >= 0');
  if (typeof fuelPercent !== 'number' || fuelPercent < 0 || fuelPercent > 100) errors.push('fuelPercent must be between 0 and 100');
  if (timestamp && Number.isNaN(Date.parse(timestamp))) errors.push('timestamp must be a valid ISO date');
  if (engineOn !== undefined && typeof engineOn !== 'boolean') errors.push('engineOn must be boolean when provided');
  if (speedLimitKmh !== undefined && (typeof speedLimitKmh !== 'number' || speedLimitKmh <= 0)) errors.push('speedLimitKmh must be > 0 when provided');
  if (loadWeightKg !== undefined && (typeof loadWeightKg !== 'number' || loadWeightKg < 0)) errors.push('loadWeightKg must be >= 0 when provided');
  if (maxPayloadKg !== undefined && (typeof maxPayloadKg !== 'number' || maxPayloadKg <= 0)) errors.push('maxPayloadKg must be > 0 when provided');
  if (routeCompleted !== undefined && typeof routeCompleted !== 'boolean') errors.push('routeCompleted must be boolean when provided');
  return errors;
}

async function processTelemetry(payload) {
  const errors = validateTelemetryPayload(payload);
  if (errors.length) {
    const error = new Error('Invalid telemetry payload');
    error.status = 400;
    error.details = errors;
    throw error;
  }

  const vehicle = await findByDeviceId(payload.deviceId);
  if (!vehicle) {
    const error = new Error(`Unknown device: ${payload.deviceId}`);
    error.status = 404;
    throw error;
  }

  const recordedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const telemetryRecord = {
    vehicleId: vehicle.id,
    latitude: payload.latitude,
    longitude: payload.longitude,
    speed: payload.speed,
    heading: payload.heading,
    fuelLevelLitres: payload.fuelLevelLitres,
    fuelPercent: payload.fuelPercent,
    recordedAt,
    engineOn: payload.engineOn,
    speedLimitKmh: payload.speedLimitKmh,
    loadWeightKg: payload.loadWeightKg,
    maxPayloadKg: payload.maxPayloadKg,
    routeCompleted: payload.routeCompleted,
  };

  const telemetryId = await insertTelemetry({
    vehicleId: vehicle.id,
    latitude: payload.latitude,
    longitude: payload.longitude,
    speed: payload.speed,
    heading: payload.heading,
    fuelLevelLitres: payload.fuelLevelLitres,
    fuelPercent: payload.fuelPercent,
    recordedAt,
  });

  const detectedAlerts = evaluateTelemetry(vehicle.id, telemetryRecord);
  let trip = await findOpenByVehicle(vehicle.id);
  let tripCreated = false;

  const engineStart = detectedAlerts.some((a) => a.alertType === 'ENGINE_START');
  if (engineStart && !trip) {
    const result = await createPendingFromEngineStart({
      vehicle,
      startedAt: recordedAt,
      latitude: payload.latitude,
      longitude: payload.longitude,
      fuelLevelLitres: payload.fuelLevelLitres,
    });
    trip = result.trip;
    tripCreated = result.created;
  }

  if (!trip && detectedAlerts.length) trip = await findOpenByVehicle(vehicle.id);

  const savedAlerts = [];
  for (const alert of detectedAlerts) {
    const alertId = await createAlert({ vehicleId: vehicle.id, tripId: trip?.id || null, ...alert });
    savedAlerts.push({
      id: alertId,
      vehicleId: vehicle.id,
      vehicle_name: vehicle.name,
      license_plate: vehicle.license_plate,
      acknowledged: 0,
      createdAt: recordedAt,
      created_at: recordedAt,
      trip_id: trip?.id || null,
      category: undefined,
      ...alert,
    });
  }

  let tripCompleted = null;
  const routeCompleted = detectedAlerts.some((a) => a.alertType === 'ROUTE_COMPLETED');
  if (routeCompleted && trip) {
    tripCompleted = await completeTrip(trip.id, trip.user_id || vehicle.user_id, {
      completedAt: recordedAt,
      latitude: payload.latitude,
      longitude: payload.longitude,
      fuelEndLitres: payload.fuelLevelLitres,
      routeCompleted: true,
    });
  }

  return { vehicle, telemetryId, telemetryRecord, alerts: savedAlerts, trip: trip || null, tripCreated, tripCompleted };
}

module.exports = { processTelemetry, validateTelemetryPayload };
