USE freight_malawi;

CREATE TABLE trips (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL,
  vehicle_id          INT UNSIGNED NOT NULL,
  trip_number         VARCHAR(40) NOT NULL,
  status              ENUM('PENDING_LOG','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING_LOG',
  driver_name         VARCHAR(80) NULL,
  origin              VARCHAR(120) NULL,
  destination         VARCHAR(120) NULL,
  cargo_type          VARCHAR(80) NULL,
  cargo_description   VARCHAR(255) NULL,
  cargo_weight_kg     DECIMAL(10,2) NULL,
  planned_distance_km DECIMAL(10,2) NULL,
  agreed_payment      DECIMAL(14,2) NULL,
  fuel_price_per_litre DECIMAL(10,2) NULL,
  started_at          DATETIME(3) NOT NULL,
  completed_at        DATETIME(3) NULL,
  starting_latitude   DECIMAL(10,7) NULL,
  starting_longitude  DECIMAL(10,7) NULL,
  ending_latitude     DECIMAL(10,7) NULL,
  ending_longitude    DECIMAL(10,7) NULL,
  actual_distance_km  DECIMAL(10,2) NULL,
  fuel_start_litres   DECIMAL(10,2) NULL,
  fuel_end_litres     DECIMAL(10,2) NULL,
  fuel_consumed_litres DECIMAL(10,2) NULL,
  route_completed     TINYINT(1) NOT NULL DEFAULT 0,
  notes               TEXT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trips_number (trip_number),
  KEY idx_trips_user_status (user_id, status),
  KEY idx_trips_vehicle_status (vehicle_id, status),
  KEY idx_trips_started (started_at),
  CONSTRAINT fk_trips_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trip_expenses (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id           INT UNSIGNED NOT NULL,
  expense_category  ENUM('FUEL','TOLL','DRIVER_ALLOWANCE','LOADING','UNLOADING','MAINTENANCE','REPAIR','ACCOMMODATION','FOOD','OTHER') NOT NULL,
  description       VARCHAR(255) NULL,
  amount            DECIMAL(14,2) NOT NULL,
  recorded_at       DATETIME(3) NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_trip_expenses_trip (trip_id),
  CONSTRAINT fk_trip_expenses_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE alerts
  ADD COLUMN trip_id INT UNSIGNED NULL AFTER vehicle_id,
  ADD COLUMN category ENUM('FUEL','SAFETY','TRIP_OPERATIONS','LOAD','VEHICLE_HEALTH','SECURITY') NOT NULL DEFAULT 'TRIP_OPERATIONS' AFTER alert_type,
  ADD KEY idx_alerts_trip (trip_id),
  ADD CONSTRAINT fk_alerts_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

ALTER TABLE alerts
  MODIFY alert_type ENUM(
    'THEFT_SUSPECTED','ABNORMAL_CONSUMPTION','REFUEL','ENGINE_START','OVERSPEEDING',
    'OVERWEIGHT','ROUTE_COMPLETED','POWER_LOSS','GEOFENCE_EXIT'
  ) NOT NULL;

UPDATE alerts
SET category = CASE alert_type
  WHEN 'THEFT_SUSPECTED' THEN 'SECURITY'
  WHEN 'ABNORMAL_CONSUMPTION' THEN 'FUEL'
  WHEN 'REFUEL' THEN 'FUEL'
  WHEN 'ENGINE_START' THEN 'TRIP_OPERATIONS'
  WHEN 'ROUTE_COMPLETED' THEN 'TRIP_OPERATIONS'
  WHEN 'OVERSPEEDING' THEN 'SAFETY'
  WHEN 'OVERWEIGHT' THEN 'LOAD'
  WHEN 'POWER_LOSS' THEN 'VEHICLE_HEALTH'
  WHEN 'GEOFENCE_EXIT' THEN 'SECURITY'
  ELSE 'TRIP_OPERATIONS'
END;
