# Research Requirements → Design Decisions

*Survey Findings — Prototype Requirements.* The following reflects the
stated survey findings that shaped this build; it is not a claim of
statistically validated commercial results.

| Survey finding                                   | Design decision |
|----------------------------------------------------|------------------|
| Strong need for real-time GPS tracking              | Live Fleet Map is the first thing shown on the Dashboard (`Dashboard.jsx`), backed by real Socket.IO telemetry, not polling. |
| Strong need for fuel monitoring                     | A dedicated SVG fuel gauge (colour-coded: teal/warning/red) appears on both the Dashboard vehicle list and Vehicle Details page. |
| Demand for automatic anomaly/theft alerts           | Deterministic rule-based detectors run on every telemetry packet server-side (`telemetryProcessor.js`), not client-side, so they can't be bypassed by the browser. |
| Significant fuel-loss concerns                      | Both theft (sudden drop while stationary) and abnormal-consumption (sustained low km/L) are detected separately, since they have different causes and different management responses. |
| Concerns about cost of existing systems             | The entire stack (Node/Express/PostgreSQL/React) uses free/open-source components; the architecture (Vercel + Render + Supabase) has functional free tiers suitable for a small fleet pilot. |
| Concerns about driver accountability                | The ignition-based Trip Engine ties every telemetry reading, alert and behaviour event to a specific trip and (where set) driver name — this is the audit trail behind the Logbook. |
| Preference for smartphone access                    | Mobile-first responsive rules in `global.css`; a dedicated mobile drawer navigation; touch-sized controls; tables that scroll horizontally rather than becoming unusable. |
| Strong interest in an affordable, local solution    | Explicit Malawi road-corridor data (`routeService.js` / `simulator/routes.js`) and MWK currency formatting throughout financial views — not a generic template. |
| Significant existing reliance on manual monitoring  | The UI intentionally avoids enterprise-dashboard density — KPI cards, plain language labels, and a Logbook modelled on a paper logbook's mental model (one row per trip) rather than a raw telemetry table. |
| Mixed confidence in existing fuel records           | Every fuel-related number displayed traces back to a specific telemetry reading or trip aggregate stored in PostgreSQL — nothing is hard-coded or estimated in the UI layer. |

## Priority ordering applied to the build

1. Real-time vehicle location — Dashboard live map.
2. Fuel-level visibility — fuel gauges, fuel trend chart.
3. Automatic alerts — theft/refuel/consumption/overspeed/overweight/idle/deviation/offline detectors.
4. Trip accountability — ignition-based Trip Engine + Logbook.
5. Driver behaviour visibility — Driver Behaviour Indicator + event log.
6. Simple smartphone-friendly management — mobile-first responsive design.
7. Affordable architecture — free/open-source stack, free-tier-friendly hosting.
8. Malawi-specific operational context — real road corridors, MWK currency, Africa/Blantyre time.
