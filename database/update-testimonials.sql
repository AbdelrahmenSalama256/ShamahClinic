-- Patient testimonials (WhatsApp & video) for an EXISTING Shamah CMS database.
-- Import in phpMyAdmin (Import tab) on the live database, after deploying the release that
-- contains migration 015. Safe to import more than once: nothing is duplicated.
--
-- 1. Does what migration 015 does and records it in app_migrations, so that
--    `node scripts/db/server-setup.mjs --apply` later finds nothing left to run.
-- 2. Gives the Editor role the new list. The role catalog (`syncRoles()`, run by
--    `npm run db:seed`) does this on a developer machine; a server has no tsx to run it, and a
--    migration may not rewrite rows, so this file is where the server gets it.
SET NAMES utf8mb4;
START TRANSACTION;

-- 015: the list row the console's "Patient testimonials" screen edits.
INSERT IGNORE INTO lists (id, list_key, label, item_schema, reorderable, is_article_collection)
VALUES ('5f0c7e9a-3b1d-4c62-9a8e-2d4b6f1a7c30', 'testimonials', 'Patient testimonials', '{}', 1, 0);

-- Role catalog sync: every list grant that names `results` (the Editor's) also names `testimonials`.
UPDATE role_permissions
SET scope = JSON_ARRAY_APPEND(scope, '$.lists', 'testimonials')
WHERE resource = 'list'
  AND JSON_VALID(scope)
  AND JSON_CONTAINS(scope, '"results"', '$.lists')
  AND NOT JSON_CONTAINS(scope, '"testimonials"', '$.lists');

INSERT IGNORE INTO app_migrations (name, checksum) VALUES
('015_testimonials_list.sql', '95d80998db303fa73b6edd427dc065b9751da4307b9241738aeecfa67614c233');

COMMIT;

-- What it left behind: one row, and the Editor's grants with testimonials in them.
SELECT list_key, label FROM lists WHERE list_key = 'testimonials';
SELECT action, scope FROM role_permissions WHERE resource = 'list' AND scope LIKE '%testimonials%';
