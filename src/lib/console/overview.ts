/**
 * The Overview screen's numbers — every one of them a server-side aggregate.
 *
 * Three rules shape this file:
 *
 *   1. Nothing is invented. A visitor is a row in `stats_events` with a visitor hash;
 *      a lead is a row in `leads` that is not spam; a campaign is what the browser
 *      reported. When there is no data the screen says zero, and it says which panel is
 *      empty rather than drawing a flat line that looks like a decline.
 *   2. Nothing reads a whole table into JavaScript. Each panel is one GROUP BY over an
 *      indexed day range, and the widest range a person can ask for is 366 days.
 *   3. A number is only for a caller who may read its source. A count is still
 *      information, so a role without `lead.read` gets the traffic panels and no lead
 *      panel at all — the branch is `null`, not zero.
 *
 * The day boundary is Cairo's (`dayOf`), the same one ingestion writes. Leads written
 * before migration 011 have no `day` and fall back to `DATE(created_at)`, which is the
 * database server's own clock — the only honest answer for a row that never recorded
 * the clinic's day.
 */
import { overviewChecks, setupChecklist, type CheckKey, type SetupItem } from './overview-checks';
import { sql } from 'kysely';
import { db } from '../db';
import { can, type Grant, type Resource } from '../auth/permissions';
import { dayOf } from '../tracking/ingest';
import { LEAD_STATUSES, type LeadStatus } from '../leads/kinds';
import { listLeads } from '../leads/store';
import { leadRow, type LeadRow } from '../leads/view';
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

// ---------------------------------------------------------------------------
// Ranges

export const OVERVIEW_RANGES = ['today', '7d', '30d', '90d', 'custom'] as const;
export type RangeKey = (typeof OVERVIEW_RANGES)[number];

export const DEFAULT_RANGE: RangeKey = '30d';

/** A preset is a number of days *including today*: 7d is today and the six before it. */
const PRESET_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

/** A year is the widest a custom range may ask for; a decade of GROUP BY would not be. */
export const MAX_CUSTOM_DAYS = 366;

export interface OverviewRange {
  key: RangeKey;
  from: string;
  to: string;
  days: number;
}

export interface OverviewQuery {
  range: OverviewRange;
  compare: boolean;
}

export interface OverviewIssue {
  path: string;
  message: string;
}

export interface InvalidOverviewQuery {
  error: 'invalid_input';
  issues: OverviewIssue[];
}

const DAY_MS = 86_400_000;

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}

/** Calendar arithmetic on a DATE, in UTC so the server's timezone cannot move a day. */
export function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The range a preset names, ending today (the clinic's today, not the server's). */
export function rangeOf(key: RangeKey, today: string = dayOf()): OverviewRange {
  const days = key === 'custom' ? 1 : PRESET_DAYS[key];
  return { key, from: shiftDay(today, -(days - 1)), to: today, days };
}

/**
 * `?range=30d&compare=1`, or `?range=custom&from=2026-09-01&to=2026-09-30`.
 * Unknown terms are refused rather than guessed, and a custom range wider than a year
 * is a 400 — the cost of the queries is the caller's to bound, not the server's.
 */
export function parseOverviewQuery(search: URLSearchParams, today: string = dayOf()): OverviewQuery | InvalidOverviewQuery {
  const rawRange = (search.get('range') ?? '').trim() || DEFAULT_RANGE;
  const compare = ['1', 'true', 'on'].includes((search.get('compare') ?? '').trim().toLowerCase());

  if (rawRange === 'custom') {
    const from = (search.get('from') ?? '').trim();
    const to = (search.get('to') ?? '').trim();
    const issues: OverviewIssue[] = [];
    if (!isDay(from)) issues.push({ path: 'from', message: 'invalid_date' });
    if (!isDay(to)) issues.push({ path: 'to', message: 'invalid_date' });
    if (issues.length === 0) {
      if (to < from) issues.push({ path: 'to', message: 'before_from' });
      else if (daysBetween(from, to) > MAX_CUSTOM_DAYS) issues.push({ path: 'to', message: 'too_long' });
    }
    if (issues.length > 0) return { error: 'invalid_input', issues };
    return { range: { key: 'custom', from, to, days: daysBetween(from, to) }, compare };
  }

  if (!(OVERVIEW_RANGES as readonly string[]).includes(rawRange)) {
    return { error: 'invalid_input', issues: [{ path: 'range', message: 'unknown_range' }] };
  }
  return { range: rangeOf(rawRange as RangeKey, today), compare };
}

