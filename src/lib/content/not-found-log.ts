/**
 * The 404 monitor: every address a visitor or crawler asked for that the site could not
 * answer, counted once per address. The not-found page records the hit on the server, so
 * a crawler that never runs JavaScript — which is most of what finds an old WordPress URL —
 * is counted too.
 *
 * Scanner probes (`/wp-login.php`, `/.env`) are dropped before they reach the table, and
 * the table stops taking *new* addresses at 5000 rows, so a burst of junk cannot grow it
 * without limit; the addresses already in it keep counting.
 */
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db';
import { isProbePath, normalizeRedirectPath } from './redirect-rules';

const MAX_ROWS = 5000;

export interface NotFoundView {
  id: string;
  path: string;
  referrer: string;
  hits: number;
  firstSeen: string;
  lastSeen: string;
}

const hashOf = (path: string) => createHash('sha256').update(path).digest('hex');

/** Records one miss. Never throws: the visitor is already being shown the 404 page. */
export async function recordNotFound(rawPath: string, referrer: string | null): Promise<void> {
  try {
    const path = normalizeRedirectPath(rawPath);
    if (!path || isProbePath(path)) return;
    const from = (referrer ?? '').slice(0, 500);
    const hash = hashOf(path);
    const updated = await db
      .updateTable('not_found_log')
      .set({
        hits: sql<number>`hits + 1`,
        last_seen_at: new Date(),
        ...(from ? { referrer: from } : {}),
      })
      .where('path_hash', '=', hash)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) > 0) return;
    const count = await db.selectFrom('not_found_log').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirst();
    if (Number(count?.n ?? 0) >= MAX_ROWS) return;
    await db
      .insertInto('not_found_log')
      .values({ id: randomUUID(), path_hash: hash, path, referrer: from })
      .onDuplicateKeyUpdate({ hits: sql<number>`hits + 1`, last_seen_at: new Date() })
      .execute();
  } catch {
    /* no table yet, or the database is down: the 404 page still renders */
  }
}

export async function listNotFound(limit = 500): Promise<NotFoundView[]> {
  const rows = await db
    .selectFrom('not_found_log')
    .select(['id', 'path', 'referrer', 'hits', 'first_seen_at', 'last_seen_at'])
    .orderBy('hits', 'desc')
    .orderBy('last_seen_at', 'desc')
    .limit(limit)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    referrer: row.referrer,
    hits: Number(row.hits),
    firstSeen: row.first_seen_at.toISOString(),
    lastSeen: row.last_seen_at.toISOString(),
  }));
}

export async function deleteNotFound(id: string | 'all'): Promise<number> {
  const query = id === 'all' ? db.deleteFrom('not_found_log') : db.deleteFrom('not_found_log').where('id', '=', id);
  const result = await query.executeTakeFirst();
  return Number(result.numDeletedRows);
}
