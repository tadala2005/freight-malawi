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
  }

  async pollSensor() {
    if (this.polling || this.stopped) return;

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
        throw new Error(
          `Sensor HTTP ${response.status}`
        );
      }

      const { data } = await response.json();
      const percent = Number(data?.fuel_percent);
      const observed = Date.parse(data?.observed_at || '');

      if (
        !this.stopped &&
        data?.fresh &&
        data.fuel_percent !== null &&
        Number.isFinite(percent) &&
        percent >= 0 &&
        percent <= 100 &&
        Number.isFinite(observed)
      ) {
        this.sensorPercent = percent;
        this.sensorExpiresAt = observed + 10000;
      } else {
        this.sensorPercent = null;
      }
    } catch (error) {
      this.sensorPercent = null;
      this.log(error.message);
    } finally {
      this.polling = false;
    }
  }

  tick() {
    if (
      this.sensorPercent == null ||
      Date.now() > this.sensorExpiresAt
    ) {
      this.lastTickAt = Date.now();
      return;
    }

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
      2500
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
      '[HW 0001] Disabled: HARDWARE_DEVICE_KEY is missing.'
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
