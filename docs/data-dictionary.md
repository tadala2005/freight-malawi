# Data Dictionary

Full field reference for `schema.sql`. All tables use InnoDB / utf8mb4.

## `users`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| username | VARCHAR(50) UNIQUE | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt, never plaintext |
| created_at / updated_at | TIMESTAMP | |

## `vehicles`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK → users | ownership root |
| name, license_plate, driver_name | VARCHAR | |
| fuel_tank_capacity | DECIMAL(8,2) | litres |
| device_id | VARCHAR(64) UNIQUE | IoT device identifier |
| device_key_hash | VARCHAR(255) | bcrypt hash of the device's shared secret |
| payload_capacity_kg | DECIMAL(10,2) | used by the overweight detector |
| overspeed_threshold_kmh | DECIMAL(5,2) | per-vehicle, configurable |
| idle_threshold_minutes | INT | per-vehicle, configurable |
| route_key | VARCHAR(50) | assigned corridor key (see `routeService.js`) |
| current_status | ENUM | MOVING / IDLE / STOPPED / OFFLINE — derived from telemetry, never hard-coded |
| last_seen_at | TIMESTAMP | drives the device-offline sweep |

## `trips`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id, vehicle_id | INT FK | |
| status | ENUM | ACTIVE / PENDING_DETAILS / ROUTE_COMPLETED / COMPLETED / CANCELLED |
| origin, destination, route_name | VARCHAR | pre-filled from the assigned route, editable by the user |
| cargo_type, cargo_description, cargo_weight_kg | | user-entered trip details |
| distance_km | DECIMAL | user-entered (with odometer delta as a natural cross-check) |
| transporter_income, fuel_cost | DECIMAL | financial inputs |
| fuel_used_litres | DECIMAL | accumulated automatically from telemetry fuel drops |
| start_fuel_litres, start_odometer_km, end_odometer_km | DECIMAL | captured/updated by the pipeline |
| idle_seconds, max_speed_kmh | | accumulated automatically |
| started_at, ignition_started_at, ignition_ended_at, route_completed_at, completed_at | TIMESTAMP | trip lifecycle timestamps |

## `telemetry`
| Field | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| telemetry_uuid | VARCHAR(64) UNIQUE | idempotency key |
| vehicle_id, trip_id | FK | trip_id nullable (telemetry can exist with ignition off / no trip) |
| latitude, longitude | DECIMAL(9,6) | validated -90..90 / -180..180 |
| speed | DECIMAL(6,2) | km/h, validated ≥0 |
| heading | DECIMAL(5,1) | degrees, 0-360 |
| fuel_level_litres, fuel_percent | DECIMAL | validated ≥0 and 0-100 respectively |
| odometer_km, engine_hours | DECIMAL | |
| ignition_on | TINYINT(1) | |
| cargo_weight_kg | DECIMAL | validated ≥0 |
| gps_valid | TINYINT(1) | false when the device had no GPS fix |
| recorded_at | TIMESTAMP | device/simulator-supplied reading time |

Indexed on `(vehicle_id, recorded_at)` for history queries and `(trip_id)`
for trip-scoped queries.

## `trip_expenses`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| trip_id | FK | |
| category | ENUM | Fuel/Toll/Food/Accommodation/Maintenance/Loading/Offloading/Driver Allowance/Parking/Other |
| description | VARCHAR | optional |
| amount | DECIMAL(12,2) | validated > 0 |
| expense_date | DATE | |

## `alerts`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id, vehicle_id | FK | |
| trip_id | FK, nullable | alerts can exist outside a trip (e.g. device offline) |
| category | ENUM | FUEL/DRIVER/SAFETY/LOAD/ROUTE/TRIP/SYSTEM |
| type | VARCHAR(50) | e.g. THEFT_SUSPECTED, OVERSPEEDING (see `utils/alertTypes.js`) |
| severity | ENUM | LOW/MEDIUM/HIGH/CRITICAL |
| message | TEXT | human-readable |
| meta | JSON | detector-specific structured detail |
| acknowledged, acknowledged_at | | drives the active-notification-badge logic |

## `driver_events`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| vehicle_id, trip_id | FK | |
| event_type | VARCHAR(50) | OVERSPEEDING/HARSH_DRIVING/AGGRESSIVE_DRIVING/EXCESSIVE_IDLE/ROUTE_DEVIATION |
| severity, speed_kmh, details | | feeds the Driver Behaviour Indicator (`alertModel.driverBehaviourScoreForVehicle`) |

## `device_actions`
| Field | Type | Notes |
|---|---|---|
| id | INT PK | |
| vehicle_id | FK | |
| action | VARCHAR(50) | e.g. RECONNECTED |
| details | JSON | |

This is an audit trail of device connectivity events, separate from the
user-facing `alerts` table.