/** The same parser for a server page, which is handed the query as an object. */
export function parseOverviewSearch(
  search: Record<string, string | string[] | undefined> | undefined,
  today: string = dayOf(),
): OverviewQuery | InvalidOverviewQuery {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(search ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(name, first);
  }
  return parseOverviewQuery(params, today);
}

/** What the screen shows when the address names no period it can honour. */
export function defaultOverviewQuery(today: string = dayOf()): OverviewQuery {
  return { range: rangeOf(DEFAULT_RANGE, today), compare: false };
}

/** The same length, immediately before: the only fair thing to compare a range with. */
export function previousRange(range: OverviewRange): { from: string; to: string } {
  return { from: shiftDay(range.from, -range.days), to: shiftDay(range.from, -1) };
}

// ---------------------------------------------------------------------------
// Shapes the screen draws

export interface DailyPoint {
  day: string;
  views: number;
  visitors: number;
  leads: number;
}

export interface EngagementPoint {
  day: string;
  cta: number;
  submit: number;
}

export type KpiKey = 'visitors' | 'views' | 'leads' | 'conversion';

export interface Kpi {
  key: KpiKey;
  value: number;
  /** null when there is no comparison to show, which is not the same as zero */
  previous: number | null;
  /** a relative change for counts, a difference in points for the conversion rate */
  delta: number | null;
  unit: 'count' | 'percent';
  /** one number per day of the current range, oldest first */
  series: number[];
}

export interface Slice {
  label: string;
  value: number;
}

export interface Counting {
  label: string;
  count: number;
}

export interface TopPage {
  path: string;
  views: number;
  visitors: number;
}

export interface TopArticle extends TopPage {
  slug: string;
  titleAr: string;
  titleEn: string;
}

export interface CityRow {
  city: string;
  views: number;
  visitors: number;
}

export interface DeviceRow {
  device: string;
  views: number;
  leads: number;
}

export interface HeatCell {
  /** 0 = Sunday, as the clinic's week starts */
  weekday: number;
  hour: number;
  views: number;
}

export interface AttentionRow {
  key: 'overview.attention.unanswered' | 'overview.attention.unattributed' | 'overview.attention.booked' | CheckKey;
  count: number;
  href: string;
}

export interface ActionLink {
  key: MessageKey;
  href: string;
}

export interface LeadBlocks {
  funnel: Slice[];
  statuses: { status: LeadStatus; count: number }[];
  sources: Slice[];
  campaigns: Slice[];
  services: Slice[];
  branches: Slice[];
  devices: DeviceRow[];
  topPages: Counting[];
  recent: LeadRow[];
}

export interface OverviewData {
  generatedAt: string;
  range: OverviewRange & { today: string };
  previous: { from: string; to: string } | null;
  compare: boolean;
  kpis: Kpi[];
  daily: DailyPoint[];
  previousDaily: DailyPoint[] | null;
  engagement: EngagementPoint[];
  heatmap: { cells: HeatCell[]; placed: number; missing: number };
  topPages: TopPage[];
  topArticles: TopArticle[];
  /** visitors by campaign source; the donut falls back to this when leads are not readable */
  sources: Slice[];
  /** which of the two the donut is counting, so the screen can name the unit */
  sourcesBasis: 'visits' | 'leads';
  cities: CityRow[];
  devices: DeviceRow[];
  leads: LeadBlocks | null;
  attention: AttentionRow[];
  /** The site setup checklist, for the accounts that run the site; null for everyone else. */
  setup: SetupItem[] | null;
  library: OverviewRow[];
  quickActions: ActionLink[];
  canExport: boolean;
}

// ---------------------------------------------------------------------------
// Query helpers

/** A stored path without a language prefix, so `/en/blogs/x` counts with `/blogs/x`. */
const NORM_PATH = sql<string>`CASE WHEN path LIKE '/ar/%' THEN SUBSTRING(path, 4) WHEN path LIKE '/en/%' THEN SUBSTRING(path, 4) ELSE path END`;

