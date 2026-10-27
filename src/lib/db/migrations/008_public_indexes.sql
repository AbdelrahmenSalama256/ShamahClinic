-- The public read path filters every list by its publish state and then orders it:
-- articles newest-first by published_at, offers and list items by position, pages by
-- route, categories by position. Before this each read ended in a filesort (articles
-- already had an index on status alone, which covered the filter but not the order).
--
-- Additive only: no existing index is dropped, so a console query that already had a
-- plan keeps it. The leading columns match the WHERE clause in that order — status,
-- then deleted_at — because the site always asks for both.
CREATE INDEX articles_public ON articles (status, deleted_at, published_at, slug);
CREATE INDEX offers_public ON offers (status, deleted_at, position, slug);
CREATE INDEX pages_public ON pages (status, deleted_at, route);
CREATE INDEX list_items_public ON list_items (list_id, status, deleted_at, position, uid);
CREATE INDEX categories_public ON categories (deleted_at, enabled, position);
