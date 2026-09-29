# Test Plan & QA Report

This document states plainly what was and was not actually verified during
the authoring of this repository, and what you should verify yourself
before treating it as demo-ready or before deploying it.

## What was actually verified in the authoring environment

The authoring sandbox could inspect and parse the uploaded source, but it had
no usable PostgreSQL server and package-install access was unavailable. No
browser was available for click-through UI testing. Given that constraint,
the checks actually performed were:

- **Syntax validation:** every `backend/**/*.js` and `simulator/**/*.js`
  file was run through `node --check` (Node's built-in parser-only syntax
  check) — all passed with no errors.
- **JSON validation:** `simulator/config.json` was parsed successfully with
  `json.load`.
- **Structural review:** every frontend `.jsx`/`.js` file was checked for
  balanced braces/parens/brackets as a coarse sanity pass (all balanced);
  this is not a substitute for a real JSX/Babel parse or a production build,
  which requires `npm install` (network access) to run.
- **Manual logical review** of the ownership-enforcement pattern (every
  vehicle/trip/expense/alert query scoped by `user_id`), the telemetry
  idempotency path, and the active-vs-historical alert/notification logic,
  by reading the code paths end to end.

## What was NOT verified (you should do this before relying on the system)

- `npm install` in `backend/`, `frontend/`, `simulator/` — dependency
  versions in the three `package.json` files have not been installed or
  resolved against the real npm registry in this environment.
- `npm run build` for the frontend (Vite/Babel JSX compilation, tree-shaking,
  bundling) — do this first; it is the most likely place to surface a typo
  that a plain-text review would miss.
- Any actual HTTP request/response cycle against a running PostgreSQL/Supabase instance.
- Any Socket.IO connection between a real browser and a real server process.
- Any click-through of the UI in an actual browser (focus behaviour, modal
  behaviour, map rendering, responsive breakpoints).
- Compilation of `hardware/esp32_fuel_tracker.ino` in the Arduino IDE
  (no Arduino toolchain in this environment).
- Any load, concurrency, or security-penetration testing.

## Recommended first-run checklist (do this yourself)

```text
[ ] cd backend && npm install               → resolves cleanly?
[ ] node --check server.js                  → already passing
[ ] Create PostgreSQL/Supabase database, import schema.sql → imports without error?
[ ] npm start                                → GET /health returns "ok"?
[ ] cd frontend && npm install && npm run build   → builds without error?
[ ] npm run dev, register a user             → dashboard loads?
[ ] cd simulator && npm install && npm start → vehicles appear on the map?
[ ] Trigger each scenario, confirm each alert type fires once
[ ] Complete a trip end-to-end (details → expenses → complete)
[ ] Confirm notification badge excludes the now-completed trip's alerts
[ ] Resize the browser / open on a phone → layout adapts, map stays visible
[ ] Attempt to fetch another (test) user's vehicle/trip by ID → expect 404
[ ] Export a CSV report and open it in a spreadsheet
```

## Design-level checks that were built in (not merely asserted)

These are structural properties of the code, verifiable by reading the
referenced files, even though they weren't exercised against a live server
in this environment:

- **Ownership enforcement:** every model function that takes a resource id
  also takes `userId` and includes it in the `WHERE` clause (see any file
  under `backend/models/`).
- **Parameterized SQL:** every query uses `pool.execute`/`pool.query` with
  `?` placeholders and an array of bound values — no string concatenation
  of user input into SQL anywhere in `backend/models/` or `backend/services/`.
- **No secrets in frontend code:** `frontend/src/` contains no references to
  `DB_PASSWORD`, `JWT_SECRET`, or any device key; only `VITE_API_BASE_URL`
  and `VITE_SOCKET_URL` are read from the environment.
- **Idempotent telemetry:** `telemetry_uuid` has a `UNIQUE` constraint and
  inserts use `ON CONFLICT (telemetry_uuid) DO NOTHING` through the PostgreSQL database adapter (`backend/config/db.js`).
- **Active vs. historical alerts:** the notification-badge query explicitly
  excludes alerts on trips with status `COMPLETED`/`CANCELLED`
  (`backend/models/alertModel.js: countActiveUnacknowledged`).
- **Form stability:** every form component (`VehicleForm`, `TripDetailsForm`,
  `ExpenseForm`, `Login`, `Register`) keeps its own local `useState` for
  field values and only re-syncs from props on a genuine identity change
  (e.g. a different vehicle's `id`), not on every parent re-render — this is
  the specific pattern that prevents input focus loss while typing.