const LEAD_DAY = sql<string>`COALESCE(day, DATE(created_at))`;

interface DayCount {
  d: string;
  n: number;
}

function number(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) out.push(day);
  return out;
}

/** Insert the days with no row as zeros, so a flat chart is a fact and not a gap. */
function fillDays(days: string[], rows: DayCount[]): Map<string, number> {
  const found = new Map(rows.map((row) => [row.d, number(row.n)]));
  return new Map(days.map((day) => [day, found.get(day) ?? 0]));
}

/** A blank label is not missing data: it is Direct, and the screen says so. */
function slices(rows: { label: string | null; n: number }[]): Slice[] {
  return rows.map((row) => ({ label: (row.label ?? '').trim(), value: number(row.n) }));
}

// ---------------------------------------------------------------------------
// The cache

/**
 * One minute, as the brief asks: the numbers do not move faster than a person can
 * refresh, and every request in that minute costs one round of aggregate queries
 * instead of one per browser. The key carries the caller's grants because the recent
 * leads and the library counts differ per role — a shared entry would hand one role
 * another's slice.
 */
export const OVERVIEW_CACHE_MS = 60_000;
const CACHE_MAX = 64;
const cache = new Map<string, { at: number; data: OverviewData }>();

export function clearOverviewCache(): void {
  cache.clear();
}

function grantKey(grants: readonly Grant[]): string {
  return grants
    .map((grant) => `${grant.resource}:${grant.action}:${grant.scope ? JSON.stringify(grant.scope) : '*'}`)
    .sort()
    .join('|');
}

// ---------------------------------------------------------------------------
// The one entry point

