/**
 * The homepage slider, as one document both sides agree on.
 *
 * The public hero, the console screen and the guarded API all read this file, so the
 * rules about what a slide may contain are written once. Nothing here touches the
 * database or React: `validateHero` is a pure function and is what the API runs before a
 * single row is written.
 */

export interface Bi {
  ar: string;
  en: string;
}

export interface HeroCta {
  label: Bi;
  href: Bi;
}

/** One row of `hero_slides`, in the console's camelCase. */
export interface HeroSlide {
  id: string;
  active: boolean;
  image: string;
  imageMobile: string | null;
  alt: Bi;
  /** `null` when nobody wrote a heading, which is what keeps the site's authored hero copy. */
  heading: Bi | null;
  sub: Bi | null;
  cta: HeroCta | null;
  /** ISO strings, so the console and the server compare the same text. */
  startsAt: string | null;
  endsAt: string | null;
}

export interface HeroSettings {
  autoplay: boolean;
  intervalMs: number;
  fadeMs: number;
  pauseOnHover: boolean;
  dots: boolean;
  arrows: boolean;
  loop: boolean;
}

export interface HeroDocument {
  slides: HeroSlide[];
  settings: HeroSettings;
}

/**
 * The behaviour the site already had, used when the table is empty and as the setting
 * row's defaults: seven seconds per frame, a 1.2-second crossfade, looping, paused while
 * the pointer rests on it, and no controls to get in the way of the photograph.
 */
export const HERO_DEFAULTS: HeroSettings = {
  autoplay: true,
  intervalMs: 7000,
  fadeMs: 1200,
  pauseOnHover: true,
  dots: false,
  arrows: false,
  loop: true,
};

export const HERO_LIMITS = {
  slides: 12,
  intervalMs: { min: 2000, max: 20000 },
  fadeMs: { min: 200, max: 4000 },
  image: 512,
  heading: 255,
  sub: 500,
  ctaLabel: 120,
} as const;

export interface HeroIssue {
  path: string;
  message: string;
}

export const HERO_ISSUE = {
  slidesRequired: 'slides_required',
  tooMany: 'too_many_slides',
  imageRequired: 'image_required',
  altRequired: 'alt_required',
  hrefInvalid: 'href_invalid',
  intervalRange: 'interval_range',
  fadeRange: 'fade_range',
  scheduleOrder: 'schedule_order',
  duplicateId: 'duplicate_id',
} as const;

const INTERNAL = /^\/(?!\/)[^\s]*$/;
const EXTERNAL = /^https:\/\/[^\s]+$/i;

/**
 * A destination a slide's button may point at.
 *
 * Only a rooted path or an https URL: `javascript:` and `data:` are the two schemes a
 * link field must never be allowed to store, and a bare `example.com` is a relative path
 * the site would answer with a 404. An empty string is valid and means "no link".
 */
export function isSafeHref(value: string): boolean {
  const text = value.trim();
  return text === '' || INTERNAL.test(text) || EXTERNAL.test(text);
}

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const cleanMultiline = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const cleanSrc = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, HERO_LIMITS.image) : '');

function biOf(value: unknown, max: number, multiline = false): Bi {
  const row = value && typeof value === 'object' ? (value as Partial<Bi>) : {};
  const cleanText = multiline ? cleanMultiline : clean;
  return { ar: cleanText(row.ar, max), en: cleanText(row.en, max) };
}

