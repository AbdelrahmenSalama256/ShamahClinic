/**
 * #243: the banner a listing page opens with is editable from the console.
 *
 * The pure half is here because the same parse runs on a value MariaDB may hand back
 * parsed or as LONGTEXT, and a banner path is fed to next/image — one bad value would
 * be a broken frame on the public site. The database half writes the real `banners`
 * group and deletes exactly what it wrote: a reader proved against a test-shaped group
 * would not show that the site's own read path sees the override.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { bannerPhoto, getBanner, getBannerOverride, readBanners } from '../src/lib/content/banners';
import {
  BANNER_DEFAULTS,
  BANNER_KEYS,
  BANNER_PAGES,
  BANNER_SETTING_GROUP,
  isBannerPage,
  parseBanner,
  safeBannerSrc,
} from '../src/lib/content/banners-catalog';
import { SITE_PAGES } from '../src/lib/content/settings-catalog';

async function purge(): Promise<void> {
  await db.deleteFrom('settings').where('group_name', '=', BANNER_SETTING_GROUP).execute();
}

async function save(key: string, value: unknown): Promise<void> {
  await db
    .insertInto('settings')
    .values({
      group_name: BANNER_SETTING_GROUP,
      setting_key: key,
      value: JSON.stringify(value),
      default_value: null,
      is_secret: 0,
      version: 1,
    })
    .execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
});

afterAll(async () => {
  await purge();
  await destroyDb();
});

describe('a saved banner', () => {
  it('accepts only a rooted, same-site image path', () => {
    expect(safeBannerSrc('/images/hero-portrait.jpg')).toBe('/images/hero-portrait.jpg');
    expect(safeBannerSrc('  /images/hero-portrait.jpg  ')).toBe('/images/hero-portrait.jpg');
    expect(safeBannerSrc('')).toBeNull();
    // next/image can only load a configured host, so a photo the site does not host is
    // not a banner this console can save.
    expect(safeBannerSrc('https://example.com/hero.jpg')).toBeNull();
    expect(safeBannerSrc('//example.com/hero.jpg')).toBeNull();
    expect(safeBannerSrc('images/hero.jpg')).toBeNull();
    expect(safeBannerSrc('/images/hero portrait.jpg')).toBeNull();
    expect(safeBannerSrc('/images/../secret.jpg')).toBeNull();
    expect(safeBannerSrc('/images/./hero.jpg')).toBeNull();
    expect(safeBannerSrc('/images/\u0000hero.jpg')).toBeNull();
  });

  it('reads the shapes a settings row may arrive in', () => {
    expect(parseBanner({ src: '/images/hero.jpg', altAr: ' وصف ', altEn: ' A photo ' })).toEqual({
      src: '/images/hero.jpg',
      altAr: 'وصف',
      altEn: 'A photo',
    });
    // MariaDB prints JSON as LONGTEXT: the same document with a leading space is still one.
    expect(parseBanner('  {"src":"/images/hero.jpg"} ')).toEqual({ src: '/images/hero.jpg', altAr: '', altEn: '' });
    expect(parseBanner({ src: '/images/hero.jpg', altAr: 'a'.repeat(400) })?.altAr).toHaveLength(300);
  });

  it('ignores a row that is not a banner instead of repairing it to a default', () => {
    expect(parseBanner(null)).toBeNull();
    expect(parseBanner('not json')).toBeNull();
    expect(parseBanner([1, 2])).toBeNull();
    expect(parseBanner({ altAr: 'no path' })).toBeNull();
    expect(parseBanner({ src: 'https://example.com/x.jpg' })).toBeNull();
    expect(parseBanner({ src: '/images/../x.jpg' })).toBeNull();
  });

  it('draws every listing page from one authored photo, and only those pages', () => {
    // FAQ and privacy open with a band of type; offering them a banner would be a control
    // that changes nothing.
    expect(BANNER_KEYS).not.toContain('faq');
    expect(BANNER_KEYS).not.toContain('privacy');
    for (const key of BANNER_KEYS) {
      expect(SITE_PAGES.some((page) => page.key === key), `${key} is a site page`).toBe(true);
      expect(BANNER_DEFAULTS[key].src.startsWith('/'), `${key} is local`).toBe(true);
      expect(BANNER_DEFAULTS[key].alt.ar, `${key} has an Arabic caption`).toBeTruthy();
      expect(BANNER_DEFAULTS[key].alt.en, `${key} has an English caption`).toBeTruthy();
    }
    expect(BANNER_PAGES.map((page) => page.path)).toEqual(['', '/about', '/services', '/offers', '/branches', '/blogs', '/doctors', '/results', '/contact']);
    expect(isBannerPage('blogs')).toBe(true);
    expect(isBannerPage('faq')).toBe(false);
  });

  it('keeps only the caption saved with the CMS banner', () => {
    const slot = bannerPhoto({ blogs: { src: '/images/treatment-peel.jpg', altAr: '', altEn: 'Peel session' } }, 'blogs');
    expect(slot).toEqual({
      src: '/images/treatment-peel.jpg',
      alt: { ar: '', en: 'Peel session' },
      width: 1600,
      height: 1067,
      focal: '50% 50%',
    });
  });
});

describe('the banners group read from the database', () => {
  it('leaves the banner empty until a CMS row is saved', async () => {
    expect(await getBanner('blogs')).toBeNull();
    expect(await getBannerOverride('home')).toBeNull();
  });

  it('replaces only the page it names', async () => {
    await save('blogs', { src: '/images/treatment-peel.jpg', altAr: '', altEn: 'Peel session' });

    const saved = await readBanners();
    expect(saved.blogs).toEqual({ src: '/images/treatment-peel.jpg', altAr: '', altEn: 'Peel session' });
    expect(saved.about).toBeUndefined();
    expect((await getBanner('blogs'))?.src).toBe('/images/treatment-peel.jpg');
    expect(await getBanner('about')).toBeNull();
  });

  it('gives the home hero an override of its own, so its slides survive no choice', async () => {
    await save('home', { src: '/images/clinic-reception.jpg', altAr: 'استقبال', altEn: 'Reception' });

    expect(await getBannerOverride('home')).toMatchObject({ src: '/images/clinic-reception.jpg', alt: { ar: 'استقبال', en: 'Reception' } });
    expect(await getBannerOverride('blogs')).toMatchObject({ src: '/images/treatment-peel.jpg' });
  });

  it('ignores a row whose path leaves the site, and a key the site does not render', async () => {
    await save('offers', { src: 'https://example.com/banner.jpg' });
    await save('cart', { src: '/images/hero-portrait.jpg' });

    const saved = await readBanners();
    expect(saved.offers).toBeUndefined();
    expect(saved).not.toHaveProperty('cart');
    expect(await getBanner('offers')).toBeNull();
  });
});
