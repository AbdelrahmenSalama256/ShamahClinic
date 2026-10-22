-- 003 SEO: per-entity per-locale metadata, redirects, CTAs and their follow-up actions.

CREATE TABLE seo_entries (
  id CHAR(36) PRIMARY KEY,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(191) NOT NULL DEFAULT '',
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(500) NOT NULL DEFAULT '',
  description VARCHAR(1000) NOT NULL DEFAULT '',
  canonical VARCHAR(512) NULL,
  robots VARCHAR(120) NULL,
  og_title VARCHAR(500) NULL,
  og_description VARCHAR(1000) NULL,
  og_image VARCHAR(512) NULL,
  twitter_card VARCHAR(32) NULL,
  hreflang JSON NULL,
  jsonld JSON NULL,
  head_tags JSON NULL,
  draft TINYINT(1) NOT NULL DEFAULT 1,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX seo_entry_key ON seo_entries (entity_type, entity_id, locale);

CREATE TABLE redirects (
  id CHAR(36) PRIMARY KEY,
  source_path VARCHAR(512) NOT NULL,
  target_path VARCHAR(512) NOT NULL,
  status_code INT NOT NULL DEFAULT 301,
  match_type VARCHAR(16) NOT NULL DEFAULT 'exact',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  hits INT NOT NULL DEFAULT 0,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX redirects_source ON redirects (source_path);

CREATE TABLE ctas (
  id CHAR(36) PRIMARY KEY,
  cta_key VARCHAR(120) NOT NULL,
  label_ar VARCHAR(255) NOT NULL DEFAULT '',
  label_en VARCHAR(255) NOT NULL DEFAULT '',
  placement VARCHAR(191) NOT NULL DEFAULT '',
  cta_type VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  target VARCHAR(600) NOT NULL DEFAULT '',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ctas_key ON ctas (cta_key);

CREATE TABLE cta_actions (
  id CHAR(36) PRIMARY KEY,
  cta_id CHAR(36) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  action_type VARCHAR(32) NOT NULL,
  config JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
CREATE INDEX cta_actions_cta ON cta_actions (cta_id, position);
