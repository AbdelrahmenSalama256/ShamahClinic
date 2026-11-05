-- 006 statistics: first-party, no third-party script, no raw IP.
-- The clinic currently learns nothing about its own traffic — WordPress used to.
--
-- Privacy model: a visitor is a salted hash that rotates daily (visitor_hash), the
-- IP is only ever stored hashed, referrer keeps the host and not the full URL, and
-- a request whose UA matches the bot list is recorded with bot=1 and then ignored
-- by every aggregate. Requests sending Sec-GPC or DNT are still counted as views
-- but never get a visitor hash, so they cannot be distinguished from other traffic
-- on later days.

CREATE TABLE stats_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  day DATE NOT NULL,
  event_type VARCHAR(24) NOT NULL DEFAULT 'pageview',
  path VARCHAR(512) NOT NULL,
  locale VARCHAR(5) NOT NULL DEFAULT '',
  referrer_host VARCHAR(191) NOT NULL DEFAULT '',
  device VARCHAR(16) NOT NULL DEFAULT 'unknown',
  cta_key VARCHAR(120) NOT NULL DEFAULT '',
  visitor_hash CHAR(64) NULL,
  bot TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX stats_day_path (day, path),
  INDEX stats_day_type (day, event_type),
  INDEX stats_created (created_at)
);

CREATE TABLE stats_daily (
  day DATE NOT NULL,
  path VARCHAR(512) NOT NULL,
  locale VARCHAR(5) NOT NULL DEFAULT '',
  views BIGINT NOT NULL DEFAULT 0,
  visitors BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, locale)
);
CREATE INDEX stats_daily_day ON stats_daily (day);

CREATE TABLE stats_referrers_daily (
  day DATE NOT NULL,
  host VARCHAR(191) NOT NULL,
  views BIGINT NOT NULL DEFAULT 0,
  visitors BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, host)
);

CREATE TABLE stats_cta_daily (
  day DATE NOT NULL,
  cta_key VARCHAR(120) NOT NULL,
  clicks BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY stats_cta_key (day, cta_key)
);

-- Where the rollup got to, so a re-run never double-counts.
CREATE TABLE stats_rollup_state (
  id INT PRIMARY KEY,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  last_run_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
INSERT INTO stats_rollup_state (id, last_event_id) VALUES (1, 0);
