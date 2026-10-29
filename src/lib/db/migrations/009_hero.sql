-- 009 hero: the homepage slider becomes a row, not a residue of the WordPress page body.
--
-- Until now the hero photos were scraped out of the imported home page's builder HTML.
-- They could not be reordered, captioned, scheduled, or even seen: the console had no
-- screen for them, and a photo could only change by editing the page body someone else
-- wrote. This table is the slider itself: one row per slide, in the order the homepage
-- shows them.
--
-- No draft/pub pair here on purpose. A slide is a background photograph plus optional
-- copy; it has an `active` flag and an optional schedule instead of a publish step, so a
-- saved-but-inactive row is the draft. Publishing a case story and swapping a hero frame
-- are different jobs and should not share a transaction.
--
-- Alt text is NOT NULL and defaulted to '': a slide without alt text still has a picture,
-- and an empty string is the honest way to say "nobody wrote one" (the console refuses to
-- activate such a slide, and the public component then hides it from assistive tech rather
-- than inventing a description).

CREATE TABLE hero_slides (
  id CHAR(36) PRIMARY KEY,
  position INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  image VARCHAR(512) NOT NULL,
  image_mobile VARCHAR(512) NULL,
  alt_ar VARCHAR(255) NOT NULL DEFAULT '',
  alt_en VARCHAR(255) NOT NULL DEFAULT '',
  heading_ar VARCHAR(255) NULL,
  heading_en VARCHAR(255) NULL,
  sub_ar VARCHAR(500) NULL,
  sub_en VARCHAR(500) NULL,
  cta_label_ar VARCHAR(120) NULL,
  cta_label_en VARCHAR(120) NULL,
  cta_href_ar VARCHAR(512) NULL,
  cta_href_en VARCHAR(512) NULL,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1,
  INDEX hero_slides_order (deleted_at, active, position)
);

-- One row, id = 1. The defaults are the behaviour the site already has: seven seconds a
-- slide, a 1.2-second crossfade, loop, pause while the pointer is over it. Controls are
-- off by default because the hero never had any and a full-bleed photograph should not
-- grow chrome just because it became editable.
CREATE TABLE hero_settings (
  id TINYINT PRIMARY KEY,
  autoplay TINYINT(1) NOT NULL DEFAULT 1,
  interval_ms INT NOT NULL DEFAULT 7000,
  fade_ms INT NOT NULL DEFAULT 1200,
  pause_on_hover TINYINT(1) NOT NULL DEFAULT 1,
  dots TINYINT(1) NOT NULL DEFAULT 0,
  arrows TINYINT(1) NOT NULL DEFAULT 0,
  -- `loop` is a MariaDB stored-program keyword; the column is `looping`.
  looping TINYINT(1) NOT NULL DEFAULT 1,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  version INT NOT NULL DEFAULT 1
);
INSERT INTO hero_settings (id) VALUES (1);
