# Academic Alignment

Maps the original project objectives to what is actually implemented in
this repository.

## Objective 1 — Analyze fuel-monitoring challenges faced by transport companies in Malawi

Addressed by replacing manual fuel records with:

| Challenge (from analysis)        | Feature                                                  | Where |
|-----------------------------------|-----------------------------------------------------------|-------|
| No visibility into fuel level     | Live fuel gauge, telemetry-driven                          | `frontend/src/components/Dashboard/FuelGauge.jsx` |
| Suspected fuel theft, unproven    | Rule-based theft detector                                   | `backend/services/theftDetector.js` |
| Unclear whether fuel was topped up | Refuel detection                                            | `backend/services/fuelAnalysis.js` |
| No record of consumption per trip | Trip-scoped fuel-used accumulation + efficiency calc         | `backend/services/telemetryProcessor.js`, `backend/utils/calculations.js` |
| No driver accountability          | Ignition-based trip engine + driver behaviour events         | `backend/services/tripService.js`, `backend/services/driverBehaviour.js` |
| No historical record for disputes | Trip Logbook with full alert/event history per trip           | `frontend/src/pages/Logbook.jsx`, `backend/models/alertModel.js` |

## Objective 2 — Design an IoT architecture integrating GPS and fuel sensors

Implemented exactly as the required data flow:

```text
ESP32 → GPS + Fuel Sensor → Telemetry → Internet → Backend API/Socket.IO → PostgreSQL/Supabase → Analytics → Dashboard
```

- Hardware: `hardware/esp32_fuel_tracker.ino` (JSN-SR04T + NEO-6M GPS + optional SIM800L).
- Both hardware and a Node.js simulator (`simulator/`) speak the identical
  telemetry contract (`POST /api/telemetry/device` and the `/device`
  Socket.IO namespace, `backend/sockets/deviceSocket.js`), satisfying the
  "both ESP32 hardware and Node.js simulator" requirement.

## Objective 3 — Develop a web monitoring dashboard

`frontend/` is a responsive React + Vite SPA (desktop/tablet/mobile), with
a live fleet map, per-vehicle telemetry, alerts, trip logbook, history and
reports — see `frontend/src/styles/global.css` for the responsive rules and
`docs/test-plan.md` for what was checked across breakpoints.

## Objective 4 — Prototype using real-time simulated sensor data

`simulator/` generates realistic Malawi-based fleet telemetry (not random
numbers): real road-corridor waypoints (`simulator/routes.js`), a per-vehicle
state machine with fuel/speed/position modelling, and 11 selectable
scenarios (`simulator/scenarios.js`) covering theft, refuelling, overspeed,
overweight, aggressive driving, idle, deviation, low fuel, disconnect and
route completion.

## Survey-driven priority ordering (see `docs/research-requirements.md`)

The build order and dashboard emphasis follow the survey's stated
priorities: real-time location and fuel visibility are front-and-centre on
the Dashboard; automatic alerts and trip accountability follow via the
Alerts page and Logbook; the whole UI is mobile-first per the survey's
stated smartphone preference.

## What is explicitly *not* claimed

Per the project's academic-integrity requirement, this system does **not**
claim: certified commercial deployment, guaranteed fuel-theft detection,
regulatory approval, certified vehicle safety monitoring, production
hardware certification, or machine-learning-based accuracy (all anomaly
detection is deterministic rule-based logic, documented as such in code
comments in `backend/services/theftDetector.js`, `fuelAnalysis.js`, and
`driverBehaviour.js`).
