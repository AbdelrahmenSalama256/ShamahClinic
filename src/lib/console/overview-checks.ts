/**
 * The dashboard's housekeeping, beside its traffic numbers: what is about to go wrong on
 * the site (offers running out, pages with no search words, broken links people keep
 * hitting) and how far the clinic is through setting the site up.
 *
 * Every check is scoped to what the caller may read, and every one fails quietly: a
 * missing table on a database that has not had its latest patch is "nothing to report",
 * not a dashboard that will not open.
 */
import { sql } from 'kysely';
import { can, type Grant } from '../auth/permissions';
import { db } from '../db';
import { getBrandProfile } from '../content/brand';
import { getSeoConfig } from '../content/seo-config';
import { planIsEmpty, planTags } from '../tracking/providers';
import { readTrackingConfig } from '../tracking/server';
import { seoCenterData } from './seo-center';

export type CheckKey =
  | 'overview.attention.offers_ending'
  | 'overview.attention.offers_expired'
  | 'overview.attention.seo_missing'
  | 'overview.attention.not_found';

export interface CheckRow {
  key: CheckKey;
  count: number;
  href: string;
}

export type SetupKey =
  | 'overview.setup.tracking'
  | 'overview.setup.verification'
  | 'overview.setup.indexing'
  | 'overview.setup.whatsapp'
  | 'overview.setup.socials'
  | 'overview.setup.share_image';

export interface SetupItem {
  key: SetupKey;
  done: boolean;
  href: string;
}

const quiet = async <T>(work: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await work();
  } catch {
    return fallback;
  }
};

function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The housekeeping rows for "Needs attention", with zero-count rows already dropped. */
export async function overviewChecks(grants: readonly Grant[], today: string): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];

  if (can(grants, 'offer', 'read', {})) {
    const live = () =>
      db
        .selectFrom('offers')
        .select(sql<number>`COUNT(*)`.as('n'))
        .where('status', '=', 'published')
        .where('enabled', '=', 1)
        .where('deleted_at', 'is', null);
    const [ending, expired] = await Promise.all([
      quiet(async () => (await live().where('ends_at', '>=', today).where('ends_at', '<=', plusDays(today, 7)).executeTakeFirst())?.n, 0),
      quiet(async () => (await live().where('ends_at', '<', today).executeTakeFirst())?.n, 0),
    ]);
    rows.push({ key: 'overview.attention.offers_ending', count: Number(ending ?? 0), href: '/console/offers' });
    rows.push({ key: 'overview.attention.offers_expired', count: Number(expired ?? 0), href: '/console/offers' });
  }

  if (can(grants, 'seo', 'read', {})) {
    const missing = await quiet(async () => {
      const [ar, en] = await Promise.all([seoCenterData({ grants, locale: 'ar' }), seoCenterData({ grants, locale: 'en' })]);
      return (ar?.rows.filter((row) => row.status === 'missing').length ?? 0) + (en?.rows.filter((row) => row.status === 'missing').length ?? 0);
    }, 0);
    rows.push({ key: 'overview.attention.seo_missing', count: missing, href: '/console/seo' });
  }

  if (can(grants, 'redirect', 'read', {})) {
    // A broken link that keeps being hit and still has no redirect.
    const broken = await quiet(async () => {
      const row = await db
        .selectFrom('not_found_log')
        .leftJoin('redirects', (join) => join.onRef('redirects.source_path', '=', 'not_found_log.path').on('redirects.deleted_at', 'is', null))
        .select(sql<number>`COUNT(*)`.as('n'))
        .where('not_found_log.hits', '>=', 3)
        .where('redirects.id', 'is', null)
        .executeTakeFirst();
      return Number(row?.n ?? 0);
    }, 0);
    rows.push({ key: 'overview.attention.not_found', count: broken, href: '/console/redirects?tab=missing' });
  }

  return rows.filter((row) => row.count > 0);
}

/** The setup checklist, for the accounts that run the site; null for everyone else. */
export async function setupChecklist(grants: readonly Grant[]): Promise<SetupItem[] | null> {
  if (!can(grants, 'setting', 'read', {})) return null;
  const [tracking, seo, brand, whatsapp] = await Promise.all([
    quiet(async () => !planIsEmpty(planTags(await readTrackingConfig())), false),
    quiet(() => getSeoConfig(), null),
    quiet(() => getBrandProfile(), null),
    quiet(async () => {
      const row = await db.selectFrom('settings').select('value').where('group_name', '=', 'site').where('setting_key', '=', 'whatsapp').executeTakeFirst();
      return typeof row?.value === 'string' ? row.value.replace(/[^\d]/g, '').length >= 8 : false;
    }, false),
  ]);
  return [
    { key: 'overview.setup.tracking', done: tracking, href: '/console/tracking' },
    { key: 'overview.setup.verification', done: !!seo?.verification.google, href: '/console/seo?view=settings' },
    { key: 'overview.setup.indexing', done: seo?.indexing !== false, href: '/console/seo?view=settings' },
    { key: 'overview.setup.whatsapp', done: whatsapp, href: '/console/settings#settings-site' },
    { key: 'overview.setup.socials', done: (brand?.socials.length ?? 0) > 0, href: '/console/settings#settings-brand' },
    { key: 'overview.setup.share_image', done: !!seo?.defaultOgImage, href: '/console/seo?view=settings' },
  ];
}
