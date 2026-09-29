# Deployment Guide — Supabase + Render + Vercel

## Target architecture

```text
Browser / mobile device
        |
        | HTTPS / WSS
        v
Vercel — React + Vite SPA
        |
        | HTTPS / Socket.IO
        v
Render — Node + Express + Socket.IO
        |
        | PostgreSQL (DATABASE_URL)
        v
Supabase — PostgreSQL

Simulator / ESP32
        |
        +---- Socket.IO device namespace ----> Render
```

## 1. Supabase PostgreSQL

1. Create a Supabase project.
2. Open **SQL Editor** and run the complete root `schema.sql`.
3. Copy a PostgreSQL connection string for the project. The backend accepts it through `DATABASE_URL`.
4. For a managed TLS connection, set `DATABASE_SSL=true` on Render.
5. Do not put the Supabase connection string in the frontend or in source control.

The canonical production schema is PostgreSQL. The older MySQL/XAMPP mode remains only as a local-development compatibility option.

## 2. Render backend

Use the supplied `render.yaml` blueprint or create a Node Web Service manually.

Recommended settings:

```text
Root directory: backend
Build command: npm install --no-audit --no-fund
Start command: npm start
Health check: /health
```

Set these environment variables:

```text
NODE_ENV=production
DB_CLIENT=postgres
DATABASE_URL=<Supabase PostgreSQL connection string>
DATABASE_SSL=true
JWT_SECRET=<long random secret>
JWT_EXPIRES=7d
CORS_ORIGINS=https://<your-vercel-domain>
FRONTEND_URL=https://<your-vercel-domain>
API_BASE_URL=https://<your-render-service>.onrender.com
DEVICE_OFFLINE_THRESHOLD_SECONDS=60
```

Do not set a fixed application port. Render supplies `PORT`, and `server.js` uses `process.env.PORT` automatically.

Verify:

```text
https://<your-render-service>.onrender.com/health
```

Expected healthy response shape:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## 3. Vercel frontend

Import the repository into Vercel.

Use either the repository-root `vercel.json` or configure:

```text
Root directory: frontend
Framework: Vite
Build command: npm run build
Output directory: dist
```

Set:

```text
VITE_API_URL=https://<your-render-service>.onrender.com
VITE_SOCKET_URL=https://<your-render-service>.onrender.com
```

The React application sends REST requests to `${VITE_API_URL}/api` and opens Socket.IO against the same Render host.

## 4. Simulator against Render

From the simulator directory:

```bash
set BACKEND_URL=https://<your-render-service>.onrender.com
npm start
```

PowerShell:

```powershell
$env:BACKEND_URL="https://<your-render-service>.onrender.com"
npm start
```

The simulator authenticates using the device ID + device key. Device keys are stored as bcrypt hashes in the vehicles table.

To provision the keys configured in `simulator/config.json`:

```bash
cd backend
npm install
npm run provision
```

The target vehicles must already exist and have matching `device_id` values.

## 5. First end-to-end demo

1. Run `schema.sql` in Supabase.
2. Deploy the backend to Render.
3. Deploy the frontend to Vercel.
4. Register a user.
5. Create vehicles with the simulator device IDs and keys.
6. Run `npm run provision` from `backend` to synchronize device credentials.
7. Start the simulator.
8. In **Logbook**, prepare a trip and choose a route.
9. Add cargo category, cargo weight and transporter income.
10. On **Dashboard**, turn ignition ON.
11. Confirm that telemetry moves the vehicle on the map.
12. Confirm that the vehicle's last known position remains visible when telemetry stops.
13. Let the trip reach destination, then mark it completed from the trip detail view.
14. Open Reports, test vehicle/status/date filters, then export CSV.

## 6. CORS and Socket.IO troubleshooting

The Render `CORS_ORIGINS` variable must exactly contain the Vercel origin. `VITE_SOCKET_URL` must point to the Render service, not the Vercel URL.

For a device-authentication failure, confirm:

```text
device_id matches vehicles.device_id
device key matches simulator/config.json
bcrypt hash exists in vehicles.device_key_hash
```

Do not bypass device authentication to make the simulator connect.

## 7. Local PostgreSQL option

For local development, copy `backend/.env.example` to `backend/.env`, set:

```text
DB_CLIENT=postgres
DATABASE_URL=<local-postgres-connection-string>
DATABASE_SSL=false
```

MySQL/XAMPP support remains available by explicitly selecting `DB_CLIENT=mysql`, but production should use Supabase PostgreSQL.
