# Architecture

## System diagram

```text
┌────────────┐        HTTPS telemetry         ┌──────────────────────┐
│   ESP32    │ ──────────────────────────────►│                      │
└────────────┘                                 │                      │
┌────────────┐   Socket.IO /device namespace   │   Render (Node.js)   │
│ Simulator  │ ──────────────────────────────► │   Express + Socket.IO│
└────────────┘   (device-key authenticated)    │                      │
                                                │  ┌────────────────┐  │
                                                │  │ Telemetry      │  │
                                                │  │ Pipeline       │  │
                                                │  │ (21 steps)     │  │
                                                │  └───────┬────────┘  │
                                                │          │           │
                                                │ PostgreSQL (pg pool)│
                                                └──────────┬───────────┘
                                                            │  SSL
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ Supabase PostgreSQL│
                                                   └──────────────────┘
                                                            ▲
                        JWT-authenticated Socket.IO "/"     │
┌───────────────────────────────────────────────────────────┘
│
▼
┌───────────────────────┐
│   Vercel (React SPA)  │
│  Dashboard / Vehicles  │
│  Logbook / History /   │
│  Reports / Alerts      │
└───────────────────────┘
```

## Telemetry pipeline (backend/services/telemetryProcessor.js)

Executed once per telemetry packet, in order:

1. Authenticate device (`middleware/deviceAuth.js` — bcrypt-compared device key)
2. Validate payload (`utils/validators.js`)
3–4. Identify vehicle + implicit ownership (vehicle row already scoped to `user_id`)
5–6. Detect ignition transition → find/create the active trip (`services/tripService.js`)
7. Persist telemetry (idempotent on `telemetry_uuid`, `models/telemetryModel.js`)
8–10. Compute fuel delta, distance delta, consumption
11–13. Theft / refuel / abnormal-consumption detection
14–15. Overspeed / harsh / aggressive-driving / idle detection
16. Overweight (load) detection
17. Route-deviation detection (Malawi corridor data, `services/routeService.js`)
18. Trip update (fuel used, max speed, idle seconds, route-completion check)
19. Alert + driver-event persistence (`services/alertService.js`, `models/alertModel.js`)
20. Real-time broadcast to the owning user's Socket.IO room (`sockets/dashboardSocket.js`)
21. HTTP response summarising what happened

## Multi-tenant ownership model

```text
users (1) → (N) vehicles → (N) trips → (N) telemetry
                        └→ (N) alerts
              trips     → (N) trip_expenses
```

Every query that returns vehicle/trip/telemetry/alert/expense data filters
by `user_id` (directly, or transitively via a join to `trips`/`vehicles`).
No endpoint trusts a bare `vehicleId`/`tripId`/`alertId`/`expenseId` from the
client without checking it belongs to `req.user.id` first — see any model
file under `backend/models/` for the pattern.

## Real-time layer

Two Socket.IO namespaces on the same server:

- **`/` (dashboard)** — JWT-authenticated (same token as REST), clients join
  a `user_<id>` room; all broadcasts (`telemetry:update`, `vehicle:update`,
  `alert:new`, `alert:updated`, `trip:started`, `trip:updated`,
  `trip:completed`, `notification:update`, `device:status`) are scoped to
  that room only.
- **`/device` (ingestion)** — device-key-authenticated, an optional
  lower-latency alternative to `POST /api/telemetry/device`; the simulator
  uses this path.

## Resilience

- All business state (trips, alerts, vehicles, telemetry) lives in PostgreSQL —
  a backend restart reconstructs everything from the database on the next
  request. In-memory maps (idle-streak tracking, route-deviation cooldown,
  per-trip alert throttling) are explicitly documented as performance
  caches only; worst case after a restart is one delayed/duplicate
  notification cycle, never lost data.
- Telemetry inserts are idempotent on `telemetry_uuid` (PostgreSQL `ON CONFLICT DO NOTHING`),
  so retried/duplicated packets from a flaky mobile network never double-count
  distance or fuel.
- `/health` reports real database connectivity, not a hard-coded "ok".
- Graceful shutdown on `SIGTERM`/`SIGINT` closes Socket.IO, the HTTP server
  and the PostgreSQL pool before exiting.
