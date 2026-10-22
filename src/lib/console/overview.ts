import { db } from '../db';
import { can, type Grant, type Resource } from '../auth/permissions';
import type { MessageKey } from './messages';

type CountedTable = 'articles' | 'offers' | 'pages' | 'lists' | 'media' | 'leads' | 'users';

interface Counted {
  resource: Resource;
  table: CountedTable;
  label: MessageKey;
}

/** What the console can see today. Each BK adds its own numbers to the overview. */
const COUNTED: readonly Counted[] = [
  { resource: 'article', table: 'articles', label: 'overview.articles' },
  { resource: 'offer', table: 'offers', label: 'overview.offers' },
  { resource: 'page', table: 'pages', label: 'overview.pages' },
  { resource: 'list', table: 'lists', label: 'overview.lists' },
  { resource: 'media', table: 'media', label: 'overview.media' },
  { resource: 'lead', table: 'leads', label: 'overview.leads' },
  { resource: 'user', table: 'users', label: 'overview.users' },
];

export interface OverviewRow {
  resource: Resource;
  label: MessageKey;
  count: number;
}

async function countActive(table: CountedTable): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Rows only for the resources this caller may read — a count is still information. */
export async function overviewRows(grants: readonly Grant[]): Promise<OverviewRow[]> {
  const visible = COUNTED.filter((entry) => can(grants, entry.resource, 'read', {}));
  return Promise.all(visible.map(async (entry) => ({ resource: entry.resource, label: entry.label, count: await countActive(entry.table) })));
}
