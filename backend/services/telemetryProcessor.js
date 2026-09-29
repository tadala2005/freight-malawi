// ============================================================================
// FREIGHT MALAWI TELEMETRY PROCESSOR
//
// Every telemetry packet is processed through the same rules that feed:
//
//   Dashboard
//   Notifications
//   Driver behaviour
//   Trip distance
//   Fuel usage
//   Route deviation
//   Trip completion
//   Reports
//
// The simulator and backend therefore work from the same underlying telemetry.
// ============================================================================

const {
  v4: uuidv4,
} = require('uuid');

const telemetryModel =
  require('../models/telemetryModel');

const vehicleModel =
  require('../models/vehicleModel');

const tripModel =
  require('../models/tripModel');

const alertModel =
  require('../models/alertModel');

const theftDetector =
  require('./theftDetector');

const fuelAnalysis =
  require('./fuelAnalysis');

const driverBehaviour =
  require('./driverBehaviour');

const routeService =
  require('./routeService');

const tripService =
  require('./tripService');

const alertService =
  require('./alertService');

const dashboardSocket =
  require('../sockets/dashboardSocket');

const {
  categoryFor,
  LOW_FUEL_PERCENT_THRESHOLD,
} =
  require('../utils/alertTypes');

const logger =
  require('../utils/logger');

const ROUTE_DEVIATION_THRESHOLD_KM =
  5;

const ROUTE_DEVIATION_COOLDOWN_MS =
  5 * 60 * 1000;

const DEFAULT_IDLE_THRESHOLD_MINUTES =
  10;

const routeDeviationLastAlert =
  new Map();

const consumptionAlerted =
  new Set();

const overweightAlerted =
  new Set();

const lowFuelAlerted =
  new Set();

const overspeedState =
  new Map();

function raise(
  userId,
  vehicleId,
  tripId,
  type,
  severity,
  message,
  meta,
) {
  return alertService.raiseAlert({
    userId,
    vehicleId,
    tripId,

    category:
      categoryFor(type),

    type,
    severity,
    message,
    meta,
  });
}