export async function overviewData(input: {
  query: OverviewQuery;
  grants: readonly Grant[];
  now?: Date;
}): Promise<OverviewData> {
  const { query, grants } = input;
  const now = input.now ?? new Date();
  const today = dayOf(now);
  const key = `${query.range.key}:${query.range.from}:${query.range.to}:${query.compare ? 1 : 0}:${grantKey(grants)}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < OVERVIEW_CACHE_MS) return hit.data;

  const data = await buildOverview({ query, grants, now, today });
  cache.set(key, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return data;
}

async function buildOverview(input: {
  query: OverviewQuery;
  grants: readonly Grant[];
  now: Date;
  today: string;
}): Promise<OverviewData> {
  const { query, grants, now, today } = input;
  const { range, compare } = query;
  const previous = compare ? previousRange(range) : null;
  const scanFrom = previous ? previous.from : range.from;

  const days = dayList(range.from, range.to);
  const previousDays = previous ? dayList(previous.from, previous.to) : [];

  const leadVisible = can(grants, 'lead', 'read', {});
  const pageVisible = can(grants, 'page', 'read', {});

  const [
    trafficRows,
    leadDayRows,
    engagementRows,
    topPageRows,
    deviceRows,
    cityRows,
    trafficSourceRows,
    sourceRows,
    statusRows,
    campaignRows,
    serviceRows,
    branchRows,
    leadDeviceRows,
    leadPageRows,
    heatRows,
    heatCoverage,
    staleNew,
    unattributed,
    staleBooked,
    recent,
    library,
  ] = await Promise.all([
    sql<{ d: string; views: number; visitors: number }>`
      SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${scanFrom} AND ${range.to}
      GROUP BY day
    `.execute(db),
    leadVisible
      ? sql<DayCount>`
          SELECT DATE_FORMAT(${LEAD_DAY}, '%Y-%m-%d') AS d, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${scanFrom} AND ${range.to}
          GROUP BY d
        `.execute(db)
      : Promise.resolve({ rows: [] as DayCount[] }),
    sql<{ d: string; t: string; n: number }>`
      SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, event_type AS t, COUNT(*) AS n
      FROM stats_events
      WHERE bot = 0 AND event_type IN ('cta_click', 'form_submit') AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY day, event_type
    `.execute(db),
    sql<{ p: string; views: number; visitors: number }>`
      SELECT ${NORM_PATH} AS p, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY p
      ORDER BY views DESC
      LIMIT 12
    `.execute(db),
    sql<{ device: string; views: number }>`
      SELECT device, COUNT(*) AS views
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY device
    `.execute(db),
    sql<{ city: string; views: number; visitors: number }>`
      SELECT city, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY city
      ORDER BY views DESC
      LIMIT 8
    `.execute(db),
    sql<{ label: string | null; n: number }>`
      SELECT utm_source AS label, COUNT(DISTINCT visitor_hash) AS n
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY utm_source
      ORDER BY n DESC
      LIMIT 8
    `.execute(db),
    leadVisible
      ? sql<{ label: string | null; n: number }>`
          SELECT utm_source AS label, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY utm_source
          ORDER BY n DESC
          LIMIT 8
        `.execute(db)
      : Promise.resolve({ rows: [] as { label: string | null; n: number }[] }),
    leadVisible
      ? sql<{ status: string; n: number }>`
          SELECT status, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY status
        `.execute(db)
      : Promise.resolve({ rows: [] as { status: string; n: number }[] }),
    leadVisible
      ? sql<{ label: string | null; n: number }>`
          SELECT utm_campaign AS label, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND utm_campaign <> '' AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY utm_campaign
          ORDER BY n DESC
          LIMIT 6
        `.execute(db)
      : Promise.resolve({ rows: [] as { label: string | null; n: number }[] }),
    leadVisible
      ? sql<{ label: string | null; n: number }>`
          SELECT JSON_UNQUOTE(JSON_EXTRACT(fields, '$.service')) AS label, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND fields IS NOT NULL AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY label
          ORDER BY n DESC
          LIMIT 6
        `.execute(db)
      : Promise.resolve({ rows: [] as { label: string | null; n: number }[] }),
    leadVisible
      ? sql<{ label: string | null; n: number }>`
          SELECT JSON_UNQUOTE(JSON_EXTRACT(fields, '$.branch')) AS label, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND fields IS NOT NULL AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY label
          ORDER BY n DESC
          LIMIT 6
        `.execute(db)
      : Promise.resolve({ rows: [] as { label: string | null; n: number }[] }),
    leadVisible
      ? sql<{ device: string; n: number }>`
          SELECT device, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY device
        `.execute(db)
      : Promise.resolve({ rows: [] as { device: string; n: number }[] }),
    leadVisible
      ? sql<{ label: string; n: number }>`
          SELECT CASE WHEN page_path = '' THEN '/' ELSE page_path END AS label, COUNT(*) AS n
          FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
          GROUP BY label
          ORDER BY n DESC
          LIMIT 6
        `.execute(db)
      : Promise.resolve({ rows: [] as { label: string; n: number }[] }),
    sql<{ w: number; h: number; n: number }>`
      SELECT DAYOFWEEK(day) - 1 AS w, hour AS h, COUNT(*) AS n
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND hour IS NOT NULL AND day BETWEEN ${range.from} AND ${range.to}
      GROUP BY w, h
    `.execute(db),
    sql<{ placed: number; missing: number }>`
      SELECT SUM(hour IS NOT NULL) AS placed, SUM(hour IS NULL) AS missing
      FROM stats_events
      WHERE bot = 0 AND event_type = 'page_view' AND day BETWEEN ${range.from} AND ${range.to}
    `.execute(db),
    leadVisible
      ? sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM leads
          WHERE spam = 0 AND status = 'new' AND created_at < NOW() - INTERVAL 24 HOUR
        `.execute(db)
      : Promise.resolve({ rows: [] as { n: number }[] }),
    leadVisible
      ? sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM leads
          WHERE spam = 0 AND ${LEAD_DAY} BETWEEN ${range.from} AND ${range.to}
            AND utm_source = '' AND gclid = '' AND fbclid = '' AND first_referrer = '' AND referrer = ''
        `.execute(db)
      : Promise.resolve({ rows: [] as { n: number }[] }),
    leadVisible
      ? sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM leads
          WHERE spam = 0 AND status = 'booked' AND created_at < NOW() - INTERVAL 7 DAY
        `.execute(db)
      : Promise.resolve({ rows: [] as { n: number }[] }),
    leadVisible ? listLeads({ status: null, source: null, q: '', page: 1, per: 8 }) : Promise.resolve(null),
    overviewRows(grants),
  ]);

  const viewsByDay = fillDays([...previousDays, ...days], trafficRows.rows.map((row) => ({ d: row.d, n: row.views })));
  const visitorsByDay = fillDays([...previousDays, ...days], trafficRows.rows.map((row) => ({ d: row.d, n: row.visitors })));
  const leadsByDay = fillDays([...previousDays, ...days], leadDayRows.rows);

  const currentPoint = (day: string): DailyPoint => ({
    day,
    views: viewsByDay.get(day) ?? 0,
    visitors: visitorsByDay.get(day) ?? 0,
    leads: leadsByDay.get(day) ?? 0,
  });
  const daily = days.map(currentPoint);
  const previousDaily = previous ? previousDays.map(currentPoint) : null;

  const sum = (points: DailyPoint[], pick: (point: DailyPoint) => number): number => points.reduce((total, point) => total + pick(point), 0);
  const currentViews = sum(daily, (p) => p.views);
  const currentVisitors = sum(daily, (p) => p.visitors);
  const currentLeads = sum(daily, (p) => p.leads);
  const previousViews = previousDaily ? sum(previousDaily, (p) => p.views) : null;
  const previousVisitors = previousDaily ? sum(previousDaily, (p) => p.visitors) : null;
  const previousLeads = previousDaily ? sum(previousDaily, (p) => p.leads) : null;

  const rate = (leads: number, visitors: number): number =>
    visitors > 0 ? Math.round((leads / visitors) * 1000) / 10 : 0;
  const currentRate = rate(currentLeads, currentVisitors);
  const previousRate = previousDaily ? rate(previousLeads ?? 0, previousVisitors ?? 0) : null;

  /** A relative change for a count; null when the base is zero, because ∞ is not a number. */
  const change = (value: number, before: number | null): number | null =>
    before === null || before === 0 ? null : Math.round(((value - before) / before) * 1000) / 10;
  /** Points for a rate: 4% against 2% is +2 points, not +100%. */
  const points = (value: number, before: number | null): number | null =>
    before === null ? null : Math.round((value - before) * 10) / 10;

  const series = (pick: (point: DailyPoint) => number): number[] => daily.map(pick);

  const kpis: Kpi[] = [
    { key: 'visitors', value: currentVisitors, previous: previousVisitors, delta: change(currentVisitors, previousVisitors), unit: 'count', series: series((p) => p.visitors) },
    { key: 'views', value: currentViews, previous: previousViews, delta: change(currentViews, previousViews), unit: 'count', series: series((p) => p.views) },
    { key: 'leads', value: currentLeads, previous: previousLeads, delta: change(currentLeads, previousLeads), unit: 'count', series: series((p) => p.leads) },
    { key: 'conversion', value: currentRate, previous: previousRate, delta: points(currentRate, previousRate), unit: 'percent', series: daily.map((p) => rate(p.leads, p.visitors)) },
  ];

  const engagementByDay = new Map<string, EngagementPoint>(
    days.map((day) => [day, { day, cta: 0, submit: 0 }]),
  );
  for (const row of engagementRows.rows) {
    const point = engagementByDay.get(row.d);
    if (!point) continue;
    if (row.t === 'cta_click') point.cta += number(row.n);
    else if (row.t === 'form_submit') point.submit += number(row.n);
  }
  const engagement = [...engagementByDay.values()];

  // The paths that are articles vs the pages that are not: one dimension query over 94
  // rows is cheaper than a LIKE per row, and a slug that names no article stays a page.
  const topPages: TopPage[] = [];
  const articlePaths = topPageRows.rows.filter((row) => row.p.startsWith('/blogs/'));
  const articleSlugs = articlePaths.map((row) => row.p.slice('/blogs/'.length));
  const titles = articleSlugs.length > 0
    ? await db
        .selectFrom('articles')
        .select(['slug', 'title_ar', 'title_en'])
        .where('slug', 'in', articleSlugs)
        .where('deleted_at', 'is', null)
        .execute()
    : [];
  const titleOf = new Map(titles.map((row) => [row.slug, { ar: row.title_ar ?? '', en: row.title_en ?? '' }]));
  const topArticles: TopArticle[] = [];
  for (const row of topPageRows.rows) {
    if (row.p === '/') {
      topPages.push({ path: row.p, views: number(row.views), visitors: number(row.visitors) });
      continue;
    }
    if (row.p.startsWith('/blogs/')) {
      const slug = row.p.slice('/blogs/'.length);
      const title = titleOf.get(slug);
      if (title) {
        topArticles.push({ slug, path: row.p, views: number(row.views), visitors: number(row.visitors), titleAr: title.ar, titleEn: title.en });
        continue;
      }    }
    topPages.push({ path: row.p, views: number(row.views), visitors: number(row.visitors) });
  }

  const leadDevices = new Map(leadDeviceRows.rows.map((row) => [row.device, number(row.n)]));
  const eventDevices = new Map(deviceRows.rows.map((row) => [row.device, number(row.views)]));
  const devices: DeviceRow[] = ['mobile', 'desktop', 'tablet', 'unknown']
    .map((device) => ({ device, views: eventDevices.get(device) ?? 0, leads: leadDevices.get(device) ?? 0 }))
    .filter((row) => row.views > 0 || row.leads > 0);

  const statusCounts = new Map(statusRows.rows.map((row) => [row.status, number(row.n)]));
  const statuses = LEAD_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }));

  const leads: LeadBlocks | null = leadVisible
    ? {
        statuses,
        funnel: statuses.map((row) => ({ label: row.status, value: row.count })),
        sources: slices(sourceRows.rows),
        campaigns: slices(campaignRows.rows),
        services: slices(serviceRows.rows),
        branches: slices(branchRows.rows),
        devices,
        topPages: leadPageRows.rows.map((row) => ({ label: row.label, count: number(row.n) })),
        recent: (recent?.rows ?? []).map((row) => leadRow(grants, row)),
      }
    : null;

  const coverage = heatCoverage.rows[0];
  const heatmap = {
    cells: heatRows.rows.map((row) => ({ weekday: number(row.w), hour: number(row.h), views: number(row.n) })),
    placed: number(coverage?.placed),
    missing: number(coverage?.missing),
  };

  const [checks, setup] = await Promise.all([overviewChecks(grants, today), setupChecklist(grants)]);
  const leadAttention: AttentionRow[] = leadVisible
    ? [
        { key: 'overview.attention.unanswered' as const, count: number(staleNew.rows[0]?.n), href: '/console/leads?status=new' },
        { key: 'overview.attention.unattributed' as const, count: number(unattributed.rows[0]?.n), href: '/console/leads' },
        { key: 'overview.attention.booked' as const, count: number(staleBooked.rows[0]?.n), href: '/console/leads?status=booked' },
      ].filter((row) => row.count > 0)
    : [];
  const attention: AttentionRow[] = [...leadAttention, ...checks];

  const quickActions: ActionLink[] = [];
  if (can(grants, 'article', 'read', {})) quickActions.push({ key: 'nav.articles', href: '/console/articles' });
  if (can(grants, 'offer', 'read', {})) quickActions.push({ key: 'nav.offers', href: '/console/offers' });
  if (leadVisible) quickActions.push({ key: 'nav.leads', href: '/console/leads' });
  if (pageVisible) {
    quickActions.push({ key: 'nav.hero', href: '/console/hero' });
    quickActions.push({ key: 'nav.texts', href: '/console/texts' });
  }
  if (can(grants, 'setting', 'read', {})) quickActions.push({ key: 'nav.settings', href: '/console/settings' });

  return {
    generatedAt: now.toISOString(),
    range: { ...range, today },
    previous,
    compare,
    kpis,
    daily,
    previousDaily,
    engagement,
    heatmap,
    topPages: topPages.slice(0, 8),
    topArticles: topArticles.slice(0, 8),
    sources: slices(leadVisible ? sourceRows.rows : trafficSourceRows.rows),
    sourcesBasis: leadVisible ? 'leads' : 'visits',
    cities: cityRows.rows.map((row) => ({ city: row.city ?? '', views: number(row.views), visitors: number(row.visitors) })),
    devices,
    leads,
    attention,
    setup,
    library,
    quickActions,
    canExport: can(grants, 'stat', 'export', {}),
  };
}
