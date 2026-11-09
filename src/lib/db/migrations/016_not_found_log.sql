-- The 404 monitor: one row per missed address, counted, with the last page that linked to it.
-- Filled by the site's not-found page; read by the console's Redirects screen, which turns a
-- row into a redirect in one click.
CREATE TABLE not_found_log (
  id CHAR(36) PRIMARY KEY,
  path_hash CHAR(64) NOT NULL,
  path VARCHAR(512) NOT NULL,
  referrer VARCHAR(512) NOT NULL DEFAULT '',
  hits INT NOT NULL DEFAULT 1,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE UNIQUE INDEX not_found_path ON not_found_log (path_hash);