function numeric(
  value,
  fallback = 0,
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

async function processTelemetry(
  vehicle,
  payload,
) {
  const recordedAt =
    payload.recorded_at
      ? new Date(
          payload.recorded_at,
        )
      : new Date();

  const reading = {
    telemetry_uuid:
      payload.telemetry_uuid ||
      uuidv4(),

    vehicle_id:
      vehicle.id,

    latitude:
      numeric(
        payload.latitude,
      ),

    longitude:
      numeric(
        payload.longitude,
      ),

    speed:
      numeric(
        payload.speed,
      ),

    heading:
      numeric(
        payload.heading,
      ),

    fuel_level_litres:
      numeric(
        payload.fuel_level_litres,
      ),

    fuel_percent:
      numeric(
        payload.fuel_percent,
      ),

    odometer_km:
      numeric(
        payload.odometer_km,
      ),

    engine_hours:
      numeric(
        payload.engine_hours,
      ),

    ignition_on:
      !!payload.ignition_on,

    cargo_weight_kg:
      numeric(
        payload.cargo_weight_kg,
      ),

    gps_valid:
      payload.gps_valid !== false,

    recorded_at:
      recordedAt,
  };

  // -------------------------------------------------------------------------
  // Previous reading
  // -------------------------------------------------------------------------

  const previous =
    await telemetryModel.getLatestForVehicle(
      vehicle.id,
    );

  const prevIgnitionOn =
    previous
      ? !!previous.ignition_on
      : false;

  const wasOffline =
    vehicle.current_status ===
    'OFFLINE';

  // -------------------------------------------------------------------------
  // Trip association
  // -------------------------------------------------------------------------

  const trip =
    await tripService.ensureTripForIgnition(
      {
        vehicle,
        prevIgnitionOn,
        currentIgnitionOn:
          reading.ignition_on,
        reading,
      },
    );

  reading.trip_id =
    trip
      ? trip.id
      : null;

  // -------------------------------------------------------------------------
  // Persist telemetry
  // -------------------------------------------------------------------------

  const {
    inserted,
  } =
    await telemetryModel.insert(
      reading,
    );

  if (!inserted) {
    logger.debug(
      'Duplicate telemetry packet ignored',
      {
        vehicleId:
          vehicle.id,

        uuid:
          reading.telemetry_uuid,
      },
    );

    return {
      duplicate: true,
      vehicle,
      trip,
    };
  }

  // -------------------------------------------------------------------------
  // Vehicle status
  //
  // GPS continues to arrive with ignition OFF, therefore the vehicle remains
  // STOPPED rather than disappearing from the fleet map.
  // -------------------------------------------------------------------------

  let status =
    'STOPPED';

  if (
    reading.ignition_on &&
    reading.speed > 3
  ) {
    status = 'MOVING';
  } else if (
    reading.ignition_on
  ) {
    status = 'IDLE';
  }

  await vehicleModel.updateStatus(
    vehicle.id,
    status,
    reading.recorded_at,
    reading.latitude,
    reading.longitude,
  );

  // -------------------------------------------------------------------------
  // Reconnection
  // -------------------------------------------------------------------------

  if (wasOffline) {
    await alertModel.recordDeviceAction(
      vehicle.id,
      'RECONNECTED',
      {
        at:
          reading.recorded_at,
      },
    );

    await raise(
      vehicle.user_id,
      vehicle.id,
      trip
        ? trip.id
        : null,
      'DEVICE_RECONNECTED',
      'LOW',
      `${vehicle.name} (${vehicle.license_plate}) has reconnected.`,
    );
  }

  const alertsRaised = [];

  const recordAlert =
    async (...args) => {
      const alert =
        await raise(...args);

      alertsRaised.push(
        alert,
      );

      return alert;
    };

  // -------------------------------------------------------------------------
  // Fuel theft / refuelling / trip distance / trip fuel
  // -------------------------------------------------------------------------

  let theftDetected =
    null;

  if (previous) {
    theftDetected =
      theftDetector.detectTheft(
        previous,
        reading,
      );

    if (theftDetected) {
      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'THEFT_SUSPECTED',
        'CRITICAL',
        theftDetected.message,
        theftDetected,
      );
    }

    const refuel =
      fuelAnalysis.detectRefuel(
        previous,
        reading,
      );

    if (refuel) {
      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'REFUEL',
        'LOW',
        refuel.message,
        refuel,
      );
    }

    // -----------------------------------------------------------------------
    // Trip distance + fuel
    // -----------------------------------------------------------------------

    if (trip) {
      const previousOdometer =
        numeric(
          previous.odometer_km,
        );

      const currentOdometer =
        numeric(
          reading.odometer_km,
        );

      const odometerDelta =
        currentOdometer -
        previousOdometer;

      if (
        currentOdometer >=
          previousOdometer &&
        odometerDelta >= 0 &&
        odometerDelta < 20
      ) {
        await tripModel.updateFields(
          trip.id,
          {
            end_odometer_km:
              currentOdometer,
          },
        );
      }

      const fuelDrop =
        numeric(
          previous.fuel_level_litres,
        ) -
        numeric(
          reading.fuel_level_litres,
        );

      // Normal burn is recorded as trip fuel.
      // A sudden theft is recorded as theft instead so it does not silently
      // become "fuel consumed by driving".
      if (
        fuelDrop > 0 &&
        fuelDrop < 20 &&
        !theftDetected
      ) {
        await tripModel.accumulateFuelUsed(
          trip.id,
          fuelDrop,
        );
      }

      if (
        reading.speed > 0
      ) {
        await tripModel.bumpMaxSpeed(
          trip.id,
          reading.speed,
        );
      }

      const refreshedTrip =
        await tripModel.getByIdInternal(
          trip.id,
        );

      const liveDistanceKm =
        refreshedTrip.start_odometer_km !=
          null &&
        refreshedTrip.end_odometer_km !=
          null
          ? Math.max(
              0,
              Number(
                refreshedTrip
                  .end_odometer_km,
              ) -
                Number(
                  refreshedTrip
                    .start_odometer_km,
                ),
            )
          : 0;

      if (
        !consumptionAlerted.has(
          trip.id,
        )
      ) {
        const abnormal =
          fuelAnalysis.detectAbnormalConsumption(
            liveDistanceKm,
            refreshedTrip
              .fuel_used_litres,
          );

        if (abnormal) {
          consumptionAlerted.add(
            trip.id,
          );

          await recordAlert(
            vehicle.user_id,
            vehicle.id,
            trip.id,
            'ABNORMAL_CONSUMPTION',
            'HIGH',
            abnormal.message,
            abnormal,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Low fuel
  // -------------------------------------------------------------------------

  const lowFuelKey =
    trip
      ? trip.id
      : `v${vehicle.id}`;

  if (
    reading.fuel_percent <=
    LOW_FUEL_PERCENT_THRESHOLD
  ) {
    if (
      !lowFuelAlerted.has(
        lowFuelKey,
      )
    ) {
      lowFuelAlerted.add(
        lowFuelKey,
      );

      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'LOW_FUEL',
        'MEDIUM',
        `Low fuel: ${vehicle.name} (${vehicle.license_plate}) is at ${reading.fuel_percent}% (${reading.fuel_level_litres} L).`,
        {
          fuel_percent:
            reading.fuel_percent,
        },
      );
    }
  } else {
    lowFuelAlerted.delete(
      lowFuelKey,
    );
  }

  // -------------------------------------------------------------------------
  // Overspeeding
  //
  // One continuous overspeed period = one incident.
  // The vehicle must first return below the limit before another incident is
  // allowed to trigger.
  // -------------------------------------------------------------------------

  const overspeed =
    driverBehaviour.detectOverspeeding(
      reading.speed,
      vehicle.overspeed_threshold_kmh,
    );

  const currentOverspeedState =
    overspeedState.get(
      vehicle.id,
    ) || {
      active: false,
      peakSpeed: 0,
    };

  if (overspeed) {
    const peakSpeed =
      Math.max(
        Number(
          currentOverspeedState
            .peakSpeed ||
            0,
        ),
        numeric(
          reading.speed,
        ),
      );

    if (
      !currentOverspeedState.active
    ) {
      const event = {
        ...overspeed,

        peakSpeed:
          Math.round(
            peakSpeed * 10,
          ) / 10,
      };

      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'OVERSPEEDING',
        overspeed.severity,
        overspeed.message,
        event,
      );

      await alertService.recordDriverEvent(
        {
          vehicleId:
            vehicle.id,

          tripId:
            trip
              ? trip.id
              : null,

          eventType:
            'OVERSPEEDING',

          severity:
            overspeed.severity,

          speedKmh:
            reading.speed,

          details:
            event,
        },
      );
    }

    overspeedState.set(
      vehicle.id,
      {
        active: true,
        peakSpeed,
      },
    );
  } else {
    overspeedState.delete(
      vehicle.id,
    );
  }

  // -------------------------------------------------------------------------
  // Harsh / aggressive driving
  //
  // Only compare two packets when the engine was already ON in the previous
  // packet. This prevents "starting from 0" from becoming a false incident.
  // -------------------------------------------------------------------------

  if (
    previous &&
    previous.ignition_on &&
    reading.ignition_on
  ) {
    const harsh =
      driverBehaviour.detectHarshDriving(
        previous,
        reading,
      );

    if (harsh) {
      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'HARSH_DRIVING',
        'MEDIUM',
        harsh.message,
        harsh,
      );

      await alertService.recordDriverEvent(
        {
          vehicleId:
            vehicle.id,

          tripId:
            trip
              ? trip.id
              : null,

          eventType:
            'HARSH_DRIVING',

          severity:
            'MEDIUM',

          speedKmh:
            reading.speed,

          details:
            harsh,
        },
      );

      const aggressive =
        driverBehaviour
          .registerHarshEventAndCheckAggressive(
            vehicle.id,
            reading.recorded_at.getTime(),
          );

      if (aggressive) {
        await recordAlert(
          vehicle.user_id,
          vehicle.id,
          trip
            ? trip.id
            : null,
          'AGGRESSIVE_DRIVING',
          'HIGH',
          aggressive.message,
          aggressive,
        );

        await alertService.recordDriverEvent(
          {
            vehicleId:
              vehicle.id,

            tripId:
              trip
                ? trip.id
                : null,

            eventType:
              'AGGRESSIVE_DRIVING',

            severity:
              'HIGH',

            speedKmh:
              reading.speed,

            details:
              aggressive,
          },
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Idle tracking
  // -------------------------------------------------------------------------

  if (
    trip &&
    trip.status ===
      'ACTIVE'
  ) {
    const dtSeconds =
      previous
        ? Math.max(
            0,
            (
              reading.recorded_at.getTime() -
              new Date(
                previous.recorded_at,
              ).getTime()
            ) / 1000,
          )
        : 0;

    if (
      reading.ignition_on &&
      reading.speed <= 1 &&
      dtSeconds > 0
    ) {
      await tripModel.incrementIdleSeconds(
        trip.id,
        Math.round(
          dtSeconds,
        ),
      );
    }

    const idle =
      driverBehaviour.trackIdle(
        vehicle.id,
        reading.ignition_on,
        reading.speed,
        reading.recorded_at.getTime(),
        DEFAULT_IDLE_THRESHOLD_MINUTES,
      );

    if (idle.triggered) {
      const idleMinutes =
        Math.round(
          (idle.idleSeconds /
            60) *
            10,
        ) / 10;

      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip.id,
        'EXCESSIVE_IDLE',
        'MEDIUM',
        `Excessive idling detected: ${vehicle.name} has remained stationary with the ignition ON for approximately ${idleMinutes} minutes.`,
        {
          idleSeconds:
            idle.idleSeconds,

          thresholdMinutes:
            DEFAULT_IDLE_THRESHOLD_MINUTES,
        },
      );

      await alertService.recordDriverEvent(
        {
          vehicleId:
            vehicle.id,

          tripId:
            trip.id,

          eventType:
            'EXCESSIVE_IDLE',

          severity:
            'MEDIUM',

          speedKmh:
            reading.speed,

          details: {
            idleSeconds:
              idle.idleSeconds,

            thresholdMinutes:
              DEFAULT_IDLE_THRESHOLD_MINUTES,
          },
        },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Overweight
  //
  // This is a LOAD alert, not a driver-behaviour event.
  // -------------------------------------------------------------------------

  if (
    reading.cargo_weight_kg >
      0 &&
    reading.cargo_weight_kg >
      Number(
        vehicle.payload_capacity_kg,
      )
  ) {
    const key =
      trip
        ? trip.id
        : `v${vehicle.id}`;

    if (
      !overweightAlerted.has(
        key,
      )
    ) {
      overweightAlerted.add(
        key,
      );

      const over =
        Math.round(
          (
            reading.cargo_weight_kg -
            Number(
              vehicle.payload_capacity_kg,
            )
          ) * 10,
        ) / 10;

      await recordAlert(
        vehicle.user_id,
        vehicle.id,
        trip
          ? trip.id
          : null,
        'OVERWEIGHT',
        'HIGH',
        `Overweight load: ${vehicle.name} is carrying ${reading.cargo_weight_kg} kg against a ${vehicle.payload_capacity_kg} kg capacity (+${over} kg).`,
        {
          cargo_weight_kg:
            reading.cargo_weight_kg,

          capacity:
            vehicle.payload_capacity_kg,

          over,
        },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Route deviation
  // -------------------------------------------------------------------------

  if (
    trip &&
    trip.status ===
      'ACTIVE' &&
    trip.route_key
  ) {
    const deviationKm =
      routeService.deviationDistanceKm(
        trip.route_key,
        reading.latitude,
        reading.longitude,
      );

    if (
      deviationKm !== null &&
      deviationKm >
        ROUTE_DEVIATION_THRESHOLD_KM
    ) {
      const lastAlertMs =
        routeDeviationLastAlert.get(
          vehicle.id,
        ) || 0;

      if (
        reading.recorded_at.getTime() -
          lastAlertMs >
        ROUTE_DEVIATION_COOLDOWN_MS
      ) {
        routeDeviationLastAlert.set(
          vehicle.id,
          reading.recorded_at.getTime(),
        );

        const distance =
          Math.round(
            deviationKm * 10,
          ) / 10;

        const message =
          `Route deviation: ${vehicle.name} is ${distance} km off its assigned route corridor.`;

        await recordAlert(
          vehicle.user_id,
          vehicle.id,
          trip.id,
          'ROUTE_DEVIATION',
          'MEDIUM',
          message,
          {
            deviationKm:
              distance,
          },
        );

        await alertService.recordDriverEvent(
          {
            vehicleId:
              vehicle.id,

            tripId:
              trip.id,

            eventType:
              'ROUTE_DEVIATION',

            severity:
              'MEDIUM',

            details: {
              deviationKm:
                distance,
            },
          },
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Route completion
  // -------------------------------------------------------------------------

  let updatedTrip =
    trip;

  if (trip) {
    updatedTrip =
      await tripService.checkRouteCompletion(
        {
          vehicle,
          trip,
          reading,
        },
      );

    if (
      updatedTrip &&
      updatedTrip.status ===
        'ROUTE_COMPLETED'
    ) {
      consumptionAlerted.delete(
        updatedTrip.id,
      );

      overweightAlerted.delete(
        updatedTrip.id,
      );

      overspeedState.delete(
        vehicle.id,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Dashboard broadcast
  // -------------------------------------------------------------------------

  const freshVehicle =
    await vehicleModel.getByIdInternal(
      vehicle.id,
    );

  dashboardSocket.emitToUser(
    vehicle.user_id,
    'telemetry:update',
    {
      vehicle_id:
        vehicle.id,

      reading,

      trip_id:
        reading.trip_id,
    },
  );

  dashboardSocket.emitToUser(
    vehicle.user_id,
    'vehicle:update',
    freshVehicle,
  );

  return {
    duplicate: false,

    vehicle:
      freshVehicle,

    trip:
      updatedTrip,

    reading,

    alerts:
      alertsRaised,
  };
}

module.exports = {
  processTelemetry,
};