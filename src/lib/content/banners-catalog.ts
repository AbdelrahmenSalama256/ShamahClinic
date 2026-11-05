/**
 * The banner a listing page opens with, and the shape a saved override takes.
 *
 * Every listing page renders one hero photo — the banner above its title. Until now
 * that photo was picked in `src/lib/images.ts` and named at the component that drew
 * it, so changing a page's banner meant a deploy. The console edits the same slot
 * here: one `settings` row per page in the `banners` group, value
 * `{ "src": "...", "altAr": "...", "altEn": "..." }`.
 *
 * `BANNER_DEFAULTS` are console-side starting suggestions only. Public pages render
 * a banner only when the CMS has a saved value.
 *
 * This file is the client-safe half (plain data, no database import), because the
 * Settings screen previews and validates against the same defaults.
 */
import { images, type PhotoSlot } from '@/lib/images';
import { SITE_PAGES, type BilingualLabel } from './settings-catalog';

export const BANNER_SETTING_GROUP = 'banners';

export interface BannerSetting {
  src: string;
  /** Empty means "use the authored caption for that language". */
  altAr: string;
  altEn: string;
}

/** The saved overrides by page; a missing key means the authored photo still applies. */
export type SavedBanners = Partial<Record<BannerPageKey, BannerSetting>>;

/**
 * Pages that open with a banner. FAQ and Privacy deliberately do not: their hero is
 * a band of type, and offering a photo for a slot the page never draws would be a
 * control that changes nothing.
 */
export const BANNER_KEYS = [
  'home',
  'about',
  'services',
  'offers',
  'branches',
  'blogs',
  'doctors',
  'results',
  'contact',
] as const;

export type BannerPageKey = (typeof BANNER_KEYS)[number];

export const BANNER_DEFAULTS: Readonly<Record<BannerPageKey, PhotoSlot>> = {
  home: images.hero,
  about: images.interiors.reception,
  services: images.treatments.laser,
  offers: images.interiors.treatmentRoom,
  branches: images.interiors.corridor,
  blogs: images.journal.routine,
  doctors: images.interiors.consultation,
  results: images.skin.after,
  contact: images.interiors.reception,
};

/** The console's rows: the page registry's label and href, in registry order. */
export const BANNER_PAGES: readonly { key: BannerPageKey; path: string; label: BilingualLabel }[] = BANNER_KEYS.map(
  (key) => {
    const page = SITE_PAGES.find((entry) => entry.key === key);
    return { key, path: page?.path ?? '', label: page?.label ?? { ar: key, en: key } };
  },
);

export function isBannerPage(value: string): value is BannerPageKey {
  return (BANNER_KEYS as readonly string[]).includes(value);
}

/**
 * A banner is one of the site's own files. Restricting it to a rooted, same-site path
 * keeps next/image's configured hosts authoritative: an arbitrary remote URL would be
 * rejected by the image loader anyway, and a `//host` would leave the site's origin.
 * Spaces and control characters are refused because the value is pasted into markup
 * as a path, not displayed as text.
 */
export function safeBannerSrc(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 400) return null;
  if (!text.startsWith('/') || text.startsWith('//')) return null;
  if (/[\u0000-\u001f\u007f\\\s]/.test(text)) return null;
  // `.`/`..` segments are resolved by the image loader, so the photo it reads would not
  // be the path an operator wrote; refuse them rather than let the two disagree.
  if (/(^|\/)\.{1,2}(\/|$)/.test(text)) return null;
  return text;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** MariaDB prints JSON as LONGTEXT, so a document may arrive parsed or as a string. */
function documentOf(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/**
 * A saved row, or null when it is not a banner. An invalid `src` is not repaired to a
 * default: the row is ignored and the authored photo wins, which is the same answer as
 * "never saved" and cannot paint a broken frame.
 */
export function parseBanner(value: unknown): BannerSetting | null {
  const doc = documentOf(value);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const record = doc as Record<string, unknown>;
  const src = safeBannerSrc(text(record.src, 400));
  if (!src) return null;
  return { src, altAr: text(record.altAr, 300), altEn: text(record.altEn, 300) };
}
