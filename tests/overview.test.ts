/**
 * OV-7 — the Overview's numbers, proven rather than read.
 *
 * The screen is only as honest as the four things this file checks:
 *   1. Range math. A preset includes today, a custom range refuses a backwards or
 *      year-plus span, and "compare" asks for exactly the same length before it.
 *   2. The aggregates. Three visitors, four views and two leads on a quiet past day
 *      come back as 3/4/2, with bots, a spam lead and the wrong day all excluded —
 *      and the weekday/hour heatmap placed those views where the events say.
 *   3. The permission branch. A caller without `lead.read` gets `leads: null`, not a
 *      panel of zeros; a caller without `stat.read` gets a 403 before the query is
 *      even parsed.
 *   4. The minute cache and the CSV download, including the audit row that records
 *      what left the building.
 *
 * Every fixture is stamped `ovtest-<run>` on the columns the row can be found by
 * (`path`, `visitor_hash`, `idempotency_key`), and `afterAll` removes exactly those.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { loginHandler } from '../src/lib/auth/login';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import type { Grant } from '../src/lib/auth/permissions';
import {
  clearOverviewCache,
  daysBetween,
  defaultOverviewQuery,
  overviewData,
  overviewRows,
  parseOverviewQuery,
  parseOverviewSearch,
  previousRange,
  rangeOf,
  shiftDay,
  type OverviewData,
  type OverviewQuery,
} from '../src/lib/console/overview';
import { overviewExportHandler, overviewHandler } from '../src/lib/console/overview-api';
import { overviewCsv } from '../src/lib/console/overview-export';

const run = randomUUID().slice(0, 8);
const MARK = `ovtest-${run}`;
const PASSWORD = 'Shamah-overview-2026';

/** A quiet Tuesday: no other suite writes here, so the fixture is the whole day. */
const DAY = '2023-09-12';
const PREV = '2023-09-11';
const CACHE_DAY = '2023-09-10';

const emails = {
  full: `ovtest-full-${run}@example.invalid`,
  stats: `ovtest-stats-${run}@example.invalid`,
  lead: `ovtest-lead-${run}@example.invalid`,
};

const userIds: string[] = [];
const roleIds: string[] = [];
let ipSeq = 0;

const LEAD_PHONE = '01091112222';
const LEAD_NAME = 'عميل اختبار النظرة';

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', `198.51.100.${++ipSeq % 254}`);
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

async function login(email: string): Promise<string> {
  const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) }));
  return cookieValue(setCookies(res), 'shamah_session');
}

const GRANTS = {
  statRead: { resource: 'stat', action: 'read', scope: null },
  statExport: { resource: 'stat', action: 'export', scope: null },
  leadRead: { resource: 'lead', action: 'read', scope: null },
  articleRead: { resource: 'article', action: 'read', scope: null },
  pageRead: { resource: 'page', action: 'read', scope: null },
} satisfies Record<string, Grant>;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function queryFor(from: string, to: string, compare = false): OverviewQuery {
  return { range: { key: 'custom', from, to, days: daysBetween(from, to) }, compare };
}

