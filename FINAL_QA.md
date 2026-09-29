# Freight Malawi — Final QA Record

Date: 29 September 2026

## Target architecture

- Frontend: React/Vite on Vercel
- Backend: Node/Express/Socket.IO on Render
- Database: PostgreSQL on Supabase
- Simulator: Node Socket.IO device client

## Repository verification

- Node syntax sweep: **PASS — 41 JavaScript files**
- Frontend Babel parse: **PASS — 39 JS/JSX files**
- Frontend relative-import resolution: **PASS**
- Backend/simulator relative-require resolution: **PASS**
- JSON configuration validation: **PASS**
- `render.yaml` YAML validation: **PASS**
- PostgreSQL SQL adapter conversion tests: **PASS**
- Backend startup/health response contract: **PASS** (server starts; health correctly reports degraded when no database is available)

## Simulator verification

The in-process simulator QA verified:

- Blantyre → Lilongwe route distance = **305 km**
- Lilongwe → Blantyre route distance = **305 km**
- First ignition packet is an origin snapshot and does not advance the trip
- Final movement uses actual applied distance, so odometer does not overshoot
- Normal scenario completes at exactly **305 km**
- Aggressive scenario completes at exactly **305 km**
- Normal 12,000 kg run fuel use: approximately **109.59 L**
- Aggressive 12,000 kg run fuel use: approximately **119.34 L**
- Normal maximum simulated speed: approximately **76 km/h**
- Aggressive maximum simulated speed: **105 km/h**
- Normal first packet speed: **0 km/h**
- Destination packet has ignition OFF
- Cargo weight remains constant during a trip
- Fuel consumption increases for the aggressive scenario

## Driver-behaviour verification

- Ignition OFF → ON is not classified as harsh acceleration: **PASS**
- Smooth 50 → 55 km/h over 2 seconds is not classified as harsh driving: **PASS**
- 0 → 60 km/h over 2 seconds is classified as harsh acceleration: **PASS**
- Overspeed threshold boundary is respected: **PASS**
- Overspeeding remains a separate event from harsh/aggressive driving
- Aggressive driving is based on repeated harsh acceleration/braking events
- Overweight is treated as a LOAD incident, not driver behaviour
- Fuel theft is treated as a fuel/security incident, not normal trip consumption

## Dashboard / map verification

- Dashboard has a vehicle filter that scopes fleet summary cards, vehicle list, map markers, and active alerts: **IMPLEMENTED**
- Incoming live alerts are ignored by the filtered dashboard when they belong to a different vehicle: **IMPLEMENTED**
- Map markers use device telemetry rather than route geometry: **IMPLEMENTED**
- Offline/ignition-off vehicles remain visible using stored telemetry: **IMPLEMENTED**
- Offline positions are labelled **LAST KNOWN**, not LIVE: **IMPLEMENTED**
- Map layout uses responsive resizing and Leaflet size invalidation: **IMPLEMENTED**
- Dark map tiles and Freight Malawi midnight/teal/amber/red visual language: **IMPLEMENTED**

## Trips / Logbook verification

- Route ownership is on the trip, not vehicle creation: **IMPLEMENTED**
- Logbook creates `PENDING_DETAILS` trips without starting movement: **IMPLEMENTED**
- Origin/destination are editable trip fields and are populated from the selected route by default: **IMPLEMENTED**
- Cargo category and cargo weight are trip-level fields: **IMPLEMENTED**
- Income is stored on the trip: **IMPLEMENTED**
- Expenses are managed against the trip through the trip detail workflow: **IMPLEMENTED**
- Ignition starts a prepared trip only: **IMPLEMENTED**
- Completed/cancelled trips are read-only at the backend contract level: **IMPLEMENTED**
- Destination transitions the trip to `ROUTE_COMPLETED`: **IMPLEMENTED**

## Reports / CSV verification

- Vehicle filter drives the summary cards and trip table: **IMPLEMENTED**
- Status filter drives the same filtered dataset: **IMPLEMENTED**
- From/to dates drive the same filtered dataset: **IMPLEMENTED**
- CSV export is generated from the filtered trip rows: **IMPLEMENTED**
- CSV contains human-readable vehicle, route, cargo, distance, fuel, efficiency, income, expenses, net result, result, and status fields: **IMPLEMENTED**
- Dashboard/Reports calculations use stored trip values rather than unrelated random report values: **IMPLEMENTED**

## API / deployment verification

- API success responses use `{ success: true, data: ... }`: **IMPLEMENTED**
- API error responses use `{ success: false, error: { code, message } }`: **IMPLEMENTED**
- Device authentication requires device ID + device key with bcrypt verification: **IMPLEMENTED**
- Simulator provisioning synchronizes vehicle device credentials: **IMPLEMENTED**
- Production database target is Supabase PostgreSQL: **IMPLEMENTED**
- Render configuration uses `process.env.PORT` and `npm start`: **IMPLEMENTED**
- Vercel configuration uses the frontend build output: **IMPLEMENTED**
- Socket.IO remains on the Render backend rather than Vercel: **IMPLEMENTED**
- Production configuration uses environment variables: **IMPLEMENTED**

## Environment limitation during sandbox QA

A live Supabase/PostgreSQL connection and a browser session were not available in this execution environment. The uploaded `node_modules` bundle also contains Windows Rollup optional binaries but not the Linux Rollup binary required by this Linux sandbox. Therefore `npm run build` could not complete here; the source itself was fully parsed and all relative imports resolved, and the final archive excludes `node_modules` so Vercel/Render can perform a clean dependency install for the target environment.

No `.env` secrets, `node_modules`, `dist`, or `.git` directories are included in the release archive.
