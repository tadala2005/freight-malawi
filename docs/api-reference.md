# API Reference

Base URL: `{API_BASE_URL}/api`. All responses follow:
```json
{ "success": true, "data": ... }
```
or on error:
```json
{ "success": false, "message": "Human readable error", "code": "VALIDATION_ERROR" }
```

Authenticated routes require `Authorization: Bearer <JWT>` (obtained from
login/register). Device routes require `device_id` in the body plus an
`X-Device-Key` header (or `device_key` in the body as a fallback).

## Auth
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /auth/register | — | `{ username, email, password }` → `{ token, user }` |
| POST | /auth/login | — | `{ username, password }` → `{ token, user }` |
| GET | /auth/me | JWT | current user |

## Vehicles
| Method | Path | Notes |
|---|---|---|
| GET | /vehicles | list, each row includes `latest_telemetry` |
| POST | /vehicles | create; `device_id`/`device_key` optional |
| GET | /vehicles/:id | includes `latest_telemetry`, `active_trip`, `behaviour_indicator` |
| PUT | /vehicles/:id | partial update; blank `device_key` keeps the current one |
| DELETE | /vehicles/:id | |
| GET | /vehicles/:id/telemetry | `?from&to&tripId&limit` raw telemetry rows |
| GET | /vehicles/:id/history | `?from&to&tripId&limit` → `{ points: [...] }` map-ready |
| GET | /vehicles/:id/report | `?from&to` aggregate vehicle report |

## Telemetry ingestion
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /telemetry/device | device key | full payload — see `utils/validators.js:validateTelemetry` for required fields |

## Trips
| Method | Path | Notes |
|---|---|---|
| GET | /trips | `?status&vehicleId&from&to&search&limit&offset` |
| GET | /trips/:id | full detail incl. `expenses`, `alerts`, `driver_events`, computed financials |
| POST | /trips/:id/details | save cargo/route/income fields (moves ROUTE_COMPLETED → PENDING_DETAILS) |
| PUT | /trips/:id | same as `/details`, alternate verb |
| POST | /trips/:id/complete | → COMPLETED |
| GET/POST | /trips/:id/expenses | list / add expense |
| GET | /trips/:id/telemetry | raw telemetry for this trip only |

## Expenses
| Method | Path | Notes |
|---|---|---|
| PUT | /expenses/:id | |
| DELETE | /expenses/:id | |

## Alerts
| Method | Path | Notes |
|---|---|---|
| GET | /alerts | `?scope=active|historical|all&category&severity&vehicleId&tripId&acknowledged&from&to&limit` |
| GET | /alerts/badge | `{ count, latest }` — powers the notification bell |
| POST | /alerts/:id/acknowledge | |

## Reports
| Method | Path | Notes |
|---|---|---|
| GET | /reports/fleet | `?from&to` |
| GET | /reports/trips | `?from&to&vehicleId&status` — CSV-export-ready rows |

## Devices
| Method | Path | Notes |
|---|---|---|
| GET | /devices/:id/status | connectivity status + last reading |

## Health
| Method | Path | Notes |
|---|---|---|
| GET | /health | `{ status, database, version, timestamp }` |

## Socket.IO events (dashboard namespace `/`)

Emitted by the server, scoped to the owning user's room:
`telemetry:update`, `vehicle:update`, `alert:new`, `alert:updated`,
`trip:started`, `trip:updated`, `trip:completed`, `notification:update`,
`device:status`.

## Socket.IO events (device namespace `/device`)

Client → server: `telemetry` (same payload shape as the REST endpoint),
with an acknowledgement callback `{ success, message? }`.
