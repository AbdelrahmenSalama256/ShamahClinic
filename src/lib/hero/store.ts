/**
 * Reading and writing the homepage slider.
 *
 * The console saves the whole document at once — every slide and the settings — because
 * that is how the screen edits it: adding, removing and dragging are all changes to one
 * ordered list, and saving them one row at a time would let a half-applied reorder reach
 * the homepage. A slide that disappeared from the payload is soft-deleted, never dropped:
 * the copy someone wrote stays readable in the database even after they change their mind.
 */
import { db } from '../db';
import type { HeroSlidesTable } from '../db/types';
import type { Selectable } from 'kysely';
import {
  HERO_DEFAULTS,
  visibleSlides,
  type HeroDocument,
  type HeroSettings,
  type HeroSlide,
} from './types';

type Row = Selectable<HeroSlidesTable>;

const text = (value: string | null): string => value ?? '';

function biOrNull(ar: string | null, en: string | null): { ar: string; en: string } | null {
  const left = text(ar).trim();
  const right = text(en).trim();
  if (left === '' && right === '') return null;
  return { ar: left, en: right };
}

function iso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function rowToSlide(row: Row): HeroSlide {
  const ctaLabel = biOrNull(row.cta_label_ar, row.cta_label_en);
  const ctaHref = biOrNull(row.cta_href_ar, row.cta_href_en);
  return {
    id: row.id,
    active: row.active === 1,
    image: row.image,
    imageMobile: row.image_mobile && row.image_mobile.trim() !== '' ? row.image_mobile : null,
    alt: { ar: text(row.alt_ar), en: text(row.alt_en) },
    heading: biOrNull(row.heading_ar, row.heading_en),
    sub: biOrNull(row.sub_ar, row.sub_en),
    cta: ctaLabel || ctaHref ? { label: ctaLabel ?? { ar: '', en: '' }, href: ctaHref ?? { ar: '', en: '' } } : null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
  };
}

export function settingsOf(row: {
  autoplay: number;
  interval_ms: number;
  fade_ms: number;
  pause_on_hover: number;
  dots: number;
  arrows: number;
  looping: number;
} | undefined): HeroSettings {
  if (!row) return { ...HERO_DEFAULTS };
  return {
    autoplay: row.autoplay === 1,
    intervalMs: row.interval_ms,
    fadeMs: row.fade_ms,
    pauseOnHover: row.pause_on_hover === 1,
    dots: row.dots === 1,
    arrows: row.arrows === 1,
    loop: row.looping === 1,
  };
}

/** Every slide the console edits, including inactive and out-of-schedule ones, in order. */
export async function readHeroDocument(): Promise<HeroDocument> {
  const [rows, settings] = await Promise.all([
    db.selectFrom('hero_slides').selectAll().where('deleted_at', 'is', null).orderBy('position').orderBy('created_at').execute(),
    db.selectFrom('hero_settings').selectAll().where('id', '=', 1).executeTakeFirst(),
  ]);
  return { slides: rows.map(rowToSlide), settings: settingsOf(settings) };
}

/**
 * What the homepage draws right now.
 *
 * The caller decides what an empty result means (today: fall back to the photographs the
 * imported page still carries). This function never invents a slide, and a database error
 * is not caught here: `getHomeHero` catches it so a console with no database still serves
 * the site's authored photo instead of a 500.
 */
export async function readPublicHero(now: Date = new Date()): Promise<HeroDocument> {
  const document = await readHeroDocument();
  return { slides: visibleSlides(document, now), settings: document.settings };
}

function valuesOf(slide: HeroSlide, position: number) {
  return {
    position,
    active: (slide.active ? 1 : 0) as 0 | 1,
    image: slide.image,
    image_mobile: slide.imageMobile,
    alt_ar: slide.alt.ar,
    alt_en: slide.alt.en,
    heading_ar: slide.heading?.ar || null,
    heading_en: slide.heading?.en || null,
    sub_ar: slide.sub?.ar || null,
    sub_en: slide.sub?.en || null,
    cta_label_ar: slide.cta?.label.ar || null,
    cta_label_en: slide.cta?.label.en || null,
    cta_href_ar: slide.cta?.href.ar || null,
    cta_href_en: slide.cta?.href.en || null,
    starts_at: slide.startsAt ? new Date(slide.startsAt) : null,
    ends_at: slide.endsAt ? new Date(slide.endsAt) : null,
  };
}

