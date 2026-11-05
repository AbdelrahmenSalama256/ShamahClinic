-- 004 leads: what the contact form produces, its pipeline, and the outbound retry queue.
-- Today nothing persists: /api/v1/lead composes a WhatsApp message and forgets it.

CREATE TABLE leads (
  id CHAR(36) PRIMARY KEY,
  source VARCHAR(64) NOT NULL DEFAULT 'contact-form',
  form_id VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  message TEXT NULL,
  fields JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  assignee_id CHAR(36) NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'ar',
  page_path VARCHAR(512) NOT NULL DEFAULT '',
  referrer VARCHAR(512) NOT NULL DEFAULT '',
  utm JSON NULL,
  idempotency_key VARCHAR(120) NOT NULL DEFAULT '',
  sheets_sent_at DATETIME(3) NULL,
  spam TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX leads_idempotency ON leads (idempotency_key);
CREATE INDEX leads_status ON leads (status, created_at);
CREATE INDEX leads_created ON leads (created_at);

CREATE TABLE lead_notes (
  id CHAR(36) PRIMARY KEY,
  lead_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX lead_notes_lead ON lead_notes (lead_id, created_at);

CREATE TABLE integrations (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL DEFAULT '',
  config JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  schema_hash CHAR(64) NOT NULL DEFAULT '',
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE INDEX integrations_kind ON integrations (kind);

-- Anything the console promises to deliver somewhere else (a Sheet, a webhook)
-- goes through here so a failing endpoint never loses a lead.
CREATE TABLE outbox (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
CREATE INDEX outbox_due ON outbox (sent_at, next_attempt_at);

CREATE TABLE notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL DEFAULT '',
  body VARCHAR(2000) NOT NULL DEFAULT '',
  entity_type VARCHAR(32) NULL,
  entity_id VARCHAR(191) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX notifications_user ON notifications (user_id, read_at);

CREATE TABLE jobs (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
CREATE INDEX jobs_due ON jobs (status, run_at);
