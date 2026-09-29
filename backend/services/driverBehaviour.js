// ============================================================================
// FREIGHT MALAWI DRIVER BEHAVIOUR
//
// Driver behaviour is derived from actual telemetry.
//
// OVERSPEEDING:
//   Speed is above the configured threshold.
//
// HARSH DRIVING:
//   Absolute acceleration/deceleration >= 2.5 m/s².
//
// AGGRESSIVE DRIVING:
//   Five harsh-driving events inside 15 minutes.
//
// IMPORTANT:
//   An ignition OFF -> ON transition is not treated as harsh acceleration.
// ============================================================================

const HARSH_ACCELERATION_MPS2 =
  2.5;

const HARSH_WINDOW_SECONDS =
  8;

const AGGRESSIVE_EVENTS_WINDOW =
  5;

const AGGRESSIVE_WINDOW_MINUTES =
  15;

const DEFAULT_IDLE_THRESHOLD_MINUTES =
  10;

const idleTracker = new Map();

const harshEventLog =
  new Map();

function detectOverspeeding(
  currentSpeedKmh,
  thresholdKmh,
) {
  const speed =
    Number(currentSpeedKmh);

  const threshold =
    Number(thresholdKmh);

  if (
    !Number.isFinite(speed) ||
    !Number.isFinite(threshold) ||
    speed <= threshold
  ) {
    return null;
  }

  const excess =
    speed - threshold;

  let severity = 'LOW';

  if (excess >= 30) {
    severity =
      'CRITICAL';
  } else if (
    excess >= 15
  ) {
    severity = 'HIGH';
  } else if (
    excess >= 5
  ) {
    severity = 'MEDIUM';
  }

  return {
    speed:
      Math.round(
        speed * 10,
      ) / 10,

    threshold:
      Math.round(
        threshold * 10,
      ) / 10,

    excess:
      Math.round(
        excess * 10,
      ) / 10,

    severity,

    message:
      `Overspeeding detected: vehicle speed reached ${Math.round(
        speed,
      )} km/h against the ${Math.round(
        threshold,
      )} km/h threshold (+${Math.round(
        excess,
      )} km/h).`,
  };
}

function detectHarshDriving(
  prevReading,
  currentReading,
) {
  if (
    !prevReading ||
    !currentReading
  ) {
    return null;
  }

  // Do not classify engine startup as harsh acceleration.
  if (
    !prevReading.ignition_on ||
    !currentReading.ignition_on
  ) {
    return null;
  }

  const previousTime =
    new Date(
      prevReading.recorded_at,
    ).getTime();

  const currentTime =
    new Date(
      currentReading.recorded_at,
    ).getTime();

  const dtSeconds =
    (
      currentTime -
      previousTime
    ) / 1000;

  if (
    !Number.isFinite(
      dtSeconds,
    ) ||
    dtSeconds <= 0 ||
    dtSeconds >
      HARSH_WINDOW_SECONDS
  ) {
    return null;
  }

  const previousSpeed =
    Math.max(
      0,
      Number(
        prevReading.speed,
      ) || 0,
    );

  const currentSpeed =
    Math.max(
      0,
      Number(
        currentReading.speed,
      ) || 0,
    );

  const deltaKmh =
    currentSpeed -
    previousSpeed;

  const accelerationMps2 =
    (deltaKmh / 3.6) /
    dtSeconds;

  if (
    Math.abs(
      accelerationMps2,
    ) <
    HARSH_ACCELERATION_MPS2
  ) {
    return null;
  }

  const type =
    accelerationMps2 > 0
      ? 'harsh acceleration'
      : 'harsh braking';

  return {
    type,

    deltaKmh:
      Math.round(
        Math.abs(
          deltaKmh,
        ) * 10,
      ) / 10,

    dtSeconds:
      Math.round(
        dtSeconds * 10,
      ) / 10,

    accelerationMps2:
      Math.round(
        Math.abs(
          accelerationMps2,
        ) * 100,
      ) / 100,

    fromSpeedKmh:
      Math.round(
        previousSpeed,
      ),

    toSpeedKmh:
      Math.round(
        currentSpeed,
      ),

    message:
      `Harsh driving detected: ${type} from ${Math.round(
        previousSpeed,
      )} to ${Math.round(
        currentSpeed,
      )} km/h in ${Math.round(
        dtSeconds,
      )}s (${Math.round(
        Math.abs(
          accelerationMps2,
        ) * 100,
      ) / 100} m/s²).`,
  };
}

function registerHarshEventAndCheckAggressive(
  vehicleId,
  timestampMs,
) {
  const previous =
    harshEventLog.get(
      vehicleId,
    ) || [];

  const windowStart =
    timestampMs -
    AGGRESSIVE_WINDOW_MINUTES *
      60 *
      1000;

  const recent = [
    ...previous.filter(
      (timestamp) =>
        timestamp >=
        windowStart,
    ),
    timestampMs,
  ];

  harshEventLog.set(
    vehicleId,
    recent,
  );

  if (
    recent.length >=
    AGGRESSIVE_EVENTS_WINDOW
  ) {
    harshEventLog.set(
      vehicleId,
      [],
    );

    return {
      count:
        recent.length,

      windowMinutes:
        AGGRESSIVE_WINDOW_MINUTES,

      message:
        `Aggressive driving pattern detected: ${recent.length} harsh acceleration/braking events within ${AGGRESSIVE_WINDOW_MINUTES} minutes.`,
    };
  }

  return null;
}

function trackIdle(
  vehicleId,
  ignitionOn,
  speedKmh,
  recordedAtMs,
  thresholdMinutes =
    DEFAULT_IDLE_THRESHOLD_MINUTES,
) {
  const isIdleNow =
    !!ignitionOn &&
    Number(speedKmh) <= 1;

  const state =
    idleTracker.get(
      vehicleId,
    );

  if (!isIdleNow) {
    idleTracker.delete(
      vehicleId,
    );

    return {
      idleSeconds: 0,
      triggered: false,
    };
  }

  if (!state) {
    idleTracker.set(
      vehicleId,
      {
        idleSinceMs:
          recordedAtMs,
        alerted: false,
      },
    );

    return {
      idleSeconds: 0,
      triggered: false,
    };
  }

  const idleSeconds =
    Math.max(
      0,
      Math.round(
        (
          recordedAtMs -
          state.idleSinceMs
        ) / 1000,
      ),
    );

  const thresholdSeconds =
    Number(
      thresholdMinutes ||
        DEFAULT_IDLE_THRESHOLD_MINUTES,
    ) * 60;

  if (
    idleSeconds >=
      thresholdSeconds &&
    !state.alerted
  ) {
    idleTracker.set(
      vehicleId,
      {
        ...state,
        alerted: true,
      },
    );

    return {
      idleSeconds,
      triggered: true,
    };
  }

  return {
    idleSeconds,
    triggered: false,
  };
}

module.exports = {
  detectOverspeeding,
  detectHarshDriving,
  registerHarshEventAndCheckAggressive,
  trackIdle,
};