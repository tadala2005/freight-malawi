# Requirements Traceability

Requirement → Implementation → File → Verification status. "Verified" means
checked per `docs/test-plan.md`'s actual methods (syntax check / structural
review); it does not mean exercised against a live running system unless
noted.

| Requirement | Implementation | File(s) | Status |
|---|---|---|---|
| Multi-tenant ownership | Every query scoped by `user_id` | `backend/models/*.js` | Verified (code review) |
| JWT authentication | Bearer token, 7-day expiry | `backend/middleware/auth.js`, `backend/routes/authRoutes.js` | Syntax-verified |
| Device authentication (not device_id alone) | bcrypt-compared device key | `backend/middleware/deviceAuth.js`, `backend/sockets/deviceSocket.js` | Syntax-verified |
| Password hashing | bcryptjs, 10 rounds | `backend/models/userModel.js` | Syntax-verified |
| Parameterized SQL only | `pool.execute`/`query` with `?` placeholders | `backend/models/*.js` | Verified (code review) |
| Telemetry validation (lat/lng/speed/fuel/heading ranges) | `validateTelemetry` | `backend/utils/validators.js` | Syntax-verified |
| Telemetry idempotency | `telemetry_uuid` UNIQUE + `INSERT IGNORE` | `backend/models/telemetryModel.js`, `schema.sql` | Syntax-verified |
| Ignition-based trip creation (no duplicates) | `ensureTripForIgnition` | `backend/services/tripService.js` | Verified (code review) |
| Route completion → PENDING_DETAILS | `checkRouteCompletion` | `backend/services/tripService.js` | Verified (code review) |
| Trip details form + expenses + profit/loss | `saveDetails`/`addExpense` + `calculations.js` | `backend/routes/tripRoutes.js`, `backend/utils/calculations.js`, `frontend/src/components/Trips/*` | Syntax-verified |
| Fuel theft detection (>5L / <60s / stationary) | `detectTheft` | `backend/services/theftDetector.js` | Syntax-verified |
| Refuel detection (≥30L rise) | `detectRefuel` | `backend/services/fuelAnalysis.js` | Syntax-verified |
| Abnormal consumption (configurable km/L) | `detectAbnormalConsumption` | `backend/services/fuelAnalysis.js` | Syntax-verified |
| Overspeeding (configurable per-vehicle threshold) | `detectOverspeeding` | `backend/services/driverBehaviour.js` | Syntax-verified |
| Harsh/aggressive driving | `detectHarshDriving`, `registerHarshEventAndCheckAggressive` | `backend/services/driverBehaviour.js` | Syntax-verified |
| Excessive idle | `trackIdle` | `backend/services/driverBehaviour.js` | Syntax-verified |
| Overweight (load) detection | inline check in pipeline | `backend/services/telemetryProcessor.js` | Syntax-verified |
| Route deviation (Malawi corridors) | `deviationDistanceKm` | `backend/services/routeService.js` | Syntax-verified |
| Device offline / reconnect | `sweepOfflineDevices` + reconnect check | `backend/services/notificationService.js`, `telemetryProcessor.js` | Syntax-verified |
| Active-vs-historical alert badge | `countActiveUnacknowledged` | `backend/models/alertModel.js` | Verified (code review) |
| Real-time Socket.IO broadcast, per-user rooms | `attachDashboardSocket`, `emitToUser` | `backend/sockets/dashboardSocket.js` | Syntax-verified |
| Malawi road-corridor simulation | `ROUTES` waypoints | `backend/services/routeService.js`, `simulator/routes.js` | Verified (data review) |
| 11 simulator scenarios | `SCENARIOS` + per-scenario logic | `simulator/scenarios.js`, `simulator/simulate.js` | Syntax-verified |
| Multi-vehicle simulation | `config.json` vehicles array | `simulator/config.json` | Verified (JSON valid) |
| ESP32 firmware: WiFi, GPS, ultrasonic median-of-5, HTTPS POST, retries, SIM800L | Full `.ino` | `hardware/esp32_fuel_tracker.ino` | Not compiled (no Arduino toolchain in authoring environment) — see `docs/test-plan.md` |
| Health endpoint with DB status | `/health` | `backend/server.js`, `backend/config/db.js` | Syntax-verified |
| Graceful shutdown | `SIGTERM`/`SIGINT` handlers | `backend/server.js` | Syntax-verified |
| CSV export (client-generated from real report data) | `downloadCsv` | `frontend/src/pages/Reports.jsx` | Syntax-verified (structural review) |
| No `window.confirm()` — reusable ConfirmModal | `ConfirmModal` | `frontend/src/components/UI/Modal.jsx` | Verified (code review) |
| Toast system (success/info/warning/error) | `ToastProvider` | `frontend/src/context/ToastContext.jsx` | Verified (code review) |
| Form focus stability | Local `useState`, id-keyed re-sync only | `VehicleForm.jsx`, `TripDetailsForm.jsx`, `ExpenseForm.jsx`, `Login.jsx`, `Register.jsx` | Verified (code review); not exercised in a real browser |
| Live map, custom markers, ResizeObserver | `LiveMap.jsx` | `frontend/src/components/Dashboard/LiveMap.jsx` | Verified (code review); not rendered in a real browser |
| Responsive layout (desktop/tablet/mobile) | CSS breakpoints | `frontend/src/styles/global.css` | Verified (code review); not visually tested |
| Brand system (no arbitrary colours) | CSS custom properties | `frontend/src/styles/theme.css` | Verified (code review) |
| Deployment configs | Vercel/Render | `vercel.json`, `render.yaml` | Verified (structural review); not deployed |
| Env-var-only secrets, no hard-coded URLs | `.env.example` files, `import.meta.env` | `backend/.env.example`, `frontend/.env.example` | Verified (code review) |

## Known gaps (stated honestly)

- No automated test suite (unit/integration) was authored or run — the
  "Verified" statuses above are static/manual review, not executed tests.
- The frontend has not been built with Vite or opened in a browser in this
  environment (no network access to install dependencies).
- The ESP32 sketch has not been compiled; syntax follows standard
  Arduino/ESP32 core conventions but should be verified in the Arduino IDE
  before flashing.
