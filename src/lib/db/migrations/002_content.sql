-- 002 content: everything the site renders that a person can change.
--
-- Column convention, used across every editable table:
--   <name>_ar / <name>_en      the DRAFT an editor is writing
--   pub_<name>_ar / pub_<name>_en  the PUBLISHED copy the public site reads
-- Publishing copies the draft pair into the pub_ pair inside one transaction and
-- writes a revision. A never-published edit therefore cannot reach a visitor.

CREATE TABLE categories (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  name_ar VARCHAR(255) NOT NULL DEFAULT '',
  name_en VARCHAR(255) NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX categories_slug ON categories (slug);

CREATE TABLE articles (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  title_ar VARCHAR(500) NOT NULL DEFAULT '',
  title_en VARCHAR(500) NOT NULL DEFAULT '',
  excerpt_ar VARCHAR(1000) NOT NULL DEFAULT '',
  excerpt_en VARCHAR(1000) NOT NULL DEFAULT '',
  content_ar MEDIUMTEXT NULL,
  content_en MEDIUMTEXT NULL,
  pub_title_ar VARCHAR(500) NOT NULL DEFAULT '',
  pub_title_en VARCHAR(500) NOT NULL DEFAULT '',
  pub_excerpt_ar VARCHAR(1000) NOT NULL DEFAULT '',
  pub_excerpt_en VARCHAR(1000) NOT NULL DEFAULT '',
  pub_content_ar MEDIUMTEXT NULL,
  pub_content_en MEDIUMTEXT NULL,
  category_id CHAR(36) NULL,
  image VARCHAR(512) NULL,
  image_alt_ar VARCHAR(500) NOT NULL DEFAULT '',
  image_alt_en VARCHAR(500) NOT NULL DEFAULT '',
  published_at DATETIME(3) NULL,
  scheduled_at DATETIME(3) NULL,
  legacy_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX articles_slug ON articles (slug);
CREATE INDEX articles_status ON articles (status, deleted_at);
CREATE INDEX articles_legacy ON articles (legacy_id);

CREATE TABLE offers (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  name_ar VARCHAR(500) NOT NULL DEFAULT '',
  name_en VARCHAR(500) NOT NULL DEFAULT '',
  excerpt_ar VARCHAR(1000) NOT NULL DEFAULT '',
  excerpt_en VARCHAR(1000) NOT NULL DEFAULT '',
  body_ar MEDIUMTEXT NULL,
  body_en MEDIUMTEXT NULL,
  pub_name_ar VARCHAR(500) NOT NULL DEFAULT '',
  pub_name_en VARCHAR(500) NOT NULL DEFAULT '',
  pub_excerpt_ar VARCHAR(1000) NOT NULL DEFAULT '',
  pub_excerpt_en VARCHAR(1000) NOT NULL DEFAULT '',
  pub_body_ar MEDIUMTEXT NULL,
  pub_body_en MEDIUMTEXT NULL,
  price DECIMAL(12,2) NULL,
  regular_price DECIMAL(12,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  on_sale TINYINT(1) NOT NULL DEFAULT 0,
  images JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  legacy_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX offers_slug ON offers (slug);
CREATE INDEX offers_enabled ON offers (enabled, position);

CREATE TABLE pages (
  id CHAR(36) PRIMARY KEY,
  route VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  title_ar VARCHAR(500) NOT NULL DEFAULT '',
  title_en VARCHAR(500) NOT NULL DEFAULT '',
  content_ar MEDIUMTEXT NULL,
  content_en MEDIUMTEXT NULL,
  pub_title_ar VARCHAR(500) NOT NULL DEFAULT '',
  pub_title_en VARCHAR(500) NOT NULL DEFAULT '',
  pub_content_ar MEDIUMTEXT NULL,
  pub_content_en MEDIUMTEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  redirect_to VARCHAR(512) NULL,
  published_at DATETIME(3) NULL,
  legacy_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX pages_route ON pages (route);

-- A single translatable string the site renders (headings, paragraphs, button text).
CREATE TABLE content_fields (
  id CHAR(36) PRIMARY KEY,
  field_key VARCHAR(191) NOT NULL,
  label VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(32) NOT NULL DEFAULT 'text',
  route VARCHAR(191) NOT NULL DEFAULT '',
  section_id VARCHAR(120) NOT NULL DEFAULT '',
  default_ar TEXT NULL,
  default_en TEXT NULL,
  draft_ar TEXT NULL,
  draft_en TEXT NULL,
  pub_ar TEXT NULL,
  pub_en TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  source_file VARCHAR(255) NULL,
  source_line INT NULL,
  orphaned_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX content_fields_key ON content_fields (field_key);
CREATE INDEX content_fields_route ON content_fields (route, section_id);

-- Repeatable content: doctors, branches, FAQs, treatments, nav links, result cases.
CREATE TABLE lists (
  id CHAR(36) PRIMARY KEY,
  list_key VARCHAR(120) NOT NULL,
  label VARCHAR(255) NOT NULL DEFAULT '',
  item_schema JSON NOT NULL,
  reorderable TINYINT(1) NOT NULL DEFAULT 1,
  is_article_collection TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX lists_key ON lists (list_key);

-- An item's data holds the whole authored shape, bilingual included:
--   {"name":{"ar":"…","en":"…"},"phone":"…","specialties":{"ar":[],"en":[]}}
-- so the console renders a form from item_schema and the site gets back exactly
-- the object type it used when the list lived in a .ts file.
CREATE TABLE list_items (
  id CHAR(36) PRIMARY KEY,
  list_id CHAR(36) NOT NULL,
  uid VARCHAR(120) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  draft JSON NOT NULL,
  published JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  published_at DATETIME(3) NULL,
  legacy_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX list_items_uid ON list_items (list_id, uid);
CREATE INDEX list_items_order ON list_items (list_id, position);

CREATE TABLE section_state (
  id CHAR(36) PRIMARY KEY,
  route VARCHAR(191) NOT NULL,
  section_id VARCHAR(120) NOT NULL,
  label VARCHAR(255) NOT NULL DEFAULT '',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  variant VARCHAR(64) NULL,
  animation JSON NULL,
  publish_at DATETIME(3) NULL,
  unpublish_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX section_state_key ON section_state (route, section_id);

CREATE TABLE media_folders (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  parent_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
CREATE INDEX media_folders_parent ON media_folders (parent_id);

CREATE TABLE media (
  id CHAR(36) PRIMARY KEY,
  path VARCHAR(512) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL DEFAULT '',
  width INT NOT NULL DEFAULT 0,
  height INT NOT NULL DEFAULT 0,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL DEFAULT '',
  alt_ar VARCHAR(500) NOT NULL DEFAULT '',
  alt_en VARCHAR(500) NOT NULL DEFAULT '',
  folder_id CHAR(36) NULL,
  legacy_url VARCHAR(600) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX media_path ON media (path);
CREATE INDEX media_sha ON media (sha256);
