# Freight Malawi

**Development of a Prototype IoT-Based Fuel Management System for Transport Companies in Malawi: The Freight Malawi Platform**

Freight Malawi is a final-year BSc Information Technology project at MUBAS that combines GPS telemetry, fuel monitoring, trip/logbook management, driver-behaviour events, load/compliance alerts and financial reporting in one fleet-management application.

## Architecture

```text
                         HTTPS / WSS
Browser / phone ──► Vercel — React + Vite
                         |
                         v
                   Render — Express
                   REST + Socket.IO
                         |
                         v
                Supabase PostgreSQL

Simulator / ESP32 ──────► Render device Socket.IO
```

The frontend is the operational command centre. The backend owns authentication, device authentication, telemetry processing, trip lifecycle, alerts, reporting and Socket.IO. The database is the single source of truth.

## Core workflow

```text
LOGBOOK
  ↓
Prepare trip
  ↓
DASHBOARD
  ↓
Ignition ON
  ↓
Device / simulator telemetry
  ├─ GPS
  ├─ Distance
  ├─ Fuel
  ├─ Speed
  └─ Driver behaviour
        ↓
     Alerts
        ↓
 Destination reached
        ↓
Route completed
        ↓
Operator completes trip
        ↓
Reports / CSV
```

Creating a trip never starts vehicle movement by itself. A prepared trip must exist before ignition can be turned on.

## UI identity

The operational UI uses a premium dark fleet-tech palette:

| Purpose | Hex |
|---|---|
| Midnight Navy | `#07111F` |
| Deep Navy | `#0D1B2A` |
| Slate Navy | `#13263A` |
| Electric Teal | `#00D4AA` |
| Cyan | `#22D3EE` |
| Amber | `#F59E0B` |
| Alert Red | `#FF4D5F` |
| Success | `#22C55E` |
| Main text | `#F8FAFC` |
| Secondary text | `#94A3B8` |
| Border | `#24364A` |

Teal is reserved for active/live actions, cyan for selected/telemetry emphasis, amber for attention, and red for genuine incidents. Reports use a lighter print-friendly surface.

## Repository

```text
freight-malawi/
├── schema.sql
├── vercel.json
├── render.yaml
├── backend/
│   ├── server.js
│   ├── config/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   └── scripts/
├── frontend/
│   ├── src/
│   └── package.json
├── simulator/
├── hardware/
└── docs/
```

`schema.sql` is the canonical production PostgreSQL schema. The backend still contains an optional MySQL compatibility mode for older local XAMPP installations, but the deployment target is Supabase PostgreSQL.

## Local setup

### Database

Preferred local setup is PostgreSQL:

```bash
# create a PostgreSQL database first
# then run schema.sql against it
```

Copy the backend environment template:

```bash
cd backend
cp .env.example .env
```

Set `DB_CLIENT=postgres`, `DATABASE_URL`, `JWT_SECRET` and the local CORS origin.

### Backend

```bash
cd backend
npm install
npm start
```

The backend uses `process.env.PORT` and exposes `/health`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend uses `VITE_API_URL` for REST and `VITE_SOCKET_URL` for Socket.IO. It does not require a hard-coded production localhost address.

### Simulator

Create the three simulator vehicles in Freight Malawi using the device IDs from `simulator/config.json`, then provision their device keys:

```bash
cd backend
npm run provision
```

Start the simulator:

```bash
cd simulator
npm install
npm start
```

Set `BACKEND_URL` to the Render URL for an online deployment test.

## Production deployment

Follow `docs/deployment.md` for the exact Supabase + Render + Vercel procedure.

Production environment variables include:

```text
DB_CLIENT=postgres
DATABASE_URL=<Supabase connection string>
DATABASE_SSL=true
JWT_SECRET=<secret>
CORS_ORIGINS=<Vercel origin>
FRONTEND_URL=<Vercel origin>
API_BASE_URL=<Render URL>
VITE_API_URL=<Render URL>
VITE_SOCKET_URL=<Render URL>
```

Never commit `.env`, passwords, JWT secrets, database credentials or device secrets.

## Important implementation guarantees

- Device authentication requires both device ID and device key.
- Device hashes are not returned in user-facing vehicle data.
- Last-known GPS coordinates remain available when a device is offline or ignition is OFF; the UI labels them as **LAST KNOWN**, not live.
- Route ownership belongs to a trip, not a vehicle.
- The Blantyre ↔ Lilongwe M1 demo uses **305 operational kilometres**, independent of the GPS polyline's geometric length.
- Distance uses the actual progress applied on each simulator tick, preventing destination overshoot.
- Cargo weight is fixed for the lifetime of a trip.
- Fuel consumption is derived from distance, load, speed, route and driving behaviour rather than unrelated random values.
- Overspeeding is one continuous incident until the vehicle returns below the threshold.
- Harsh-driving detection compares telemetry acceleration/deceleration and ignores the ignition-off → ignition-on transition.
- Aggressive driving is a repeated harsh-driving pattern, separate from overspeeding.
- Overweight is a load incident; fuel theft is a fuel/security incident.
- Alerts include human-readable messages and vehicle identification.
- Reports and CSV use the same vehicle/status/date filters.
- Socket.IO remains on Render; Vercel serves the frontend.

## QA and academic scope

See:

- `docs/test-plan.md`
- `docs/requirements-traceability.md`
- `docs/academic-alignment.md`
- `docs/system-limitations.md` (if present)

The simulator demonstrates telemetry and rule-based anomaly detection. It is not a substitute for certified hardware, weighbridge data, survey-grade GPS or a live commercial deployment.
