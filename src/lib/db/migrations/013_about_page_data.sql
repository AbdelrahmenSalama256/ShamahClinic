-- About page structured data: one JSON column for the draft, one for the published copy.
-- The column stores the typed fields the About editor writes: hero, story,
-- mission/vision/values, numbers, reasons, team, branches, certifications, CTA.
ALTER TABLE pages ADD COLUMN data JSON NULL AFTER content_en;
ALTER TABLE pages ADD COLUMN pub_data JSON NULL AFTER pub_content_en;
