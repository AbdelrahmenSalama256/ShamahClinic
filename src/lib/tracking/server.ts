/**
 * The saved tracking rows, read once per request and turned into the plan the site
 * injects.
 *
 * A database that cannot be reached answers "no tags": a marketing script is the one
 * thing on the page whose absence is harmless, and the public site already promises to
 * render through an outage. The catch is deliberate and narrow.
 */
import { cache } from 'react';
import { db } from '../db';
import { normalizeConfig, planTags, type TagPlan, type TrackingConfig } from './providers';

export const TRACKING_GROUP = 'tracking';
export const TRACKING_KEY = 'providers';

/** MariaDB returns LONGTEXT; a future driver may hand back the parsed document. */
function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Uncached: the console reads what it just saved. */
export async function readTrackingConfig(): Promise<TrackingConfig> {
  try {
    const row = await db
      .selectFrom('settings')
      .select('value')
      .where('group_name', '=', TRACKING_GROUP)
      .where('setting_key', '=', TRACKING_KEY)
      .where('is_secret', '=', 0)
      .executeTakeFirst();
    return row ? normalizeConfig(decode(row.value)) : {};
  } catch {
    return {};
  }
}

export const getTrackingConfig = cache(readTrackingConfig);

export const getTrackingPlan = cache(async (): Promise<TagPlan> => planTags(await getTrackingConfig()));
