/**
 * The read side of the editable banners.
 *
 * One query per render, not per page: `readBanners()` returns every saved override and
 * each page asks for its own key. A database that cannot be reached is the same answer
 * as an empty group — the authored photo — because a banner is decoration and must
 * never be the reason a public page fails to render.
 */
import { cache } from 'react';
import { db } from '../db';
import type { PhotoSlot } from '../images';
import {
  BANNER_DEFAULTS,
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
  } catch {
    return {};
  }
});

/**
 * A saved override keeps the authored alt text for any language the operator left
 * blank, so a photo swapped in a hurry cannot ship with no caption at all.
 */
export function bannerPhoto(saved: SavedBanners, key: BannerPageKey): PhotoSlot {
  const fallback = BANNER_DEFAULTS[key];
  const banner = saved[key];
  if (!banner) return fallback;
  return {
    src: banner.src,
    alt: {
      ar: banner.altAr || fallback.alt.ar,
      en: banner.altEn || fallback.alt.en,
    },
    // next/image fills the frame, so this is the intrinsic size a custom upload is
    // assumed to have; the focal point stays centred like the authored hero.
    width: 1600,
    height: 1067,
    focal: '50% 50%',
  };
}

/** The page's banner, overriding or authored. */
export async function getBanner(key: BannerPageKey): Promise<PhotoSlot> {
  return bannerPhoto(await readBanners(), key);
}

/** The override alone — for the home slider, which keeps its slides when none is saved. */
export async function getBannerOverride(key: BannerPageKey): Promise<PhotoSlot | null> {
  const saved = await readBanners();
  return saved[key] ? bannerPhoto(saved, key) : null;
}
