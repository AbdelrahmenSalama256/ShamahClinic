-- 007 console views: the filters a person saves for themselves.
--
-- A saved view is a name pasted onto a query string, not a set of columns: the console
-- stores exactly the terms `src/lib/content/list-view.ts` puts in the address bar, so a
-- saved filter and a link shared with a colleague are the same object and re-reading one
-- cannot disagree with the screen it came from.
--
-- `query` holds the whole line, scope terms included (`list=`, `trash=`, `locale=`),
-- because those decide which rows the view was ever run over. Rows belong to one user
-- and every read filters on `user_id`; there is no shared view that could leak a list
-- its owner cannot open. No foreign key, in line with the other tables — the console
-- deletes a person's views when it disables them, and the import order stays free.

CREATE TABLE console_views (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  name VARCHAR(80) NOT NULL,
  query VARCHAR(512) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX console_views_name ON console_views (user_id, kind, name);
CREATE INDEX console_views_owner ON console_views (user_id, kind, position);
