-- ============================================================================
-- READ-ONLY AUDIT — which published Arabic field is not written in Arabic?
--
-- What it answers, for every row a visitor can actually reach:
--   * `latin-only`   — the Arabic column holds Latin letters and almost no Arabic.
--                     This is what the WordPress import left behind, and what the
--                     site can no longer tell apart from a real Arabic sentence.
--   * `empty-with-english` — the Arabic column is blank while the English one is
--                     full. This is the case the new Settings switch governs
--                     ("Text in the other language"), so the owner can see how many
--                     fields that one switch would touch before ticking it.
--   * `artifact`     — the stored value ends in the literal `[…]` the WordPress
--                     teaser shortcode baked into the text. The site strips it on
--                     the way out; this lists the rows that still hold it.
--   * `mixed`        — both scripts survive in the field. A French product name in an
--                     Arabic sentence is here on purpose: it is translated, and the
--                     rule only calls a field Latin when no Arabic outweighs it.
--
-- It only SELECTs. Nothing in this file writes, and it needs no extra table.
--
-- Run: phpMyAdmin > the newshamah database > SQL tab > paste the whole file > Go.
-- Two result sets: the counts first, then the rows behind them.
--
-- Needs MariaDB 10.2 or newer (REGEXP_REPLACE) and the connection's utf8mb4 that
-- phpMyAdmin already uses. The rule is the one the code applies — see
-- `isMostlyLatin()` in src/lib/text-script.ts:
--     Arabic letters = CHAR_LENGTH(REGEXP_REPLACE(x, '[^؀-ۿ]', ''))
--     Latin  letters = CHAR_LENGTH(REGEXP_REPLACE(x, '[^A-Za-z]', ''))
--     latin-only     when Latin > 0 AND (Arabic = 0 OR Latin > Arabic * 3)
-- Two deliberate differences from the code: the Arabic class is the U+0600–U+06FF
-- block, so the rarer Extended-A and presentation-form ranges count as neither
-- script (they cannot make a real Arabic row look Latin, only the reverse, and the
-- rows below are all ordinary Arabic), and the two body fields are measured on
-- their VISIBLE text: `<div class="wpb_wrapper">` is markup, not English prose, so
-- tags and `&…;` entities are stripped before counting.
--
-- The value compared is the one the site renders: the `pub_*` twin when the kind has
-- one, and only rows that are published (or published with unsaved edits) and not in
-- the Trash — the same filter src/lib/content/published.ts applies.
-- ============================================================================

-- 1. How many rows per table and field, by verdict.
SELECT
  s.kind,
  s.field,
  s.verdict,
  COUNT(*) AS rows_with_this_verdict,
  SUM(s.artifact) AS also_ends_with_ellipsis
FROM (
  SELECT
    live.kind,
    live.`key`,
    live.field,
    CASE
      WHEN TRIM(live.ar) = '' THEN (CASE WHEN TRIM(live.en) = '' THEN 'empty-both' ELSE 'empty-with-english' END)
      WHEN CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^A-Za-z]', '')) = 0 THEN 'arabic'
      WHEN CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^؀-ۿ]', '')) = 0
        OR CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^A-Za-z]', '')) > CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^؀-ۿ]', '')) * 3
        THEN 'latin-only'
      ELSE 'mixed'
    END AS verdict,
    (TRIM(live.ar) LIKE CONCAT('%', '[…]')
      OR TRIM(live.ar) LIKE CONCAT('%', '[...]')
      OR TRIM(live.ar) LIKE CONCAT('%', '[&hellip;]')) AS artifact
  FROM (
    SELECT 'article' AS kind, slug AS `key`, 'title' AS field, COALESCE(pub_title_ar, '') AS ar, COALESCE(pub_title_en, '') AS en
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'excerpt', COALESCE(pub_excerpt_ar, ''), COALESCE(pub_excerpt_en, '')
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'content',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'image alt', COALESCE(image_alt_ar, ''), COALESCE(image_alt_en, '')
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'name', COALESCE(pub_name_ar, ''), COALESCE(pub_name_en, '')
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'excerpt', COALESCE(pub_excerpt_ar, ''), COALESCE(pub_excerpt_en, '')
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'body',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_body_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_body_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'page', route, 'title', COALESCE(pub_title_ar, ''), COALESCE(pub_title_en, '')
      FROM pages WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'page', route, 'content',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM pages WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  ) live
) s
GROUP BY s.kind, s.field, s.verdict
ORDER BY s.kind, s.field, s.verdict;

-- 2. The rows themselves. `ar_preview` is what a visitor reads on the Arabic page,
--    cut to 90 characters; `en_preview` is what the same row holds in English.
--    `latin-only` and `empty-with-english` are listed; `arabic` and `mixed` are not.
SELECT
  s.kind,
  s.`key`,
  s.field,
  s.verdict,
  s.ar_letters,
  s.latin_letters,
  s.artifact,
  LEFT(s.ar, 90) AS ar_preview,
  LEFT(s.en, 90) AS en_preview
FROM (
  SELECT
    live.kind,
    live.`key`,
    live.field,
    live.ar,
    live.en,
    CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^؀-ۿ]', '')) AS ar_letters,
    CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^A-Za-z]', '')) AS latin_letters,
    CASE
      WHEN TRIM(live.ar) = '' THEN (CASE WHEN TRIM(live.en) = '' THEN 'empty-both' ELSE 'empty-with-english' END)
      WHEN CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^A-Za-z]', '')) = 0 THEN 'arabic'
      WHEN CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^؀-ۿ]', '')) = 0
        OR CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^A-Za-z]', '')) > CHAR_LENGTH(REGEXP_REPLACE(live.ar, '[^؀-ۿ]', '')) * 3
        THEN 'latin-only'
      ELSE 'mixed'
    END AS verdict,
    (TRIM(live.ar) LIKE CONCAT('%', '[…]')
      OR TRIM(live.ar) LIKE CONCAT('%', '[...]')
      OR TRIM(live.ar) LIKE CONCAT('%', '[&hellip;]')) AS artifact
  FROM (
    SELECT 'article' AS kind, slug AS `key`, 'title' AS field, COALESCE(pub_title_ar, '') AS ar, COALESCE(pub_title_en, '') AS en
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'excerpt', COALESCE(pub_excerpt_ar, ''), COALESCE(pub_excerpt_en, '')
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'content',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'article', slug, 'image alt', COALESCE(image_alt_ar, ''), COALESCE(image_alt_en, '')
      FROM articles WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'name', COALESCE(pub_name_ar, ''), COALESCE(pub_name_en, '')
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'excerpt', COALESCE(pub_excerpt_ar, ''), COALESCE(pub_excerpt_en, '')
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'offer', slug, 'body',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_body_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_body_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM offers WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'page', route, 'title', COALESCE(pub_title_ar, ''), COALESCE(pub_title_en, '')
      FROM pages WHERE status IN ('published', 'changed') AND deleted_at IS NULL
    UNION ALL
    SELECT 'page', route, 'content',
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')),
      TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_en, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' '))
      FROM pages WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  ) live
) s
WHERE s.verdict IN ('latin-only', 'empty-with-english')
ORDER BY s.kind, s.field, s.`key`;
