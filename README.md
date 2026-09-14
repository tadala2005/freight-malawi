# Freight Malawi Platform

**Development of a Prototype IoT-Based Fuel Management System for Transport
Companies in Malawi**

A final-year Bachelor of Science in Information Technology project — Malawi
University of Business and Applied Sciences (MUBAS).

Freight Malawi is a fleet-management platform that demonstrates how an
IoT-enabled vehicle tracking device (or a software simulator standing in for
one) can send fuel and location telemetry to a central backend, where it is
stored, analysed with deterministic rule-based logic for suspicious fuel
losses, and displayed on a real-time management dashboard.

---

## 1. Project overview

Transport companies in Malawi frequently lose revenue to fuel theft and
inefficient driving, with little visibility into what is actually happening
on the road. Freight Malawi's research contribution is showing that
**IoT telemetry combined with automated, rule-based fuel analysis** can
give fleet managers usable, real-time visibility into:

- live vehicle location and speed
- current and historical fuel level
- suspected fuel theft events
- abnormal fuel consumption
- refuelling events
- fleet-wide reports (distance, fuel consumed, efficiency, alert counts)

The system is a **prototype**. It uses deterministic, explainable
rule-based detection — not machine learning — and makes no claims of
commercial certification, production hardware approval, or guaranteed
theft detection accuracy.

## 2. Architecture

```
ESP32 hardware  ──┐
                   ├──► Socket.IO "/device" namespace ──► Express backend ──► MySQL
Node simulator ────┘         (or HTTP POST fallback)            │
                                                                  ▼
                                                          Fuel analysis
                                                        (theftDetector.js)
                                                                  │
                                                                  ▼
                                                    Alert created (if needed)
                                                                  │
                                                                  ▼
                                              Socket.IO "/" namespace, room
                                              "user_<id>"  ──►  React dashboard
                                                        (live map, fuel gauge,
                                                         alert panel, KPIs)
```

Two telemetry sources are supported and are interchangeable from the
backend's point of view:

1. **ESP32 hardware** (`hardware/esp32_fuel_tracker.ino`) — posts to
   `POST /api/telemetry/device`.
2. **Node.js simulator** (`simulator/`) — connects to the `/device`
   Socket.IO namespace and emits `telemetry` events.

Both paths run through the same `services/telemetryProcessor.js` pipeline:
authenticate device → identify vehicle → validate payload → save telemetry
→ run fuel analysis → create alert if needed → broadcast to the owning
user's dashboards.

## 3. Technology stack

**Backend:** Node.js, Express, Socket.IO, mysql2/promise, JSON Web Tokens,
bcryptjs, dotenv, cors.

**Database:** MySQL 8.x (via XAMPP/phpMyAdmin), InnoDB, utf8mb4.

**Frontend:** React, Vite, React Router, Axios, Socket.IO client,
React Leaflet + Leaflet (OpenStreetMap), Recharts, date-fns, lucide-react.

**Hardware:** ESP32 (Arduino C++), JSN-SR04T ultrasonic sensor, NEO-6M GPS,
SIM800L GSM/GPRS module.

**Simulator:** Node.js, socket.io-client.

## 4. Folder structure

```
freight-malawi/
├── README.md
├── schema.sql
├── backend/          Express API + Socket.IO server
├── frontend/         React + Vite dashboard
├── simulator/         Node.js telemetry simulator
└── hardware/          ESP32 Arduino sketch
```

## 5. Database setup

The database schema lives in `schema.sql` at the project root. It creates
the `freight_malawi` database and four tables: `users`, `vehicles`,
`telemetry`, and `alerts`, with foreign keys, indexes, and InnoDB/utf8mb4
throughout.

1. Start XAMPP → start **Apache** and **MySQL**.
2. Open `http://localhost/phpmyadmin`.
3. Import `schema.sql` (Import tab → choose file → Go).

## 6. Backend setup

```bash
cd backend
npm install
npm start
```

Expected output:

```
MySQL pool ready
Server listening on :5000
```

