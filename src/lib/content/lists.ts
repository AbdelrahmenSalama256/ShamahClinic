/**
 * The repeatable lists the site renders — navigation, branches, specialists,
 * treatments, services, FAQ and result stories.
 *
 * `LIST_KEYS` in `src/lib/auth/roles.ts` is the vocabulary: the Editor's scoped
 * grants name these exact strings, so a list outside it is silently uneditable by
 * an Editor. This module is therefore the only place that creates `lists` rows, and
 * `npm run db:seed` calls it next to `syncRoles()` so the two vocabularies cannot
 * drift apart. Idempotent and dry-run by default, like every other mutating command
 * in this build.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { LIST_KEYS } from '../auth/roles';

export type ListKey = (typeof LIST_KEYS)[number];

/** Console labels; the editor reads these instead of a raw key. */
export const LIST_LABELS: Record<ListKey, { ar: string; en: string }> = {
  nav: { ar: 'القائمة العلوية', en: 'Header navigation' },
  branches: { ar: 'الفروع', en: 'Branches' },
  specialists: { ar: 'الأخصائيون', en: 'Specialists' },
  services: { ar: 'الخدمات', en: 'Services' },
  faq: { ar: 'الأسئلة الشائعة', en: 'Questions' },
  results: { ar: 'قصص النتائج', en: 'Result stories' },
};

export interface ListSyncRow {
  listKey: string;
  existed: boolean;
  label: string;
}

export interface ListSyncReport {
  database: string;
  dryRun: boolean;
  rows: ListSyncRow[];
}

/**
 * Create the `lists` rows the catalog names, and nothing else. A list that is no
 * longer in `LIST_KEYS` keeps its rows — this is content, and the never-delete rule
 * of this build covers it.
 */
export async function syncLists(options: { dryRun?: boolean; database: string }): Promise<ListSyncReport> {
  const dryRun = options.dryRun ?? true;
  const rows: ListSyncRow[] = [];

  for (const listKey of LIST_KEYS) {
    const label = LIST_LABELS[listKey].en;
    const existing = await db.selectFrom('lists').select(['id']).where('list_key', '=', listKey).executeTakeFirst();
    rows.push({ listKey, existed: Boolean(existing), label });
    if (existing || dryRun) continue;

    await db
      .insertInto('lists')
      .values({ id: randomUUID(), list_key: listKey, label, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: listKey === 'results' ? 1 : 0 })
      .execute();
  }

  return { database: options.database, dryRun, rows };
}
