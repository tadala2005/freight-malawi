# Freight Malawi Simulator

The simulator emulates the IoT telemetry channel for three virtual trucks. It connects to the backend `/device` namespace using the same device IDs and shared keys as the real ESP32 integration.

## Important behavior

The simulator **does not drive automatically**. It stays connected with ignition OFF and continues sending GPS telemetry so the dashboard can display the vehicle's current position. A dashboard operator must first create a trip in the Logbook and then switch the vehicle ignition ON. The backend sends the selected trip route to the simulator.

| Device | Key | Vehicle | Scenario |
|---|---|---|---|
| ESP32-001 | demo-key-001 | NA 1001 | NORMAL |
| ESP32-002 | demo-key-002 | NA 1002 | FUEL_THEFT |
| ESP32-003 | demo-key-003 | NA 1003 | OVERSPEEDING |

## First-time/local demo setup

Because the backend stores device keys as bcrypt hashes, synchronise the demo keys into the existing vehicle records:

```bash
cd backend
node scripts/provisionSimulatorDevices.js
```

Then start the backend and simulator:

```bash
cd backend
npm start
```

```bash
cd simulator
npm start
```

A successful simulator startup looks like:

```text
[NA 1001] connected; waiting for dashboard ignition command
[NA 1002] connected; waiting for dashboard ignition command
[NA 1003] connected; waiting for dashboard ignition command
```

If `DEVICE_UNAUTHORIZED` appears, run the provisioning script again and confirm the vehicle `device_id` values match the simulator config.
