-- ============================================================================
-- PROPOSED FIX — empty the Arabic excerpts that are copies of the English ones
--
-- READ §1 FIRST. It lists the rows and shows what each column says today. §2 holds
-- the only statements that write, and they are commented out: uncomment them to
-- apply, leave them and this file changes nothing. Nothing outside §2 writes.
--
-- Why empty instead of translate:
--   The WordPress import copied each English auto-excerpt into the Arabic column, so
--   `pub_excerpt_ar` is not a translation of anything — it is the English sentence a
--   visitor already reads on `/en`. The article does have real Arabic to show instead:
--   its own body. Since this change `/ar` opens that card with the article's first
--   Arabic sentence (`src/lib/content/teaser.ts`), so the site is already right.
--   Emptying the column makes the CONSOLE agree with the site: an editor who opens
--   the article finds an empty Arabic excerpt and the editor's warning, not an
--   English sentence pretending to be a translation.
--
-- Nothing authored is destroyed. A row is only touched when its Arabic column holds
-- no Arabic, when the DRAFT Arabic excerpt holds no Arabic either (an editor's
-- untranslated work is left for the next publish to carry over), and when the
-- article's Arabic body does hold Arabic. The English excerpt stays in `*_excerpt_en`.
-- Re-running changes nothing: an emptied row no longer matches the WHERE clause.
--
-- Run: phpMyAdmin > the newshamah database > SQL tab > paste > Go.
-- Needs MariaDB 10.2+ (REGEXP_REPLACE).
--
-- The rule is `isMostlyLatin()` in src/lib/text-script.ts, applied to the VISIBLE
-- text of a body — markup, page-builder shortcodes and `&…;` entities first, because
-- `<div class="vc_row">` is not English prose:
--     Arabic letters = CHAR_LENGTH(REGEXP_REPLACE(x, '[^؀-ۿ]', ''))
--     Latin  letters = CHAR_LENGTH(REGEXP_REPLACE(x, '[^A-Za-z]', ''))
--     latin-only     when Latin > 0 AND (Arabic = 0 OR Latin > Arabic * 3)
--
-- Measured on the local copy of the live data, 2026-11-06, over 94 published
-- articles: 89 rows qualify, 0 of them hold an Arabic draft excerpt, and 90 of the
-- 94 have an Arabic excerpt byte-identical to the English one.
--
-- What this deliberately does NOT touch, and why — §4 lists all of them:
--   * 2 articles whose Arabic BODY is English too: nothing to derive, so the card
--     keeps saying what the row says;
--   * the 5 offers with Latin Arabic excerpts, for the same reason (their Arabic
--     bodies are English);
--   * 76 `image_alt_ar` copies of the English alt — an empty alt tells a screen
--     reader "decorative", which is worse than an English description;
--   * 17 page titles and 2 article titles written in Latin letters — a headline
--     cannot be derived from a body, so these need a person;
--   * 16 page bodies that are the theme's demo rows (`sample-page`, the slider
--     demos, `hero-image`…) — hide those in Settings → site pages instead.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1 — the rows §2 would change.
-- `ar_is_a_copy_of_en` proves the value being dropped is the English one.
-- ---------------------------------------------------------------------------
SELECT
  a.slug,
  LEFT(a.pub_excerpt_ar, 60) AS ar_excerpt_today,
  LEFT(a.pub_excerpt_en, 60) AS en_excerpt,
  TRIM(a.pub_excerpt_ar) = TRIM(a.pub_excerpt_en) AS ar_is_a_copy_of_en,
  LEFT(a.body_ar, 60) AS arabic_body_opens_with
FROM (
  SELECT
    slug,
    excerpt_ar,
    pub_excerpt_ar,
    pub_excerpt_en,
    TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
      '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')) AS body_ar
  FROM articles
  WHERE status IN ('published', 'changed') AND deleted_at IS NULL
) a
WHERE -- the live Arabic excerpt is not written in Arabic
  CHAR_LENGTH(REGEXP_REPLACE(a.pub_excerpt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(a.pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(a.pub_excerpt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(a.pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
  -- and neither is the draft, so there is no untranslated work to lose
  AND (TRIM(a.excerpt_ar) = ''
    OR (CHAR_LENGTH(REGEXP_REPLACE(a.excerpt_ar, '[^A-Za-z]', '')) > 0
        AND (CHAR_LENGTH(REGEXP_REPLACE(a.excerpt_ar, '[^؀-ۿ]', '')) = 0
          OR CHAR_LENGTH(REGEXP_REPLACE(a.excerpt_ar, '[^A-Za-z]', ''))
             > CHAR_LENGTH(REGEXP_REPLACE(a.excerpt_ar, '[^؀-ۿ]', '')) * 3)))
  -- and the article does have an Arabic body to stand in
  AND CHAR_LENGTH(REGEXP_REPLACE(a.body_ar, '[^؀-ۿ]', '')) > 0
  AND CHAR_LENGTH(REGEXP_REPLACE(a.body_ar, '[^A-Za-z]', ''))
      <= CHAR_LENGTH(REGEXP_REPLACE(a.body_ar, '[^؀-ۿ]', '')) * 3
ORDER BY a.slug;

-- The same rows as two counts, for the review note.
SELECT
  COUNT(*) AS rows_to_empty,
  SUM(TRIM(pub_excerpt_ar) = TRIM(pub_excerpt_en)) AS of_which_a_copy_of_the_english,
  SUM(pub_excerpt_ar LIKE '%[…]') AS of_which_end_with_the_wordpress_artifact
FROM articles
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
  AND (TRIM(excerpt_ar) = ''
    OR (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', '')) > 0
        AND (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) = 0
          OR CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', ''))
             > CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) * 3)))
  AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) > 0
  AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^A-Za-z]', ''))
      <= CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) * 3;