function emptyBi(value: Bi): boolean {
  return value.ar === '' && value.en === '';
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * The document the database will hold, built from whatever the console posted.
 *
 * Trimming and capping happen here rather than in the form so a second caller (a future
 * import, a test) cannot write a heading longer than the column and learn about it from a
 * database error. Unknown ids are kept: the store decides insert versus update.
 */
export function normalizeHeroDocument(input: unknown): HeroDocument {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  // Fifty is the API schema's ceiling; the editor's real limit is twelve and is refused by
  // `validateHero` rather than silently dropping the tail of a longer list.
  const rawSlides = Array.isArray(raw.slides) ? raw.slides.slice(0, 50) : [];
  const slides: HeroSlide[] = rawSlides.map((value, index) => {
    const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const alt = biOf(row.alt, HERO_LIMITS.heading);
    const heading = biOf(row.heading, HERO_LIMITS.heading);
    const sub = biOf(row.sub, HERO_LIMITS.sub, true);
    const ctaRaw = row.cta && typeof row.cta === 'object' ? (row.cta as Record<string, unknown>) : null;
    const ctaLabel = ctaRaw ? biOf(ctaRaw.label, HERO_LIMITS.ctaLabel) : { ar: '', en: '' };
    const ctaHref = ctaRaw ? biOf(ctaRaw.href, HERO_LIMITS.image) : { ar: '', en: '' };
    const cta = ctaRaw && (!emptyBi(ctaLabel) || !emptyBi(ctaHref)) ? { label: ctaLabel, href: ctaHref } : null;
    const mobile = cleanSrc(row.imageMobile);
    return {
      id: typeof row.id === 'string' && row.id.trim() !== '' ? row.id.trim().slice(0, 36) : `slide-${index}`,
      active: row.active !== false,
      image: cleanSrc(row.image),
      imageMobile: mobile === '' ? null : mobile,
      alt,
      heading: emptyBi(heading) ? null : heading,
      sub: emptyBi(sub) ? null : sub,
      cta,
      startsAt: isoOrNull(row.startsAt),
      endsAt: isoOrNull(row.endsAt),
    };
  });

  const settingsRaw = raw.settings && typeof raw.settings === 'object' ? (raw.settings as Record<string, unknown>) : {};
  const numberIn = (value: unknown, fallback: number, range: { min: number; max: number }): number => {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(range.max, Math.max(range.min, Math.round(number)));
  };
  const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

  return {
    slides,
    settings: {
      autoplay: flag(settingsRaw.autoplay, HERO_DEFAULTS.autoplay),
      intervalMs: numberIn(settingsRaw.intervalMs, HERO_DEFAULTS.intervalMs, HERO_LIMITS.intervalMs),
      fadeMs: numberIn(settingsRaw.fadeMs, HERO_DEFAULTS.fadeMs, HERO_LIMITS.fadeMs),
      pauseOnHover: flag(settingsRaw.pauseOnHover, HERO_DEFAULTS.pauseOnHover),
      dots: flag(settingsRaw.dots, HERO_DEFAULTS.dots),
      arrows: flag(settingsRaw.arrows, HERO_DEFAULTS.arrows),
      loop: flag(settingsRaw.loop, HERO_DEFAULTS.loop),
    },
  };
}

/**
 * What stops a save.
 *
 * Two of these are the brief's publication rule — at least one active slide, and every
 * active slide needs a picture and alt text. The rest protect a saved document from
 * becoming a slide that renders nothing or a link that goes nowhere. A schedule whose end
 * precedes its start is refused rather than silently ignored, because a person who typed
 * both dates meant something and the site would otherwise hide the slide forever.
 */
export function validateHero(document: HeroDocument): HeroIssue[] {
  const issues: HeroIssue[] = [];

  if (document.slides.length === 0) {
    issues.push({ path: 'slides', message: HERO_ISSUE.slidesRequired });
  }
  if (document.slides.length > HERO_LIMITS.slides) {
    issues.push({ path: 'slides', message: HERO_ISSUE.tooMany });
  }
  const seen = new Set<string>();
  for (const [index, slide] of document.slides.entries()) {
    if (seen.has(slide.id)) issues.push({ path: `slides.${index}.id`, message: HERO_ISSUE.duplicateId });
    seen.add(slide.id);
    if (!slide.active) continue;
    if (slide.image === '') issues.push({ path: `slides.${index}.image`, message: HERO_ISSUE.imageRequired });
    if (slide.alt.ar === '' && slide.alt.en === '') {
      issues.push({ path: `slides.${index}.alt`, message: HERO_ISSUE.altRequired });
    }
    for (const [key, value] of [
      ['cta', slide.cta?.href.ar ?? ''],
      ['cta', slide.cta?.href.en ?? ''],
    ] as const) {
      if (!isSafeHref(value)) issues.push({ path: `slides.${index}.${key}`, message: HERO_ISSUE.hrefInvalid });
    }
    if (slide.startsAt && slide.endsAt && Date.parse(slide.endsAt) <= Date.parse(slide.startsAt)) {
      issues.push({ path: `slides.${index}.endsAt`, message: HERO_ISSUE.scheduleOrder });
    }
  }

  if (document.settings.intervalMs < HERO_LIMITS.intervalMs.min || document.settings.intervalMs > HERO_LIMITS.intervalMs.max) {
    issues.push({ path: 'settings.intervalMs', message: HERO_ISSUE.intervalRange });
  }
  if (document.settings.fadeMs < HERO_LIMITS.fadeMs.min || document.settings.fadeMs > HERO_LIMITS.fadeMs.max) {
    issues.push({ path: 'settings.fadeMs', message: HERO_ISSUE.fadeRange });
  }

  return issues;
}

/** Whether a slide is on screen at `now`. A null bound is open-ended. */
export function slideInWindow(slide: Pick<HeroSlide, 'startsAt' | 'endsAt'>, now: Date = new Date()): boolean {
  const time = now.getTime();
  if (slide.startsAt && Date.parse(slide.startsAt) > time) return false;
  if (slide.endsAt && Date.parse(slide.endsAt) <= time) return false;
  return true;
}

/** The slides the public hero draws: active, inside their schedule, in order. */
export function visibleSlides(document: Pick<HeroDocument, 'slides'>, now: Date = new Date()): HeroSlide[] {
  return document.slides.filter((slide) => slide.active && slideInWindow(slide, now));
}