async function seedEvents(): Promise<void> {
  const event = (input: {
    path: string;
    visitor: string | null;
    session: string | null;
    hour: number;
    city: string;
    device: string;
    source: string;
    type?: string;
    day?: string;
    bot?: 0 | 1;
  }) => ({
    day: input.day ?? DAY,
    hour: input.hour,
    event_type: input.type ?? 'page_view',
    path: input.path,
    locale: 'ar',
    utm_source: input.source,
    session_hash: input.session,
    visitor_hash: input.visitor,
    city: input.city,
    device: input.device,
    bot: (input.bot ?? 0) as 0 | 1,
  });

  await db
    .insertInto('stats_events')
    .values([
      // One visitor, two languages, one stored path: /ar and /en must count together.
      event({ path: `/ar/${MARK}-a`, visitor: `${MARK}-v1`, session: `${MARK}-s1`, hour: 10, city: 'Cairo', device: 'mobile', source: 'google' }),
      event({ path: `/en/${MARK}-a`, visitor: `${MARK}-v1`, session: `${MARK}-s1`, hour: 11, city: 'Cairo', device: 'mobile', source: 'google' }),
      event({ path: `/${MARK}-b`, visitor: `${MARK}-v2`, session: `${MARK}-s2`, hour: 12, city: 'Cairo', device: 'mobile', source: '' }),
      event({ path: `/${MARK}-c`, visitor: `${MARK}-v3`, session: `${MARK}-s3`, hour: 12, city: 'Giza', device: 'desktop', source: 'google' }),
      event({ path: `/${MARK}-a`, type: 'cta_click', visitor: `${MARK}-v1`, session: `${MARK}-s1`, hour: 13, city: 'Cairo', device: 'mobile', source: 'google' }),
      event({ path: `/${MARK}-b`, type: 'form_submit', visitor: `${MARK}-v2`, session: `${MARK}-s2`, hour: 13, city: 'Cairo', device: 'mobile', source: '' }),
      // A crawler's page view: stored, never counted.
      event({ path: `/${MARK}-bot`, visitor: null, session: null, hour: 12, city: '', device: 'unknown', source: '', bot: 1 }),
      // The comparison period: one visitor, two views.
      event({ path: `/${MARK}-prev`, visitor: `${MARK}-v4`, session: `${MARK}-s4`, hour: 9, city: 'Cairo', device: 'mobile', source: 'google', day: PREV }),
      event({ path: `/${MARK}-prev`, visitor: `${MARK}-v4`, session: `${MARK}-s4`, hour: 10, city: 'Cairo', device: 'mobile', source: 'google', day: PREV }),
    ])
    .execute();
}

async function seedLeads(): Promise<void> {
  const lead = (input: { key: string; status: string; source: string; campaign: string; branch: string; device: string; path: string; day: string; spam?: 0 | 1 }) => ({
    id: randomUUID(),
    name: LEAD_NAME,
    phone: LEAD_PHONE,
    source: 'booking',
    form_id: 'site',
    locale: 'ar',
    page_path: input.path,
    status: input.status as 'new' | 'booked' | 'done',
    device: input.device,
    utm_source: input.source,
    utm_campaign: input.campaign,
    fields: json({ service: 'ليزر', branch: input.branch }),
    utm: json({ source: input.source, campaign: input.campaign }),
    day: input.day,
    idempotency_key: input.key,
    spam: input.spam ?? 0,
    created_at: new Date(`${input.day}T09:00:00Z`),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  });

  await db
    .insertInto('leads')
    .values([
      lead({ key: `${MARK}-l1`, status: 'new', source: 'google', campaign: 'autumn', branch: 'المعادي', device: 'mobile', path: '/ar/contact', day: DAY }),
      lead({ key: `${MARK}-l2`, status: 'booked', source: 'facebook', campaign: '', branch: 'التجمع', device: 'desktop', path: '/ar/offers', day: DAY }),
      // Spam on the same day: a count that included it would be a lie.
      lead({ key: `${MARK}-l3`, status: 'new', source: 'google', campaign: 'autumn', branch: 'المعادي', device: 'mobile', path: '/ar/contact', day: DAY, spam: 1 }),
      // The comparison period's one lead, already finished.
      lead({ key: `${MARK}-l4`, status: 'done', source: 'google', campaign: '', branch: 'المعادي', device: 'mobile', path: '/ar/contact', day: PREV }),
    ])
    .execute();
}

beforeAll(async () => {
  assertTestDb();

  const roles = {
    full: `ovtest-full-role-${run}`,
    stats: `ovtest-stats-role-${run}`,
    lead: `ovtest-lead-role-${run}`,
  };

  for (const [key, name] of Object.entries(roles)) {
    const id = await getOrCreateRole(name, { is_system: false });
    roleIds.push(id);
    const grants: Grant[] =
      key === 'full'
        ? [GRANTS.statRead, GRANTS.statExport, GRANTS.leadRead, GRANTS.articleRead, GRANTS.pageRead]
        : key === 'stats'
          ? [GRANTS.statRead]
          : [GRANTS.leadRead];
    await db
      .insertInto('role_permissions')
      .values(grants.map((grant) => ({ id: randomUUID(), role_id: id, resource: grant.resource, action: grant.action, scope: json(grant.scope) })))
      .execute();
  }

  for (const [key, email] of Object.entries(emails)) {
    const id = await createUser({ email, password: PASSWORD, name: `OVT ${key}` });
    userIds.push(id);
    await assignRole(id, roleIds[Object.keys(roles).indexOf(key)]);
  }

  await seedEvents();
  await seedLeads();
});

