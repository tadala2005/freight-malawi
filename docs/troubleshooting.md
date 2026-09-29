# Troubleshooting

## Login always returns "An unexpected error occurred. Please try again." (but register seems to work)
This is caused by a missing or unloaded `backend/.env` file — specifically
`JWT_SECRET` being undefined. It's a confusing failure because PostgreSQL/Supabase
connectivity keeps working even without `.env` (the pool falls back to
local-database compatibility defaults: `localhost`/`root`/no password/`freight_malawi` —
see `backend/config/db.js`), so `/health` and registration's database
insert both look fine. But `JWT_SECRET` has **no fallback** (a hardcoded
one would be a security hole), so `jwt.sign()` throws inside both
`/api/auth/register` and `/api/auth/login` — for register, the user row is
already inserted by the time it throws, which is why you can see the
account in `phpMyAdmin` even though the request itself failed.
- **Fix applied:** `backend/server.js` now loads `.env` from an explicit
  path next to itself (immune to which folder you launched the process
  from) and refuses to start at all if `JWT_SECRET` is missing, printing
  exactly where it looked and what to do.
- **Also fixed:** `backend/middleware/errorHandler.js` now returns the real
  error message (not a generic one) whenever `NODE_ENV` isn't `production`,
  so any future misconfiguration shows up immediately in the browser's
  Network tab instead of needing to be diagnosed blind.
- **To confirm this was your issue:** check the backend terminal on startup
  — with the fix applied, a missing `JWT_SECRET` now prints `[FATAL] JWT_SECRET
  is not set` and exits immediately instead of starting in a half-broken state.

## Frontend dev server fails with `Error: listen EACCES: permission denied 0.0.0.0:5173`
Some Windows setups reserve certain port ranges for Hyper-V/WSL
(`netsh interface ipv4 show excludedportrange`), which can make even an
unprivileged port fail to bind when Vite binds to `0.0.0.0` (`host: true`).
`frontend/vite.config.js` now defaults to port **5174** and binds to
`localhost` only unless `VITE_DEV_EXPOSE_LAN=true` is set (needed only if
you want to open the dashboard from a phone on the same network). Make sure
`backend/.env`'s `CORS_ORIGINS`/`FRONTEND_URL` match whatever port the
frontend actually starts on.

## Backend won't start / crashes immediately
- Check `.env` exists in `backend/` (copy from `.env.example`).
- Confirm the PostgreSQL/Supabase database is reachable and `DATABASE_URL` / `DATABASE_SSL` are correct.
- `GET /health` will still respond even if the database is down (`"status":"degraded"`), so check that first to isolate DB vs. server issues.

## "Invalid or expired session" immediately after logging in
- The frontend's `VITE_API_URL` doesn't match the backend's actual URL/port, or `JWT_SECRET` changed between backend restarts while an old token was cached — clear `localStorage` and log in again.

## Live map is blank or the wrong size
- The map container needs a defined height from its parent — this is handled by `.map-container` in `global.css`, but if you've customised a page layout, confirm the wrapping element has an explicit height.
- The map self-corrects on resize via `ResizeObserver` + `map.invalidateSize()` in `LiveMap.jsx`/`HistoryMap.jsx`; if it still looks wrong, check the browser console for a Leaflet-related error (usually a missing `leaflet/dist/leaflet.css` import).

## Simulator connects but no telemetry appears on the dashboard
- Confirm a vehicle exists in the app with the **same** `device_id` and `device_key` as `simulator/config.json` (the key is set as plaintext when creating/editing the vehicle; only its bcrypt hash is stored).
- Check the simulator's console output for `DEVICE_UNAUTHORIZED` — this means the device_id/key pair doesn't match any vehicle.
- Confirm the vehicle has the simulator `device_id` and that a route is prepared in the Logbook. Routes are owned by trips; vehicle registration no longer assigns a route.

## "Unknown or unauthorized device" from the ESP32 / ngrok / LAN setup
- The device key sent by the firmware (`DEVICE_KEY` constant) must exactly match what you entered when creating the vehicle in the dashboard.
- If testing over LAN, ensure `API_URL` in the `.ino` file points at your machine's LAN IP and port 5000, and that your firewall allows inbound connections on that port.

## Notification bell count doesn't match the Alerts page
- This is by design: the bell only counts **unacknowledged alerts on trips that are not yet COMPLETED/CANCELLED** (`alertModel.countActiveUnacknowledged`). The Alerts page's "All" and "Historical" tabs will show more than the bell — see `docs/academic-alignment.md` / spec section 26 for the rationale.

## CSV export downloads an empty file
- The export uses whatever the Reports page's current filters returned — clear filters or widen the date range if you expect more rows.

## Render deployment health check fails
- Confirm the health check path is `/health` (not `/`) in the Render service settings, and that all `DB_*` environment variables are set.

## Local build/test caveat (see `docs/test-plan.md`)
- This repository's automated syntax checks were run with `node --check` on
  every backend/simulator `.js` file (all passed). A full `npm install` /
  `npm run build` could not be executed in the authoring environment because
  it has no outbound network access — run these yourself before your first
  deployment to catch any dependency-resolution issues early:
  ```bash
  cd backend && npm install && node --check server.js
  cd frontend && npm install && npm run build
  cd simulator && npm install
  ```
