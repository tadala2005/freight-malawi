-- ============================================================
-- FREIGHT MALAWI PLATFORM — DATABASE SCHEMA
-- Prototype IoT-Based Fuel Management System for Transport
-- Companies in Malawi (MUBAS Final Year Project)
-- ============================================================
-- Import this file directly into phpMyAdmin (XAMPP) or run:
--   mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS freight_malawi
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE freight_malawi;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- vehicles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL,
  name                VARCHAR(80)  NOT NULL,
  license_plate       VARCHAR(20)  NOT NULL,
  driver_name         VARCHAR(80)  NOT NULL,
  fuel_tank_capacity  DECIMAL(8,2) NOT NULL,
  device_id           VARCHAR(60)  NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vehicles_device_id (device_id),
  KEY idx_vehicles_user_id (user_id),
  CONSTRAINT fk_vehicles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- telemetry
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id          INT UNSIGNED NOT NULL,
  latitude            DECIMAL(10,7) NOT NULL,
  longitude           DECIMAL(10,7) NOT NULL,
  speed               DECIMAL(6,2)  NOT NULL DEFAULT 0,
  heading             DECIMAL(6,2)  NOT NULL DEFAULT 0,
  fuel_level_litres   DECIMAL(8,2)  NOT NULL,
  fuel_percent        DECIMAL(5,2)  NOT NULL,
  recorded_at         DATETIME(3)   NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_telemetry_vehicle_time (vehicle_id, recorded_at),
  CONSTRAINT fk_telemetry_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- alerts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id    INT UNSIGNED NOT NULL,
  alert_type    ENUM('THEFT_SUSPECTED','ABNORMAL_CONSUMPTION','REFUEL','POWER_LOSS','GEOFENCE_EXIT') NOT NULL,
  severity      ENUM('LOW','MEDIUM','HIGH') NOT NULL,
  message       VARCHAR(255) NOT NULL,
  acknowledged  TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_alerts_vehicle (vehicle_id),
  KEY idx_alerts_acknowledged (acknowledged),
  CONSTRAINT fk_alerts_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE freight_malawi;

ALTER TABLE alerts
  MODIFY alert_type ENUM(
    'THEFT_SUSPECTED',
    'ABNORMAL_CONSUMPTION',
    'REFUEL',
    'ENGINE_START',
    'OVERSPEEDING',
    'OVERWEIGHT',
    'ROUTE_COMPLETED',
    'POWER_LOSS',
    'GEOFENCE_EXIT'
  ) NOT NULL;