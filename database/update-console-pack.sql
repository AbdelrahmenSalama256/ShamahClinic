-- Console pack (SEO, redirects & 404, brand, promotions, landing pages) for an EXISTING
-- Shamah CMS database. Import in phpMyAdmin (Import tab) on the live database, after
-- deploying the release that contains migrations 016 and 017. Safe to import more than
-- once: nothing is duplicated.
--
-- 1. Does what migrations 016 and 017 do and records them in app_migrations, so that
--    `node scripts/db/server-setup.mjs --apply` later finds nothing left to run.
-- 2. Applies the two role-catalog changes a server cannot run itself (no tsx there, and a
--    migration may not rewrite rows): the SEO role may now open the Redirects screen, and
--    the Editor's list grants include the new "Ad landing pages" list.
--
-- Everything else in the pack (SEO settings, brand profile, homepage order, promotions)
-- lives in the existing `settings` and `seo_entries` tables and needs no change here.
SET NAMES utf8mb4;
START TRANSACTION;

-- 016: the 404 monitor's table.
CREATE TABLE IF NOT EXISTS not_found_log (
  id CHAR(36) PRIMARY KEY,
  path_hash CHAR(64) NOT NULL,
  path VARCHAR(512) NOT NULL,
  referrer VARCHAR(512) NOT NULL DEFAULT '',
  hits INT NOT NULL DEFAULT 1,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY not_found_path (path_hash)
);

-- 017: the list row the console's "Ad landing pages" screen edits.
INSERT IGNORE INTO lists (id, list_key, label, item_schema, reorderable, is_article_collection)
VALUES ('8b2d4f61-7a3c-4e95-b1d0-6c9e2a5f8d47', 'landing', 'Ad landing pages', '{}', 1, 0);

-- Role catalog sync: the SEO role reads redirects (it could already write them).
INSERT INTO role_permissions (id, role_id, resource, action, scope)
SELECT UUID(), r.id, 'redirect', 'read', NULL
FROM roles r
WHERE r.name = 'SEO'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions p WHERE p.role_id = r.id AND p.resource = 'redirect' AND p.action = 'read'
  );

-- Role catalog sync: every list grant that names `results` (the Editor's) also names `landing`.
UPDATE role_permissions
SET scope = JSON_ARRAY_APPEND(scope, '$.lists', 'landing')
WHERE resource = 'list'
  AND JSON_VALID(scope)
  AND JSON_CONTAINS(scope, '"results"', '$.lists')
  AND NOT JSON_CONTAINS(scope, '"landing"', '$.lists');

INSERT IGNORE INTO app_migrations (name, checksum) VALUES
('016_not_found_log.sql', 'ea03f57d5c770b406470d653d7f34853e162c68dfd51d47f9e04d98378dfb122'),
('017_landing_list.sql', '3783f5eee1c98bbf8725494ef9c2a0c82800ae317a9c7f55181af7de2ea41212');

COMMIT;

-- What it left behind.
SHOW TABLES LIKE 'not_found_log';
SELECT list_key, label FROM lists WHERE list_key = 'landing';
SELECT r.name, p.resource, p.action FROM role_permissions p JOIN roles r ON r.id = p.role_id WHERE p.resource = 'redirect' AND p.action = 'read';
SELECT action, scope FROM role_permissions WHERE resource = 'list' AND scope LIKE '%landing%';
