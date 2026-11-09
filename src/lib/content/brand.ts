/**
 * The brand profile, read once per request. An unreachable database is the defaults —
 * the shipped logo and the two social accounts — never a footer without links.
 */
import { cache } from 'react';
import { db } from '../db';
import { BRAND_DEFAULTS, BRAND_GROUP, BRAND_KEY, normalizeBrand, type BrandProfile } from './brand-shape';
import { HOME_LAYOUT_DEFAULTS, HOME_LAYOUT_GROUP, HOME_LAYOUT_KEY, normalizeHomeLayout, type HomeBandState } from './home-layout-shape';

async function readDocument(group: string, key: string): Promise<unknown> {
  const row = await db.selectFrom('settings').select('value').where('group_name', '=', group).where('setting_key', '=', key).executeTakeFirst();
  if (!row) return undefined;
  if (typeof row.value !== 'string') return row.value;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

/** The homepage's band order and visibility; the shipped order when nothing is saved. */
export const getHomeLayout = cache(async function getHomeLayout(): Promise<HomeBandState[]> {
  try {
    const value = await readDocument(HOME_LAYOUT_GROUP, HOME_LAYOUT_KEY);
    return value === undefined ? HOME_LAYOUT_DEFAULTS : normalizeHomeLayout(value);
  } catch {
    return HOME_LAYOUT_DEFAULTS;
  }
});

export const getBrandProfile = cache(async function getBrandProfile(): Promise<BrandProfile> {
  try {
    const row = await db
      .selectFrom('settings')
      .select('value')
      .where('group_name', '=', BRAND_GROUP)
      .where('setting_key', '=', BRAND_KEY)
      .executeTakeFirst();
    if (!row) return BRAND_DEFAULTS;
    let value: unknown = row.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return BRAND_DEFAULTS;
      }
    }
    return normalizeBrand(value);
  } catch {
    return BRAND_DEFAULTS;
  }
});