afterAll(async () => {
  await db.deleteFrom('stats_events').where('visitor_hash', 'like', `${MARK}%`).execute();
  await db.deleteFrom('stats_events').where('path', 'like', `/%${MARK}%`).execute();
  await db.deleteFrom('leads').where('idempotency_key', 'like', `${MARK}%`).execute();
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', Object.values(emails).map((email) => email.toLowerCase())).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
  }
  if (roleIds.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', roleIds).execute();
    await db.deleteFrom('roles').where('id', 'in', roleIds).execute();
  }
  if (userIds.length > 0) await db.deleteFrom('users').where('id', 'in', userIds).execute();
  await destroyDb();
});

describe('range arithmetic', () => {
  it('counts a preset including today', () => {
    expect(rangeOf('today', '2026-10-29')).toEqual({ key: 'today', from: '2026-10-29', to: '2026-10-29', days: 1 });
    expect(rangeOf('7d', '2026-10-29')).toEqual({ key: '7d', from: '2026-10-23', to: '2026-10-29', days: 7 });
    expect(rangeOf('30d', '2026-10-29')).toEqual({ key: '30d', from: '2026-09-30', to: '2026-10-29', days: 30 });
    expect(rangeOf('90d', '2026-10-29')).toEqual({ key: '90d', from: '2026-08-01', to: '2026-10-29', days: 90 });
    expect(rangeOf('custom', '2026-10-29')).toEqual({ key: 'custom', from: '2026-10-29', to: '2026-10-29', days: 1 });
  });

  it('moves a calendar day across month and year boundaries', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29');
    expect(daysBetween('2026-10-01', '2026-10-29')).toBe(29);
    expect(daysBetween('2026-10-29', '2026-10-29')).toBe(1);
  });

  it('compares with the same length immediately before', () => {
    expect(previousRange({ key: '7d', from: '2026-10-23', to: '2026-10-29', days: 7 })).toEqual({ from: '2026-10-16', to: '2026-10-22' });
    expect(previousRange({ key: 'custom', from: '2026-09-01', to: '2026-09-30', days: 30 })).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });
});

describe('the query parser', () => {
  it('defaults to the last 30 days, today included', () => {
    expect(parseOverviewQuery(new URLSearchParams(), '2026-10-29')).toEqual({ range: rangeOf('30d', '2026-10-29'), compare: false });
    expect(parseOverviewQuery(new URLSearchParams('range='), '2026-10-29')).toEqual({ range: rangeOf('30d', '2026-10-29'), compare: false });
    expect(defaultOverviewQuery('2026-10-29')).toEqual({ range: rangeOf('30d', '2026-10-29'), compare: false });
  });

  it('reads the compare toggle the three ways a browser may send it', () => {
    for (const raw of ['1', 'true', 'on', 'TRUE', ' true ']) {
      const parsed = parseOverviewQuery(new URLSearchParams(`range=7d&compare=${encodeURIComponent(raw)}`), '2026-10-29');
      expect(parsed, raw).toMatchObject({ compare: true });
    }
    expect(parseOverviewQuery(new URLSearchParams('range=7d&compare=0'), '2026-10-29')).toMatchObject({ compare: false });
  });

  it('accepts a custom range and refuses the three ways one can be wrong', () => {
    expect(parseOverviewQuery(new URLSearchParams('range=custom&from=2026-09-01&to=2026-09-30'), '2026-10-29')).toEqual({
      range: { key: 'custom', from: '2026-09-01', to: '2026-09-30', days: 30 },
      compare: false,
    });

    expect(parseOverviewQuery(new URLSearchParams('range=custom&from=2026-09-31&to=2026-10-01'), '2026-10-29')).toEqual({
      error: 'invalid_input',
      issues: [{ path: 'from', message: 'invalid_date' }],
    });

    expect(parseOverviewQuery(new URLSearchParams('range=custom&from=2026-09-30&to=2026-09-01'), '2026-10-29')).toEqual({
      error: 'invalid_input',
      issues: [{ path: 'to', message: 'before_from' }],
    });

    expect(parseOverviewQuery(new URLSearchParams('range=custom&from=2025-01-01&to=2026-01-02'), '2026-10-29')).toEqual({
      error: 'invalid_input',
      issues: [{ path: 'to', message: 'too_long' }],
    });
  });

  it('allows exactly a year and refuses a day more', () => {
    const year = parseOverviewQuery(new URLSearchParams('range=custom&from=2025-01-01&to=2026-01-01'), '2026-10-29');
    expect('error' in year).toBe(false);
    expect(year).toMatchObject({ range: { days: 366 } });
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(366);
  });

  it('refuses a range name it does not know', () => {
    expect(parseOverviewQuery(new URLSearchParams('range=quarter'), '2026-10-29')).toEqual({
      error: 'invalid_input',
      issues: [{ path: 'range', message: 'unknown_range' }],
    });
  });

  it('takes the first value of a repeated server search parameter', () => {
    expect(parseOverviewSearch({ range: ['7d', '30d'], compare: 'on' }, '2026-10-29')).toEqual({
      range: rangeOf('7d', '2026-10-29'),
      compare: true,
    });
    expect(parseOverviewSearch(undefined, '2026-10-29')).toEqual(defaultOverviewQuery('2026-10-29'));
  });
});

