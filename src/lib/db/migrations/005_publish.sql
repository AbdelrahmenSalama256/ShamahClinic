-- 005 publishing: revisions, whole-site snapshots, settings, theme, audit trail.

-- Every saved change to an editable row, so a bad edit is recoverable and
-- nothing is ever truly deleted.
CREATE TABLE revisions (
  id CHAR(36) PRIMARY KEY,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(191) NOT NULL,
  revision INT NOT NULL,
  snapshot JSON NOT NULL,
  author_id CHAR(36) NULL,
  author_email VARCHAR(255) NOT NULL DEFAULT '',
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE UNIQUE INDEX revisions_unique ON revisions (entity_type, entity_id, revision);
CREATE INDEX revisions_entity ON revisions (entity_type, entity_id);

-- A publish point for the whole site. Rollback reads one of these and rewrites
-- the published columns; the row itself is never deleted.
CREATE TABLE snapshots (
  id CHAR(36) PRIMARY KEY,
  label VARCHAR(255) NOT NULL DEFAULT '',
  kind VARCHAR(32) NOT NULL DEFAULT 'publish',
  payload LONGBLOB NOT NULL,
  payload_bytes INT NOT NULL DEFAULT 0,
  entity_count INT NOT NULL DEFAULT 0,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL
);
CREATE INDEX snapshots_current ON snapshots (is_current, created_at);

CREATE TABLE settings (
  group_name VARCHAR(64) NOT NULL,
  setting_key VARCHAR(120) NOT NULL,
  value JSON NOT NULL,
  default_value JSON NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (group_name, setting_key)
);

CREATE TABLE theme_tokens (
  token VARCHAR(64) PRIMARY KEY,
  label VARCHAR(191) NOT NULL DEFAULT '',
  group_name VARCHAR(64) NOT NULL DEFAULT 'color',
  light_value VARCHAR(255) NOT NULL DEFAULT '',
  dark_value VARCHAR(255) NOT NULL DEFAULT '',
  source_value VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1
);

-- One enforcement path means one place to write the trail: every action that
-- changes state lands here with what it looked like before and after.
CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) NULL,
  actor_email VARCHAR(255) NOT NULL DEFAULT '',
  actor_kind VARCHAR(16) NOT NULL DEFAULT 'user',
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL DEFAULT '',
  entity_id VARCHAR(191) NOT NULL DEFAULT '',
  before_json JSON NULL,
  after_json JSON NULL,
  ip_hash CHAR(64) NOT NULL DEFAULT '',
  request_id VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX audit_actor ON audit_log (actor_id, created_at);
CREATE INDEX audit_entity ON audit_log (entity_type, entity_id, created_at);
CREATE INDEX audit_time ON audit_log (created_at);
