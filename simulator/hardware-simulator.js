
'use strict';

const {
  VehicleSimulator,
  BACKEND_URL,
  INTERVAL_MS
} = require('./simulate');

const DEVICE_ID = 'ESP32-HW-001';

class HardwareHybridSimulator extends VehicleSimulator {
  constructor(key) {
    super({
      deviceId: DEVICE_ID,
      deviceKey: key,
      licensePlate: 'HW 0001',
      tankCapacity: 400,
      payloadCapacity: 10000,
      overspeedThresholdKmh: 80,
      scenario: 'NORMAL',
      physicalFuel: true
    });

    this.sensorPercent = null;
    this.sensorExpiresAt = 0;

    this.polling = false;
    this.stopped = false;

    this.nextPollAt = 0;
    this.consecutiveFailures = 0;

    this.sensorPollTimer = null;
  }

  async pollSensor() {
    if (this.polling || this.stopped) return;

    if (Date.now() < this.nextPollAt) {
      return;
    }

    this.polling = true;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/devices/fuel`,
        {
          headers: {
            'X-Device-ID': DEVICE_ID,
            'X-Device-Key': this.cfg.deviceKey
          },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(
            response.headers.get('retry-after')
          );

          const delay =
            Number.isFinite(retryAfter) &&
            retryAfter > 0
              ? Math.min(
                  120000,
                  retryAfter * 1000
                )
              : 30000;

          this.nextPollAt = Date.now() + delay;
        }

        throw new Error(
          `Sensor HTTP ${response.status}`
        );
      }

      const body = await response.json();
      const data = body?.data;

      const percentage = Number(
        data?.fuel_percent
      );

      const observed = Date.parse(
        data?.observed_at || ''
      );

      this.consecutiveFailures = 0;
      this.nextPollAt = Date.now() + 5000;

      if (
        !this.stopped &&
        data?.fresh === true &&
        data?.fuel_percent !== null &&
        data?.fuel_percent !== undefined &&
        Number.isFinite(percentage) &&
        percentage >= 0 &&
        percentage <= 100 &&
        Number.isFinite(observed)
      ) {
        this.sensorPercent = percentage;

        this.sensorExpiresAt =
          observed + 20000;
      } else {
        this.sensorPercent = null;
      }
    } catch (error) {
      this.consecutiveFailures += 1;

      if (Date.now() > this.sensorExpiresAt) {
        this.sensorPercent = null;
      }

      const backoff = Math.min(
        60000,
        5000 * Math.pow(
          2,
          Math.min(
            this.consecutiveFailures - 1,
            4
          )
        )
      );

      this.nextPollAt = Math.max(
        this.nextPollAt,
        Date.now() + backoff
      );

      if (
        this.consecutiveFailures <= 2 ||
        this.consecutiveFailures % 6 === 0
      ) {
        const seconds = Math.ceil(
          (this.nextPollAt - Date.now()) / 1000
        );

        this.log(
          `${error.message}; retry in ${seconds}s`
        );
      }
    } finally {
      this.polling = false;
    }
  }

  tick() {
    // Never substitute invented fuel readings
    // when the physical sensor is unavailable.
    if (
      this.sensorPercent === null ||
      Date.now() > this.sensorExpiresAt
    ) {
      this.lastTickAt = Date.now();
      return;
    }

    // Convert physical sensor percentage to
    // equivalent simulated truck capacity.
    this.fuelLitres =
      this.sensorPercent *
      this.tankCapacity /
      100;

    super.tick();
  }

  start() {
    this.stopped = false;

    this.connect();
    this.pollSensor();

    this.sensorPollTimer = setInterval(
      () => this.pollSensor(),
      5000
    );

    this.interval = setInterval(
      () => this.tick(),
      INTERVAL_MS
    );
  }

  stop() {
    this.stopped = true;

    clearInterval(this.sensorPollTimer);

    super.stop();
  }
}

function startHardwareSimulator() {
  const key = String(
    process.env.HARDWARE_DEVICE_KEY || ''
  ).trim();

  if (!key) {
    console.log(
      '[HW 0001] Disabled: HARDWARE_DEVICE_KEY missing'
    );

    return null;
  }

  const instance = new HardwareHybridSimulator(key);

  instance.start();

  return instance;
}

module.exports = {
  HardwareHybridSimulator,
  startHardwareSimulator
};
