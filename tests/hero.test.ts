/**
 * The homepage slider: the document rules, and the one transaction that stores it.
 *
 * The pure half is what the API runs before writing, so the cases here are the states a
 * save has to refuse: an active frame without a picture, a link that is actually script, a
 * schedule that ends before it starts, a list longer than the screen admits. The database
 * half writes the real table — a reader that only understood a test-shaped row would prove
 * nothing — and removes exactly the rows it created.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { CONSOLE_SCREENS } from '../src/lib/console/screens';
import {
  HERO_DEFAULTS,
  HERO_ISSUE,
  isSafeHref,
  normalizeHeroDocument,
  slideInWindow,
  validateHero,
  visibleSlides,
  type HeroDocument,
  type HeroSettings,
  type HeroSlide,
} from '../src/lib/hero/types';
import { readHeroDocument, saveHeroDocument, seedHeroFromPhotos } from '../src/lib/hero/store';

const ACTOR = '00000000-0000-4000-8000-000000000001';

function slide(overrides: Partial<HeroSlide> = {}): HeroSlide {
  return {
    id: 's1',
    active: true,
    image: '/uploads/hero.jpg',
    imageMobile: null,
    alt: { ar: 'صورة العيادة', en: 'The clinic' },
    heading: null,
    sub: null,
    cta: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function doc(slides: HeroSlide[], settings: Partial<HeroSettings> = {}): HeroDocument {
  return { slides, settings: { ...HERO_DEFAULTS, ...settings } };
}

const messages = (document: HeroDocument): string[] => validateHero(document).map((issue) => issue.message);

async function reset(): Promise<void> {
  await db.deleteFrom('hero_slides').execute();
  await db
    .updateTable('hero_settings')
    .set({ autoplay: 1, interval_ms: 7000, fade_ms: 1200, pause_on_hover: 1, dots: 0, arrows: 0, looping: 1, version: 1 })
    .where('id', '=', 1)
    .execute();
}

beforeAll(async () => {
  assertTestDb();
  await reset();
});

afterAll(async () => {
  await reset();
  await destroyDb();
});

describe('the slider document', () => {
  it('trims, caps, and turns an empty optional block into null', () => {
    const out = normalizeHeroDocument({
      slides: [
        {
          id: ' ',
          image: ' /uploads/a.jpg ',
          imageMobile: '   ',
          alt: { ar: '  نص بديل  ', en: '' },
          heading: { ar: ' ', en: '  ' },
          sub: { ar: '', en: '' },
          cta: { label: { ar: '', en: '' }, href: { ar: '', en: '' } },
          active: false,
          startsAt: 'not a date',
        },
      ],
      settings: { intervalMs: 1, fadeMs: 99_999, autoplay: 'yes', dots: 1 },
    });

    expect(out.slides[0]).toEqual({
      id: 'slide-0',
      image: '/uploads/a.jpg',
      imageMobile: null,
      alt: { ar: 'نص بديل', en: '' },
      heading: null,
      sub: null,
      cta: null,
      active: false,
      startsAt: null,
      endsAt: null,
    });
    // A clamped number and a non-boolean flag fall back to the authored behaviour.
    expect(out.settings).toEqual({ ...HERO_DEFAULTS, intervalMs: 2000, fadeMs: 4000 });
  });

  it('keeps every heading a person wrote, and normalises dates to ISO', () => {
    const out = normalizeHeroDocument({
      slides: [{ image: '/a.jpg', heading: { ar: 'عنوان', en: 'Heading' }, startsAt: '2026-03-01T09:00:00+02:00' }],
    });
    expect(out.slides[0]?.heading).toEqual({ ar: 'عنوان', en: 'Heading' });
    expect(out.slides[0]?.startsAt).toBe('2026-03-01T07:00:00.000Z');
  });

  it('refuses an empty list and a list longer than the screen admits', () => {
    expect(messages(doc([]))).toEqual([HERO_ISSUE.slidesRequired]);

    const many = normalizeHeroDocument({
      slides: Array.from({ length: 13 }, (_, index) => ({ id: `s${index}`, image: '/a.jpg', alt: { ar: 'x', en: 'x' } })),
    });
    // Normalisation keeps the rows so the refusal names the real problem rather than
    // quietly saving the first twelve.
    expect(many.slides).toHaveLength(13);
    expect(messages(many)).toEqual([HERO_ISSUE.tooMany]);
  });

  it('needs a picture and alt text on an active slide, and nothing on a paused one', () => {
    expect(messages(doc([slide({ image: '', alt: { ar: '', en: '' } })]))).toEqual([
      HERO_ISSUE.imageRequired,
      HERO_ISSUE.altRequired,
    ]);
    expect(messages(doc([slide({ active: false, image: '', alt: { ar: '', en: '' } })]))).toEqual([]);
  });

  it('accepts a rooted path or an https address, and nothing else', () => {
    for (const href of ['', '/offers', '/en/offers?x=1', 'https://shamah.clinic/offer']) {
      expect(isSafeHref(href), href).toBe(true);
    }
    for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'example.com', 'http://plain.example']) {
      expect(isSafeHref(href), href).toBe(false);
    }

    const bad = slide({
      cta: { label: { ar: 'اعرف', en: 'Learn' }, href: { ar: 'javascript:alert(1)', en: '/offers' } },
    });
    expect(messages(doc([bad]))).toEqual([HERO_ISSUE.hrefInvalid]);
  });

  it('refuses a schedule that ends before it starts', () => {
    const backwards = slide({ startsAt: '2026-05-01T10:00:00.000Z', endsAt: '2026-05-01T09:00:00.000Z' });
    expect(messages(doc([backwards]))).toEqual([HERO_ISSUE.scheduleOrder]);
  });

  it('refuses playback values outside the slider’s range', () => {
    expect(messages(doc([slide()], { intervalMs: 500 }))).toContain(HERO_ISSUE.intervalRange);
    expect(messages(doc([slide()], { fadeMs: 10_000 }))).toContain(HERO_ISSUE.fadeRange);
    expect(messages(doc([slide()], { intervalMs: 2000, fadeMs: 200 }))).toEqual([]);
  });

  it('catches two rows carrying the same id', () => {
    expect(messages(doc([slide({ id: 'same' }), slide({ id: 'same', image: '/b.jpg' })]))).toEqual([HERO_ISSUE.duplicateId]);
  });

  it('shows only active slides inside their own window, in order', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const past = slide({ id: 'past', startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-05-02T00:00:00.000Z' });
    const future = slide({ id: 'future', startsAt: '2026-07-01T00:00:00.000Z' });
    const paused = slide({ id: 'paused', active: false });
    const live = slide({ id: 'live' });

    expect(slideInWindow(past, now)).toBe(false);
    expect(slideInWindow(future, now)).toBe(false);
    expect(slideInWindow({ startsAt: null, endsAt: null }, now)).toBe(true);
    expect(visibleSlides({ slides: [past, future, paused, live] }, now).map((row) => row.id)).toEqual(['live']);
  });
});

describe('the stored slider', () => {
  it('registers the console screen behind the page grant', () => {
    expect(CONSOLE_SCREENS.find((screen) => screen.key === 'hero')).toMatchObject({
      path: '/console/hero',
      resource: 'page',
      action: 'read',
    });
  });

  it('writes the whole document in one save, in order, and soft-deletes what left the list', async () => {
    await reset();
    const first = slide({ id: 'row-a', image: '/uploads/a.jpg' });
    const second = slide({
      id: 'row-b',
      active: false,
      image: '/uploads/b.jpg',
      heading: { ar: 'عنوان', en: 'Title' },
      cta: { label: { ar: 'اعرف', en: 'Learn' }, href: { ar: '/offers', en: '/en/offers' } },
      startsAt: '2026-01-01T00:00:00.000Z',
    });

    await saveHeroDocument(doc([first, second], { autoplay: false, intervalMs: 5000, fadeMs: 600, dots: true }), ACTOR);

    const read = await readHeroDocument();
    expect(read.slides.map((row) => row.id)).toEqual(['row-a', 'row-b']);
    expect(read.slides[1]).toMatchObject({
      active: false,
      image: '/uploads/b.jpg',
      heading: { ar: 'عنوان', en: 'Title' },
      cta: { label: { ar: 'اعرف', en: 'Learn' }, href: { ar: '/offers', en: '/en/offers' } },
      startsAt: '2026-01-01T00:00:00.000Z',
    });
    expect(read.settings).toMatchObject({ autoplay: false, intervalMs: 5000, fadeMs: 600, dots: true });

    // Reorder and drop the second row: one save, one transaction.
    await saveHeroDocument(doc([{ ...second, active: true }, first], { autoplay: false, intervalMs: 5000, fadeMs: 600, dots: true }), ACTOR);

    const after = await readHeroDocument();
    expect(after.slides.map((row) => row.id)).toEqual(['row-b', 'row-a']);
    expect(after.slides[0]?.active).toBe(true);

    await saveHeroDocument(doc([first], { autoplay: false, intervalMs: 5000, fadeMs: 600, dots: true }), ACTOR);
    expect((await readHeroDocument()).slides.map((row) => row.id)).toEqual(['row-a']);

    const dropped = await db.selectFrom('hero_slides').selectAll().where('id', '=', 'row-b').executeTakeFirstOrThrow();
    expect(dropped.deleted_at).not.toBeNull();
  });

  it('seeds the current photographs once, and never resurrects a deleted row', async () => {
    await reset();
    const photos = [
      { src: '/wp/one.jpg', alt: { ar: 'الأولى', en: 'First' }, width: 1600, height: 900 },
      { src: '/wp/two.jpg', alt: { ar: 'الثانية', en: 'Second' }, width: 1600, height: 900 },
    ];

    expect(await seedHeroFromPhotos(photos, null, { dryRun: true })).toEqual({ created: 2, skipped: 0 });
    expect((await readHeroDocument()).slides).toHaveLength(0);

    expect(await seedHeroFromPhotos(photos, null)).toEqual({ created: 2, skipped: 0 });
    const seeded = await readHeroDocument();
    expect(seeded.slides.map((row) => row.image)).toEqual(['/wp/one.jpg', '/wp/two.jpg']);
    expect(seeded.slides[0]?.alt).toEqual({ ar: 'الأولى', en: 'First' });

    // A second run sees rows in the table and leaves them exactly as the console left them.
    expect(await seedHeroFromPhotos(photos, null)).toEqual({ created: 0, skipped: 2 });
  });
});