-- ---------------------------------------------------------------------------
-- §2 — the proposed writes. Uncomment to apply.
--
-- Draft and published move together: leaving the English copy in the draft would put
-- it back in the live column the next time that locale is published. `version` is
-- untouched on purpose — this is not an edit, and the console's optimistic-lock
-- counter only answers for rows a person saved.
-- ---------------------------------------------------------------------------
-- START TRANSACTION;
--
-- UPDATE articles SET
--   excerpt_ar = '',
--   pub_excerpt_ar = ''
-- WHERE status IN ('published', 'changed')
--   AND deleted_at IS NULL
--   AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', '')) > 0
--   AND (CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
--     OR CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', ''))
--        > CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
--   AND (TRIM(excerpt_ar) = ''
--     OR (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', '')) > 0
--         AND (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) = 0
--           OR CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', ''))
--              > CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) * 3)))
--   AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
--         '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) > 0
--   AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
--         '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^A-Za-z]', ''))
--       <= CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
--         '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) * 3;
--
-- The `[…]` pass, for the rows that are otherwise real Arabic. There are none today
-- (the artifact sits only on the English copies §2 already empties), so this is a
-- guard for the day a translated excerpt keeps the shortcode's tail — safe to run,
-- and it changes nothing until such a row exists.
--
-- UPDATE articles SET
--   excerpt_ar = TRIM(REGEXP_REPLACE(excerpt_ar, '\\s*\\[(…|\\.\\.\\.|&hellip;)\\]\\s*$', '')),
--   pub_excerpt_ar = TRIM(REGEXP_REPLACE(pub_excerpt_ar, '\\s*\\[(…|\\.\\.\\.|&hellip;)\\]\\s*$', ''))
-- WHERE status IN ('published', 'changed')
--   AND deleted_at IS NULL
--   AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) > 0
--   AND (pub_excerpt_ar LIKE '%[…]' OR excerpt_ar LIKE '%[…]');
--
-- COMMIT;

-- ---------------------------------------------------------------------------
-- §3 — after §2, the same question asked with §2's own WHERE clause, so the number
-- here (89 today) is the number of rows §2 moved and `rows_still_to_empty` reads 0
-- once they have. Run it before §2 to see the starting count, after to confirm.
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS rows_still_to_empty
FROM articles
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
  AND (TRIM(excerpt_ar) = ''
    OR (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', '')) > 0
        AND (CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) = 0
          OR CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^A-Za-z]', ''))
             > CHAR_LENGTH(REGEXP_REPLACE(excerpt_ar, '[^؀-ۿ]', '')) * 3)))
  AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) > 0
  AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^A-Za-z]', ''))
      <= CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) * 3;

-- ---------------------------------------------------------------------------
-- §4 — what no SQL can fix: every field whose Arabic column holds Latin text with
-- nothing Arabic to derive, so it needs a person. `arabic_column_holds` is the text
-- a visitor reads on the Arabic page today.
-- ---------------------------------------------------------------------------
SELECT 'article title' AS field, slug AS `key`, LEFT(pub_title_ar, 80) AS arabic_column_holds
FROM articles
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND TRIM(pub_title_ar) <> ''
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'page title', route, LEFT(pub_title_ar, 80)
FROM pages
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND TRIM(pub_title_ar) <> ''
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_title_ar, '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'article image alt', slug, LEFT(COALESCE(image_alt_ar, ''), 80)
FROM articles
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND TRIM(COALESCE(image_alt_ar, '')) <> ''
  AND CHAR_LENGTH(REGEXP_REPLACE(image_alt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(image_alt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(image_alt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(image_alt_ar, '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'offer name', slug, LEFT(pub_name_ar, 80)
FROM offers
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND TRIM(pub_name_ar) <> ''
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_name_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_name_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_name_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_name_ar, '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'article excerpt with no Arabic body', slug, LEFT(pub_excerpt_ar, 80)
FROM articles
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
  AND NOT (CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) > 0
      AND CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^A-Za-z]', ''))
        <= CHAR_LENGTH(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''),
        '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), '&[A-Za-z#0-9]+;', ' ')), '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'offer excerpt with no Arabic body', slug, LEFT(pub_excerpt_ar, 80)
FROM offers
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(pub_excerpt_ar, '[^؀-ۿ]', '')) * 3)
UNION ALL
SELECT 'page body (often a theme demo row)', route, LEFT(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '<[^>]*>', ' '), '\\[[A-Za-z/][^\\]]*\\]', ' '), 80)
FROM pages
WHERE status IN ('published', 'changed') AND deleted_at IS NULL
  AND CHAR_LENGTH(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '[^A-Za-z]', '')) > 0
  AND (CHAR_LENGTH(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '[^؀-ۿ]', '')) = 0
    OR CHAR_LENGTH(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '[^A-Za-z]', ''))
       > CHAR_LENGTH(REGEXP_REPLACE(COALESCE(pub_content_ar, ''), '[^؀-ۿ]', '')) * 3)
ORDER BY field, `key`;
