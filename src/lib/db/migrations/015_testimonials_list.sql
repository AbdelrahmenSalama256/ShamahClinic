-- Patient testimonials: WhatsApp conversations (texts + voice notes) and short videos.
-- `syncLists()` creates the row on `npm run db:seed`; this keeps a server that only runs
-- migrations from missing the list. INSERT IGNORE leaves an existing row untouched.
INSERT IGNORE INTO lists (id, list_key, label, item_schema, reorderable, is_article_collection)
VALUES (UUID(), 'testimonials', 'Patient testimonials', '{}', 1, 0);