describe('the aggregates over one seeded day', () => {
  it('counts page views, visitors and non-spam leads for the range only', async () => {
    clearOverviewCache();
    const data = await overviewData({
      query: queryFor(DAY, DAY),
      grants: [GRANTS.statRead, GRANTS.statExport, GRANTS.leadRead, GRANTS.articleRead, GRANTS.pageRead],
      now: new Date('2026-10-29T08:00:00Z'),
    });

    expect(data.range).toMatchObject({ key: 'custom', from: DAY, to: DAY, days: 1, today: '2026-10-29' });
    expect(data.daily).toEqual([{ day: DAY, views: 4, visitors: 3, leads: 2 }]);
    expect(data.kpis.map((kpi) => [kpi.key, kpi.value])).toEqual([
      ['visitors', 3],
      ['views', 4],
      ['leads', 2],
      ['conversion', 66.7],
    ]);
    expect(data.kpis.map((kpi) => kpi.series)).toEqual([[3], [4], [2], [66.7]]);
    expect(data.previousDaily).toBeNull();
    expect(data.previous).toBeNull();

    // A crawler's page view and the spam lead are in the table but not in the numbers.
    expect(await db.selectFrom('stats_events').select('id').where('path', '=', `/${MARK}-bot`).execute()).toHaveLength(1);
    expect(await db.selectFrom('leads').select('id').where('idempotency_key', '=', `${MARK}-l3`).execute()).toHaveLength(1);
  });

  it('compares with the same-length period before it, as percentages and points', async () => {
    clearOverviewCache();
    const data = await overviewData({
      query: queryFor(DAY, DAY, true),
      grants: [GRANTS.statRead, GRANTS.leadRead],
      now: new Date('2026-10-29T08:00:00Z'),
    });

    expect(data.previous).toEqual({ from: PREV, to: PREV });
    expect(data.previousDaily).toEqual([{ day: PREV, views: 2, visitors: 1, leads: 1 }]);
    const byKey = new Map(data.kpis.map((kpi) => [kpi.key, kpi]));
    // (3 - 1) / 1 = +200%, (4 - 2) / 2 = +100%, (2 - 1) / 1 = +100%.
    expect(byKey.get('visitors')).toMatchObject({ value: 3, previous: 1, delta: 200, unit: 'count' });
    expect(byKey.get('views')).toMatchObject({ value: 4, previous: 2, delta: 100 });
    expect(byKey.get('leads')).toMatchObject({ value: 2, previous: 1, delta: 100 });
    // 66.7% against 100% is -33.3 points, not -33.3%.
    expect(byKey.get('conversion')).toMatchObject({ value: 66.7, previous: 100, delta: -33.3, unit: 'percent' });
  });

  it('places each view in the clinic week and the Cairo hour, and counts the gaps', async () => {
    clearOverviewCache();
    const data = await overviewData({
      query: queryFor(DAY, DAY),
      grants: [GRANTS.statRead],
      now: new Date('2026-10-29T08:00:00Z'),
    });

    // 2023-09-12 is a Tuesday: Sunday = 0, so the row is 2.
    const placed = new Map(data.heatmap.cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.views]));
    expect(placed.get('2:10')).toBe(1);
    expect(placed.get('2:11')).toBe(1);
    expect(placed.get('2:12')).toBe(2);
    expect(data.heatmap.placed).toBe(4);
    expect(data.heatmap.missing).toBe(0);
  });

  it('separates the click and submit timeline from the page-view chart', async () => {
    clearOverviewCache();
    const data = await overviewData({ query: queryFor(DAY, DAY), grants: [GRANTS.statRead], now: new Date('2026-10-29T08:00:00Z') });
    expect(data.engagement).toEqual([{ day: DAY, cta: 1, submit: 1 }]);
  });

  it('strips the language prefix so one page is one row, and reads the source of a visit', async () => {
    clearOverviewCache();
    const data = await overviewData({ query: queryFor(DAY, DAY), grants: [GRANTS.statRead], now: new Date('2026-10-29T08:00:00Z') });

    const top = new Map(data.topPages.map((page) => [page.path, page]));
    expect(top.get(`/${MARK}-a`)).toEqual({ path: `/${MARK}-a`, views: 2, visitors: 1 });
    expect(top.get(`/${MARK}-b`)).toEqual({ path: `/${MARK}-b`, views: 1, visitors: 1 });
    expect(top.get(`/${MARK}-c`)).toEqual({ path: `/${MARK}-c`, views: 1, visitors: 1 });
    expect(data.topArticles).toEqual([]);

    const cities = new Map(data.cities.map((row) => [row.city, row]));
    expect(cities.get('Cairo')).toEqual({ city: 'Cairo', views: 3, visitors: 2 });
    expect(cities.get('Giza')).toEqual({ city: 'Giza', views: 1, visitors: 1 });

    // No lead grant: the donut counts visits, and says so.
    expect(data.sourcesBasis).toBe('visits');
    expect(data.sources.map((slice) => [slice.label, slice.value]).sort()).toEqual([['', 1], ['google', 2]]);
    expect(data.leads).toBeNull();
    expect(data.canExport).toBe(false);
    expect(data.library).toEqual([]);
    expect(data.quickActions).toEqual([]);
  });

  it('gives a lead reader campaign, service, branch and status counts, and the device split', async () => {
    clearOverviewCache();
    const data = await overviewData({
      query: queryFor(DAY, DAY),
      grants: [GRANTS.statRead, GRANTS.leadRead],
      now: new Date('2026-10-29T08:00:00Z'),
    });

    expect(data.sourcesBasis).toBe('leads');
    expect(data.sources.map((slice) => [slice.label, slice.value]).sort()).toEqual([['facebook', 1], ['google', 1]]);

    const leads = data.leads;
    expect(leads).not.toBeNull();
    if (!leads) throw new Error('a lead reader must get the lead blocks');
    expect(leads.statuses).toContainEqual({ status: 'new', count: 1 });
    expect(leads.statuses).toContainEqual({ status: 'booked', count: 1 });
    expect(leads.statuses).toContainEqual({ status: 'done', count: 0 });
    expect(leads.funnel.find((slice) => slice.label === 'new')).toEqual({ label: 'new', value: 1 });
    expect(leads.campaigns.map((slice) => [slice.label, slice.value])).toEqual([['autumn', 1]]);
    expect(leads.services.map((slice) => [slice.label, slice.value])).toEqual([['ليزر', 2]]);
    expect(leads.branches.map((slice) => [slice.label, slice.value]).sort()).toEqual([['التجمع', 1], ['المعادي', 1]]);
    expect(leads.topPages.map((row) => [row.label, row.count]).sort()).toEqual([['/ar/contact', 1], ['/ar/offers', 1]]);

    expect(leads.devices).toContainEqual({ device: 'mobile', views: 3, leads: 1 });
    expect(leads.devices).toContainEqual({ device: 'desktop', views: 1, leads: 1 });
  });

  it('exports the same range as a flat CSV without a single contact detail', async () => {
    clearOverviewCache();
    const data = await overviewData({
      query: queryFor(DAY, DAY, true),
      grants: [GRANTS.statRead, GRANTS.statExport, GRANTS.leadRead],
      now: new Date('2026-10-29T08:00:00Z'),
    });
    const { csv, rows } = overviewCsv(data);

    expect(csv.startsWith('\uFEFFsection,label,metric,value,detail\r\n')).toBe(true);
    expect(csv).toContain('kpi,visitors,value,3,count\r\n');
    expect(csv).toContain('sources,google,leads,1,\r\n');
    expect(csv).toContain('cities,Cairo,views,3,\r\n');
    expect(csv).toContain('heatmap,Tuesday,12,2,\r\n');
    expect(csv).toContain(`meta,previous_from,,${PREV},\r\n`);
    // A negative delta leaves as text, not as a formula the spreadsheet would run.
    expect(csv).toContain("kpi,conversion,delta_points,'-33.3,\r\n");
    // The recent-leads panel is not an export path for names or phone numbers.
    expect(csv).not.toContain(LEAD_PHONE);
    expect(csv).not.toContain(LEAD_NAME);
    expect(rows).toBe(csv.slice(1).trimEnd().split('\r\n').length - 1);
    expect(csv.includes('\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
});

describe('the minute cache', () => {
  it('answers a repeat inside the minute from memory, and rebuilds after a clear', async () => {
    clearOverviewCache();
    const grants: Grant[] = [GRANTS.statRead];
    const event = (visitor: string, path: string) => ({
      day: CACHE_DAY,
      hour: 9,
      event_type: 'page_view',
      path: `/ar/${MARK}-${path}`,
      locale: 'ar',
      session_hash: `${MARK}-${path}-s`,
      visitor_hash: `${MARK}-${visitor}`,
      bot: 0 as const,
    });

    await db.insertInto('stats_events').values(event('c1', 'cache-1')).execute();
    const first = await overviewData({ query: queryFor(CACHE_DAY, CACHE_DAY), grants, now: new Date('2026-10-29T08:00:00Z') });
    expect(first.kpis.find((kpi) => kpi.key === 'views')?.value).toBe(1);

    // A new row lands; the key is unchanged, so this answer is still the cached one.
    await db.insertInto('stats_events').values(event('c2', 'cache-2')).execute();
    const second = await overviewData({ query: queryFor(CACHE_DAY, CACHE_DAY), grants, now: new Date('2026-10-29T08:00:00Z') });
    expect(second.kpis.find((kpi) => kpi.key === 'views')?.value).toBe(1);

    clearOverviewCache();
    const third = await overviewData({ query: queryFor(CACHE_DAY, CACHE_DAY), grants, now: new Date('2026-10-29T08:00:00Z') });
    expect(third.kpis.find((kpi) => kpi.key === 'views')?.value).toBe(2);
    expect(third.kpis.find((kpi) => kpi.key === 'visitors')?.value).toBe(2);
  });

  it('keeps one role out of another role\'s cached slice', async () => {
    clearOverviewCache();
    const q = queryFor(DAY, DAY);
    const withLeads = await overviewData({ query: q, grants: [GRANTS.statRead, GRANTS.leadRead], now: new Date('2026-10-29T08:00:00Z') });
    const without = await overviewData({ query: q, grants: [GRANTS.statRead], now: new Date('2026-10-29T08:00:00Z') });
    expect(withLeads.leads).not.toBeNull();
    expect(without.leads).toBeNull();
  });
});

describe('overviewRows', () => {
  it('returns only the library counts the caller may read', async () => {
    expect(await overviewRows([])).toEqual([]);
    const all = await overviewRows([{ resource: '*', action: '*', scope: null }]);
    expect(all.map((row) => row.resource)).toEqual(['article', 'offer', 'page', 'list', 'media', 'lead', 'user']);
    expect(all.every((row) => row.count >= 0)).toBe(true);

    const leadOnly = await overviewRows([GRANTS.leadRead]);
    expect(leadOnly).toHaveLength(1);
    expect(leadOnly[0]?.resource).toBe('lead');
    expect(leadOnly[0]?.count).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/console/overview', () => {
  it('refuses a caller without stat.read before looking at the query', async () => {
    const cookie = await login(emails.lead);
    const res = await overviewHandler(request('/overview?range=quarter', { cookie: `shamah_session=${cookie}` }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; action: string };
    expect(body.error).toBe('forbidden');
    expect(body.action).toBe('stat.read');
  });

  it('answers 400 for a range it cannot honour, and 200 for one it can', async () => {
    const cookie = await login(emails.full);
    const bad = await overviewHandler(request(`/overview?range=custom&from=${DAY}&to=2023-09-01`, { cookie: `shamah_session=${cookie}` }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_input', issues: [{ path: 'to', message: 'before_from' }] });

    const good = await overviewHandler(request(`/overview?range=custom&from=${DAY}&to=${DAY}&compare=1`, { cookie: `shamah_session=${cookie}` }));
    expect(good.status).toBe(200);
    const body = (await good.json()) as OverviewData;
    expect(body.range).toMatchObject({ from: DAY, to: DAY });
    expect(body.previous).toEqual({ from: PREV, to: PREV });
    expect(body.kpis.find((kpi) => kpi.key === 'views')?.value).toBe(4);
    expect(body.leads).not.toBeNull();
    expect(body.sourcesBasis).toBe('leads');
    expect(body.canExport).toBe(true);
  });

  it('turns a non-GET into 405', async () => {
    const cookie = await login(emails.full);
    const res = await overviewHandler(request('/overview', { method: 'POST', cookie: `shamah_session=${cookie}` }));
    expect(res.status).toBe(405);
  });
});

describe('GET /api/console/overview/export', () => {
  it('is a different grant from reading: stat.read alone is a 403', async () => {
    const cookie = await login(emails.stats);
    const res = await overviewExportHandler(request(`/overview/export?range=custom&from=${DAY}&to=${DAY}`, { cookie: `shamah_session=${cookie}` }));
    expect(res.status).toBe(403);
    expect((await res.json()) as { action: string }).toMatchObject({ action: 'stat.export' });
  });

  it('downloads the CSV under its range name, with no-store and a BOM', async () => {
    const cookie = await login(emails.full);
    const res = await overviewExportHandler(request(`/overview/export?range=custom&from=${DAY}&to=${DAY}`, { cookie: `shamah_session=${cookie}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="overview-${DAY}-${DAY}.csv"`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    // `Response.text()` decodes as UTF-8 and drops the BOM, so the bytes are the proof.
    const raw = Buffer.from(await res.arrayBuffer());
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = raw.toString('utf8');
    expect(csv.startsWith('\uFEFFsection,label,metric,value,detail\r\n')).toBe(true);
    expect(csv).toContain('kpi,visitors,value,3,count');
    expect(csv).not.toContain(LEAD_PHONE);

    const dataRows = csv.slice(1).trimEnd().split('\r\n').length - 1;
    const audit = await db
      .selectFrom('audit_log')
      .select(['action', 'entity_type', 'after_json'])
      .where('actor_email', '=', emails.full)
      .where('action', '=', 'stat.export')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(audit.action).toBe('stat.export');
    expect(audit.entity_type).toBe('stat');
    expect(asObject(audit.after_json)).toMatchObject({ format: 'csv', range: 'custom', from: DAY, to: DAY, compare: false, rows: dataRows });
  });

  it('refuses a malformed range with 400 and writes no audit row', async () => {
    const cookie = await login(emails.full);
    const before = await db.selectFrom('audit_log').select('id').where('actor_email', '=', emails.full).where('action', '=', 'stat.export').execute();
    const res = await overviewExportHandler(request('/overview/export?range=custom&from=nope&to=also-nope', { cookie: `shamah_session=${cookie}` }));
    expect(res.status).toBe(400);
    const after = await db.selectFrom('audit_log').select('id').where('actor_email', '=', emails.full).where('action', '=', 'stat.export').execute();
    expect(after).toHaveLength(before.length);
  });
});
