-- Mobile app backend (patients, bookings, favourites, addresses, loyalty) for an EXISTING
-- Shamah CMS database. Import in phpMyAdmin (Import tab) on the live database, after
-- deploying the release that contains migration 018. Safe to import more than once.
--
-- Does what migration 018_mobile_app.sql does and records it in app_migrations, so that
-- `node scripts/db/server-setup.mjs --apply` later finds nothing left to run.
-- If you run server-setup instead, do NOT import this file.
SET NAMES utf8mb4;

-- 018 mobile app: the patients who sign in to the Shamah app, and what they do there.
--
-- These are NOT console users. A patient signs in with a phone number and a password,
-- holds an opaque bearer token (only its SHA-256 is stored), and owns bookings,
-- favourites, saved addresses and a loyalty ledger. Every booking and every
-- "contact us" message also lands in `leads`, so the clinic works them from the
-- console page it already uses.

CREATE TABLE IF NOT EXISTS app_customers (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  first_name VARCHAR(120) NOT NULL DEFAULT '',
  second_name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  image_url VARCHAR(512) NOT NULL DEFAULT '',
  push_token VARCHAR(512) NOT NULL DEFAULT '',
  locale VARCHAR(5) NOT NULL DEFAULT 'ar',
  blocked TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS app_customers_phone ON app_customers (phone);
CREATE UNIQUE INDEX IF NOT EXISTS app_customers_code ON app_customers (code);
CREATE INDEX IF NOT EXISTS app_customers_created ON app_customers (created_at);

CREATE TABLE IF NOT EXISTS app_tokens (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS app_tokens_hash ON app_tokens (token_hash);
CREATE INDEX IF NOT EXISTS app_tokens_customer ON app_tokens (customer_id, revoked_at);

-- status: 1 sent (new), 2 confirmed, 3 rescheduled, 4 visited, 5 unconfirmed / no answer,
-- 6 cancelled by the patient, 7 cancelled by the clinic. The app reads <4 as "sent",
-- 4 as "visited", 5 as "unconfirmed" and anything above as "cancelled".
CREATE TABLE IF NOT EXISTS app_bookings (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  branch_uid VARCHAR(120) NOT NULL,
  service_uid VARCHAR(191) NOT NULL DEFAULT '',
  service_name_ar VARCHAR(255) NOT NULL DEFAULT '',
  service_name_en VARCHAR(255) NOT NULL DEFAULT '',
  start_at DATETIME NOT NULL,
  end_at DATETIME NULL,
  status TINYINT NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NULL,
  clinic_note VARCHAR(1000) NOT NULL DEFAULT '',
  lead_id CHAR(36) NULL,
  points_awarded TINYINT(1) NOT NULL DEFAULT 0,
  cancelled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS app_bookings_code ON app_bookings (code);
CREATE INDEX IF NOT EXISTS app_bookings_customer ON app_bookings (customer_id, start_at);
CREATE INDEX IF NOT EXISTS app_bookings_day ON app_bookings (start_at, status);

CREATE TABLE IF NOT EXISTS app_favourites (
  customer_id CHAR(36) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS app_addresses (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  client_name VARCHAR(255) NOT NULL DEFAULT '',
  street_name VARCHAR(255) NOT NULL DEFAULT '',
  building_number VARCHAR(64) NOT NULL DEFAULT '',
  floor VARCHAR(32) NOT NULL DEFAULT '',
  apartment_number VARCHAR(32) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  extra_info VARCHAR(1000) NOT NULL DEFAULT '',
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  fav TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL
);
CREATE INDEX IF NOT EXISTS app_addresses_customer ON app_addresses (customer_id, deleted_at);

-- type: 0 earned, 1 spent. cat: 1 booking visit, 2 sign-up bonus, 3 manual (console).
CREATE TABLE IF NOT EXISTS app_loyalty (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  type TINYINT NOT NULL DEFAULT 0,
  cat TINYINT NOT NULL DEFAULT 3,
  points INT NOT NULL,
  amount_spent DECIMAL(12,2) NULL,
  booking_id CHAR(36) NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS app_loyalty_customer ON app_loyalty (customer_id, created_at);

INSERT IGNORE INTO app_migrations (name, checksum)
VALUES ('018_mobile_app.sql', '833d6031f39701527b6b5568b477ea9f37972cf589dd6fa13baaa3f9811635c2');
