# Freight Malawi — presentation and deployment workflow

## Local setup

1. Create a PostgreSQL/Supabase database using `schema.sql`.
2. In `backend/`, copy `.env.example` to `.env` and set `DATABASE_URL`, `DATABASE_SSL`, and a strong `JWT_SECRET`.
3. Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../simulator && npm install
```

4. Provision simulator credentials:

```bash
cd backend
node scripts/provisionSimulatorDevices.js
```

5. Start the backend, frontend, and simulator in separate terminals:

```bash
cd backend && npm start
cd frontend && npm run dev
cd simulator && npm start
```

## Demonstration flow

1. Open **Logbook**.
2. Prepare a trip: vehicle, route, origin, destination, cargo category, cargo weight, and transporter income.
3. Open the created trip and add trip expenses as needed.
4. Open **Dashboard** and select the vehicle in **Vehicle view**.
5. Turn **IGNITION ON**. The simulator moves only after a prepared trip exists.
6. Watch the device telemetry move the map marker, fuel, distance, ignition state, and alerts.
7. Turn **IGNITION OFF** to demonstrate that GPS/last-known location remains available.
8. Open **Reports**, select a vehicle/status/date range, and verify every summary card, table row, chart/export uses the same active filter.
9. Export CSV for a human-readable operations report.

## Scenario vehicles

The bundled simulator configuration keeps the following demonstration scenarios:

- `NA 1001` — NORMAL
- `NA 1002` — FUEL_THEFT
- `NA 1003` — OVERSPEEDING / alternate driver scenario configuration as selected

The simulator authenticates with a device ID and provisioned device key. It does not bypass authentication.

## Deployment target

- Frontend: Vercel
- Backend + Socket.IO: Render
- Database: Supabase PostgreSQL

Set `VITE_API_URL` and `VITE_SOCKET_URL` on Vercel to the Render backend URL. Set `DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `CORS_ORIGINS`, and `FRONTEND_URL` on Render.

## Offline-location demonstration

Stop the simulator. After the offline threshold, the vehicle remains on the map using its stored last GPS position. The UI labels the marker **LAST KNOWN** rather than pretending the position is live. When the simulator reconnects, fresh telemetry restores the live state.