/**
 * Writes the document in one transaction.
 *
 * Ids the console sends are reused when they name a row this table already has; any other
 * id is a new slide (the screen mints a `slide-…` placeholder before the first save, so a
 * new row gets the id the person's browser already refers to). A soft-deleted row that
 * comes back with the same id stays deleted — ids are never resurrected across a delete,
 * and the screen never sends one.
 */
export async function saveHeroDocument(document: HeroDocument, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const existing = await trx.selectFrom('hero_slides').select(['id', 'deleted_at']).execute();
    const known = new Set(existing.filter((row) => row.deleted_at === null).map((row) => row.id));

    const kept: string[] = [];
    for (const [position, slide] of document.slides.entries()) {
      const values = valuesOf(slide, position);
      if (known.has(slide.id)) {
        await trx
          .updateTable('hero_slides')
          .set({ ...values, updated_by: userId, version: (eb) => eb('version', '+', 1) })
          .where('id', '=', slide.id)
          .execute();
      } else {
        await trx
          .insertInto('hero_slides')
          .values({ id: slide.id, ...values, created_by: userId, updated_by: userId })
          .execute();
      }
      kept.push(slide.id);
    }

    if (kept.length > 0) {
      await trx
        .updateTable('hero_slides')
        .set({ deleted_at: new Date(), updated_by: userId })
        .where('deleted_at', 'is', null)
        .where('id', 'not in', kept)
        .execute();
    }

    const settings = document.settings;
    await trx
      .updateTable('hero_settings')
      .set({
        autoplay: (settings.autoplay ? 1 : 0) as 0 | 1,
        interval_ms: settings.intervalMs,
        fade_ms: settings.fadeMs,
        pause_on_hover: (settings.pauseOnHover ? 1 : 0) as 0 | 1,
        dots: (settings.dots ? 1 : 0) as 0 | 1,
        arrows: (settings.arrows ? 1 : 0) as 0 | 1,
        looping: (settings.loop ? 1 : 0) as 0 | 1,
        updated_by: userId,
        version: (eb) => eb('version', '+', 1),
      })
      .where('id', '=', 1)
      .execute();
  });
}

/**
 * Turns the photographs the imported page still carries into the first slide, once.
 *
 * The seed runs this when `hero_slides` is empty, so a database that has never seen the
 * slider draws exactly what the site drew before the table existed. It writes one row per
 * photograph — the WordPress page had several — and leaves the table alone afterwards.
 */
export async function seedHeroFromPhotos(
  photos: readonly { src: string; alt: { ar: string; en: string }; width: number; height: number }[],
  userId: string | null,
  options: { dryRun?: boolean } = {},
): Promise<{ created: number; skipped: number }> {
  const count = await db.selectFrom('hero_slides').select((eb) => eb.fn.countAll<number>().as('n')).where('deleted_at', 'is', null).executeTakeFirst();
  const existing = Number(count?.n ?? 0);
  if (existing > 0) return { created: 0, skipped: existing };

  const usable = photos.filter((photo) => photo.src);
  if (options.dryRun) return { created: usable.length, skipped: 0 };

  let created = 0;
  for (const [position, photo] of usable.entries()) {
    if (!photo.src) continue;
    await db
      .insertInto('hero_slides')
      .values({
        id: `hero-seed-${position + 1}`,
        position,
        active: 1,
        image: photo.src,
        alt_ar: photo.alt.ar,
        alt_en: photo.alt.en,
        created_by: userId,
        updated_by: userId,
      })
      .execute();
    created += 1;
  }
  return { created, skipped: 0 };
}
