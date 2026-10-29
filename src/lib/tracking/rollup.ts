/**
 * The daily tables the console reads instead of scanning events.
 *
 * Every function here recomputes a closed day from `stats_events` and replaces that
 * day's rows, so a run is idempotent: a crashed run, a second instance and a manual
 * retry all converge on the same numbers. Today is never rolled up — the day is still
 * open, and an overview that reads yesterday from a table and today from events would
 * show two different definitions of a visit on one screen.
 *
 * Bots are excluded everywhere (`bot = 0`). A visitor is `COUNT(DISTINCT visitor_hash)`,
 * which is a day-salted hash: "returning tomorrow" is not a fact these tables can hold,
 * and they do not pretend to.
 *
 * Raw events are kept for 400 days and then deleted. The daily rows are kept: they hold
 * no address, no hash and no id, only counts, so they are not personal data and a
 * year-over-year comparison stays possible.
 */
import { sql } from 'kysely';
import { db } from '../db';
import { dayOf, RETENTION_DAYS } from './ingest';

/** The first day the clinic could have recorded anything. */
const FIRST_DAY = '2020-01-01';

function dayString(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);
}

/** Replace every rollup row for the days in [from, to]. */
export async function recomputeDays(from: string, to: string): Promise<string[]> {
  if (!from || !to || from > to) return [];
  const logs: string[] = [];

  await sql`DELETE FROM stats_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_daily (day, path, locale, views, visitors)
    SELECT day, path, locale, COUNT(*), COUNT(DISTINCT visitor_hash)
      FROM stats_events
     WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${from} AND ${to}
     GROUP BY day, path, locale
  `.execute(db);
  logs.push(`stats_daily ${from}..${to}`);

  await sql`DELETE FROM stats_referrers_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_referrers_daily (day, host, views, visitors)
    SELECT day, referrer_host, COUNT(*), COUNT(DISTINCT visitor_hash)
      FROM stats_events
     WHERE bot = 0 AND event_type = 'page_view' AND referrer_host <> '' AND day BETWEEN ${from} AND ${to}
     GROUP BY day, referrer_host
  `.execute(db);

  await sql`DELETE FROM stats_cta_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_cta_daily (day, cta_key, clicks)
    SELECT day, cta_key, COUNT(*)
      FROM stats_events
     WHERE bot = 0 AND event_type = 'cta_click' AND cta_key <> '' AND day BETWEEN ${from} AND ${to}
     GROUP BY day, cta_key
  `.execute(db);

  await sql`DELETE FROM stats_named_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_named_daily (day, event_type, events, sessions)
    SELECT day, event_type, COUNT(*), COUNT(DISTINCT session_hash)
      FROM stats_events
     WHERE bot = 0 AND day BETWEEN ${from} AND ${to}
     GROUP BY day, event_type
  `.execute(db);

  await sql`DELETE FROM stats_sources_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_sources_daily (day, source, medium, campaign, views, visitors)
    SELECT day, utm_source, utm_medium, utm_campaign, COUNT(*), COUNT(DISTINCT visitor_hash)
      FROM stats_events
     WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${from} AND ${to}
     GROUP BY day, utm_source, utm_medium, utm_campaign
  `.execute(db);

  await sql`DELETE FROM stats_geo_daily WHERE day BETWEEN ${from} AND ${to}`.execute(db);
  await sql`
    INSERT INTO stats_geo_daily (day, city, views, visitors)
    SELECT day, city, COUNT(*), COUNT(DISTINCT visitor_hash)
      FROM stats_events
     WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${from} AND ${to}
     GROUP BY day, city
  `.execute(db);

  return logs;
}

/** Delete raw events past the retention window; the daily counts stay. */
export async function pruneEvents(now: Date = new Date()): Promise<number> {
  const cutoff = dayOf(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
  const result = await sql`DELETE FROM stats_events WHERE day < ${cutoff}`.execute(db);
  return Number(result.numAffectedRows ?? 0);
}

export interface MaintenanceResult {
  /** first and last day whose rollup was rebuilt; both empty when there was nothing new */
  from: string;
  to: string;
  pruned: number;
}

/**
 * What a scheduler or an opportunistic call runs: roll up every closed day that received
 * events since the last run, prune the window, and record where the rollup got to.
 *
 * Only days with new events are rebuilt. Recomputing a span would wipe days whose raw
 * events were pruned long ago, and a rebuilt-from-nothing day reads as zero traffic.
 *
 * The state row holds the highest event id *of a closed day*. Today's events stay above
 * it on purpose, so tomorrow's run starts at today rather than skipping it.
 */
export async function maintain(now: Date = new Date()): Promise<MaintenanceResult> {
  const yesterday = dayOf(new Date(now.getTime() - 86_400_000));
  const state = await db
    .selectFrom('stats_rollup_state')
    .select('last_event_id')
    .where('id', '=', 1)
    .executeTakeFirst();
  const lastEventId = Number(state?.last_event_id ?? 0);

  const pending = await sql<{ day: unknown }>`
    SELECT DISTINCT day
      FROM stats_events
     WHERE id > ${lastEventId} AND day <= ${yesterday}
     ORDER BY day
  `.execute(db);
  const days = pending.rows.map((row) => dayString(row.day)).filter((day) => day >= FIRST_DAY);
  for (const day of days) await recomputeDays(day, day);

  const pruned = await pruneEvents(now);

  const closed = await sql<{ last: unknown }>`SELECT MAX(id) AS last FROM stats_events WHERE day <= ${yesterday}`.execute(db);
  const lastClosed = closed.rows[0]?.last;
  if (lastClosed !== null && lastClosed !== undefined) {
    await db
      .updateTable('stats_rollup_state')
      .set({ last_event_id: Number(lastClosed), last_run_at: new Date() })
      .where('id', '=', 1)
      .execute();
  } else {
    await db.updateTable('stats_rollup_state').set({ last_run_at: new Date() }).where('id', '=', 1).execute();
  }

  return { from: days[0] ?? '', to: days[days.length - 1] ?? '', pruned };
}