Configuration lives in `backend/.env` (a working local-dev copy is
included, with `.env.example` alongside it as a template):

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=freight_malawi
PORT=5000
JWT_SECRET=<a long random string>
JWT_EXPIRES=7d
CORS_ORIGIN=http://localhost:5173
```

## 7. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## 8. Simulator setup

```bash
cd simulator
npm install
```

Edit `simulator/config.json` so each truck's `deviceId` matches a vehicle
you've created in the app (see step 10 below), then:

```bash
node simulate.js
```

See `simulator/README.md` for details on what it simulates and how to
tune it.

## 9. Hardware setup

`hardware/esp32_fuel_tracker.ino` is a complete Arduino sketch for an ESP32
with a JSN-SR04T ultrasonic sensor (fuel level, median-of-5 filtered),
NEO-6M GPS, and a SIM800L GSM module for critical SMS alerts. It posts to
the same `POST /api/telemetry/device` endpoint the simulator's HTTP
fallback would use, so hardware and simulator are interchangeable.

Install libraries via the Arduino Library Manager: **TinyGPSPlus** and
**ArduinoJson** (v6.x). WiFi/HTTPClient ship with the ESP32 board package.
Edit the configuration block at the top of the sketch (Wi-Fi credentials,
backend host, device ID, tank calibration distances, alert phone number)
before flashing.

## 10. API overview

**Authentication**
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

**Vehicles**
```
GET    /api/vehicles
POST   /api/vehicles
DELETE /api/vehicles/:id
GET    /api/vehicles/:id/history?start=ISO&end=ISO
GET    /api/vehicles/:id/report?start=ISO&end=ISO
```

**Alerts**
```
GET  /api/alerts
POST /api/alerts/:id/acknowledge
```

**Device telemetry**
```
POST /api/telemetry/device
```

All routes except `/api/auth/register` and `/api/auth/login` require
`Authorization: Bearer <token>`. Every vehicle/telemetry/alert query is
scoped to the authenticated user — a user can never read or modify another
user's data, even by guessing IDs.

**Real-time (Socket.IO)**
- `/device` namespace — devices connect with `?deviceId=ESP32-001` and
  emit `telemetry` events.
- `/` (default) namespace — dashboards connect with `auth: { token }` and
  join room `user_<id>`; the backend emits `vehicle:update` and
  `alert:new` to that room only.

## 11. Demo workflow

1. Start XAMPP (Apache + MySQL) and import `schema.sql`.
2. Start the backend (`npm start` in `backend/`).
3. Start the frontend (`npm run dev` in `frontend/`).
4. Register an account, then log in.
5. Open the Dashboard — it will be empty at first.
6. Go to **Vehicles** → **Add Vehicle** and create 2–3 trucks, using
   device IDs `ESP32-001`, `ESP32-002`, `ESP32-003`.
7. Copy those device IDs into `simulator/config.json`.
8. Run the simulator (`node simulate.js` in `simulator/`).
9. Back on the Dashboard: watch trucks move on the live map, fuel
   percentages update in the vehicle list, and the Live/Offline Socket.IO
   status indicator turn green.
10. Select a vehicle to see its fuel gauge update in real time.
11. Wait for a simulated theft event — an alert appears instantly in the
    Alert Panel and the header's notification bell.
12. Open **Alerts**, acknowledge the theft alert.
13. Wait for a simulated refuelling event — a low-severity teal alert
    appears.
14. Open **History**, pick the vehicle and a date range, and view the
    route on the map plus the fuel-over-time chart.
15. Open **Reports**, generate a report for the same vehicle/range, and
    export it as CSV.
16. Explain that ESP32 hardware would use the exact same
    `POST /api/telemetry/device` pipeline the simulator's HTTP fallback
    uses — no backend changes are needed to switch from simulated to real
    devices.

## 12. Troubleshooting

**MySQL access denied** — Check `backend/.env` matches your XAMPP MySQL
credentials (`DB_USER=root`, `DB_PASSWORD=` for a default XAMPP install).

**CORS error in the browser console** — Check `CORS_ORIGIN` in
`backend/.env` matches the URL Vite is actually serving on (default
`http://localhost:5173`).

**Port 5000 already in use** — Change `PORT` in `backend/.env` and update
`VITE_API_URL` (frontend) / `backendUrl` (simulator config) to match.

**Frontend can't reach the backend** — Confirm the backend is running and
printed `Server listening on :5000`; check the browser console/network
tab for the actual failing request.

**Socket.IO connection rejected** — Check: the JWT token is valid (try
logging out and back in), the backend port matches, `CORS_ORIGIN` is
correct, and — for device connections — that the `deviceId` in the query
string matches a vehicle that actually exists.

**Simulator can't connect** — Confirm `backendUrl` in
`simulator/config.json` points at the running backend, and that every
truck's `deviceId` matches a vehicle you've created (unknown device IDs
are rejected at connection time).

**Leaflet map shows a broken marker icon, or doesn't render** — This
project uses a custom inline-SVG `divIcon` for vehicle markers (not the
default Leaflet marker images), and imports `leaflet/dist/leaflet.css` in
`main.jsx`. If the map area is blank, check that import wasn't removed and
that the containing element has a non-zero height (see `.map-card` in
`src/styles/global.css`).

**XAMPP MySQL won't start** — Open the XAMPP control panel and check the
MySQL module's log; a common cause is another MySQL/MariaDB service
already bound to port 3306 on the machine.

## 13. Notes on scope

This is a prototype built for academic demonstration. Fuel-event detection
uses transparent, configurable threshold rules (documented in
`backend/services/theftDetector.js`) rather than machine learning, and the
system does not claim production hardware certification or regulatory
approval.
