# Demo Script — Supervisor Walkthrough

Everything below works entirely without ESP32 hardware, using the simulator.

## Setup (before the demo)

1. Run the PostgreSQL `schema.sql` in Supabase (or local PostgreSQL) if not already done.
2. `cd backend && npm install && npm start` — confirm `http://localhost:5000/health` is healthy.
3. `cd frontend && npm install && npm run dev` — open `http://localhost:5173`.
4. Register an account.
5. Add three vehicles (Vehicles → Add vehicle) matching `simulator/config.json`:
   - NA 1001 / device `ESP32-001` / key `demo-key-001`
   - NA 1002 / device `ESP32-002` / key `demo-key-002`
   - NA 1003 / device `ESP32-003` / key `demo-key-003`
6. `cd backend && npm run provision` to synchronize the simulator device keys.
7. `cd simulator && npm install && npm start`.

## Live walkthrough

1. Return to the Dashboard — within a few seconds, all three trucks appear
   on the live Malawi map and KPI cards populate.
2. Point out the connection indicator (top right) showing **Live**.
3. Open NA 1001's Vehicle Details page — show the live fuel gauge, speed,
   ignition state (ON, since the simulator started it) and the newly
   created **Active Trip**.
4. Switch to NA 1003 (`OVERSPEEDING` scenario) — within a short time an
   **OVERSPEEDING** alert appears in the notification bell and on this
   vehicle's Recent Alerts panel; open it to show the message, severity and
   the configured threshold it exceeded.
5. Switch to NA 1002 (`FUEL_THEFT` scenario) — watch its fuel gauge, then
   point out the **THEFT_SUSPECTED** CRITICAL alert once the scripted drop
   fires; acknowledge it from the Alerts page and show the bell count drop.
6. Open the Alerts page, toggle between **Active** and **Historical** tabs
   to show the distinction the notification badge relies on.
7. Return to NA 1001 and wait for it to reach Blantyre — a **ROUTE_COMPLETED**
   toast appears in the Logbook page ("Route completed — trip details
   required"), and the trip's status badge changes.
8. Open the Logbook, click that trip, click **Edit trip details** — fill in
   Cargo Type, Cargo Weight, Distance, Transporter Income, add two Expenses
   (e.g. Fuel, Toll) — show the automatically computed Profit/Loss and
   margin update live.
9. Click **Complete Trip** — show the trip moves to COMPLETED and the
   notification bell count does **not** include its historical alerts
   anymore, while the same alerts remain visible inside this trip's detail
   view (Alert & Event History section).
10. Open History, pick NA 1001 and today's date — show the actual recorded
    route polyline on the map plus the fuel/speed timeline chart.
11. Open Reports — show the fleet summary cards and the trip report table,
    then click **Export CSV** and open the downloaded file.
12. (Optional, if a device is wired up) Show the ESP32 serial monitor
    posting real telemetry to the same backend, proving the hardware and
    simulator are interchangeable at the API boundary.

## Talking points if asked "is this real AI/theft detection?"

Be direct: detection is deterministic, documented, threshold-based logic
(explain the exact fuel-theft rule: >5L drop in <60s while stationary), not
machine learning — this is intentional for a final-year prototype where
explainability matters more than opaque accuracy claims. See
`docs/academic-alignment.md` for the full framing.
