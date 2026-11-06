/**
 * The read side of the editable banners.
 *
 * One query per render, not per page: `readBanners()` returns every saved override and
 * each page asks for its own key. A missing or unreadable CMS value leaves the page
 * without a banner; local catalog images are not public-content fallbacks.
 */
import { cache } from 'react';
import { db } from '../db';
import type { PhotoSlot } from '../images';
import {
  BANNER_SETTING_GROUP,
  isBannerPage,
  parseBanner,
  type BannerPageKey,
  type SavedBanners,
} from './banners-catalog';

/**
 * One read per render: a page asks for one banner, but the hero and a later section
 * can ask for the same override, and the group is small enough to read once.
 */
export const readBanners = cache(async function readBanners(): Promise<SavedBanners> {
  try {
    const rows = await db
      .selectFrom('settings')
      .select(['setting_key', 'value'])
      .where('group_name', '=', BANNER_SETTING_GROUP)
      .execute();
    const saved: SavedBanners = {};
    for (const row of rows) {
      if (!isBannerPage(row.setting_key)) continue;
      const banner = parseBanner(row.value);
      if (banner) saved[row.setting_key] = banner;
    }
    return saved;
  } catch (error) {
    console.error('[site] CMS banner settings could not be read', error);
    return {};
  }
});

/**
 * A saved override uses only its own CMS image and alt text.
 */
export function bannerPhoto(saved: SavedBanners, key: BannerPageKey): PhotoSlot | null {
  const banner = saved[key];
  if (!banner) return null;
  return {
    src: banner.src,
    alt: {
      ar: banner.altAr,
      en: banner.altEn,
    },
    // next/image fills the frame, so this is the intrinsic size a custom upload is
    // assumed to have; the focal point stays centred like the authored hero.
    width: 1600,
    height: 1067,
    focal: '50% 50%',
  };
}

/** The page's published banner, or null when the CMS has none. */
export async function getBanner(key: BannerPageKey): Promise<PhotoSlot | null> {
  return bannerPhoto(await readBanners(), key);
}

/** The override alone — for the home slider, which keeps its slides when none is saved. */
export async function getBannerOverride(key: BannerPageKey): Promise<PhotoSlot | null> {
  return bannerPhoto(await readBanners(), key);
}
