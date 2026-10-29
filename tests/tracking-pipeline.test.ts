/**
 * TR-2 / TR-5 / TR-6: what the measuring and exporting actually write.
 *
 * What a reviewer cannot see by reading one file:
 *   - `/api/track` answers a DNT request with 204 and stores nothing, stores a bot with
 *     `bot = 1` and no visitor hash, and turns the attribution it is handed into the
 *     columns the reports group by — never a raw address;
 *   - a rollup run replaces a day instead of adding to it, so running it twice gives the
 *     same numbers, and a bot never reaches an aggregate;
 *   - the lead CSV carries every attribution column with a BOM and a spreadsheet-safe
 *     cell, and the Google Ads file contains only a booked click id, in Cairo time;
 *   - a Viewer's export is a 403, and an Owner's export leaves an audit row.
 *
 * Every fixture is stamped with `trk-<run>`; `afterAll` removes it and puts the rollup
 * watermark back where it found it.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Insertable } from 'kysely';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { ROLE_SEEDS, syncRoles } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { assignRole, createUser } from '../src/lib/auth/users';
import { leadExportHandler } from '../src/lib/leads/api';
import { recordLead } from '../src/lib/leads/store';
import { dayOf, rateLimited } from '../src/lib/tracking/ingest';
import { maintain, pruneEvents, recomputeDays } from '../src/lib/tracking/rollup';
import type { StatsEventsTable } from '../src/lib/db/types';
import { POST as trackPost } from '../src/app/api/track/route';

const run = randomUUID().slice(0, 8);
const MARK = `trk-${run}`;
const PASSWORD = 'Shamah-tracking-2026';

/** Inside the retention window, so a prune between tests never removes the fixtures. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const DAY_ONE = daysAgo(3);
const DAY_TWO = daysAgo(2);
const OLD_DAY = '2020-05-05';

interface Session {
  id: string;
  token: string;
}

const users: { owner: Session; viewer: Session } = { owner: { id: '', token: '' }, viewer: { id: '', token: '' } };
const createdUsers: string[] = [];
let watermarkBefore = 0;

function cookieValue(res: Response, name: string): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ?? '').split(/,\s*(?=[^;,]+=)/);
  const line = lines.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

async function signIn(email: string): Promise<Session> {
  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'x-forwarded-for': `198.18.${Math.floor(Math.random() * 250)}.1` },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return { id: row.id, token: cookieValue(res, 'shamah_session') };
}

function trackRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', ...headers },
    body: JSON.stringify(body),
  });
}

async function exportRequest(actor: Session, query: string): Promise<Response> {
  return leadExportHandler(
    new Request(`http://localhost/api/console/leads/export?${query}`, {
      headers: { cookie: `shamah_session=${actor.token}` },
    }),
  );
}

async function rowsFor(day: string, path: string): Promise<{ views: number; visitors: number } | undefined> {
  const row = await db
    .selectFrom('stats_daily')
    .select(['views', 'visitors'])
    .where('day', '=', day)
    .where('path', '=', path)
    .executeTakeFirst();
  return row ? { views: Number(row.views), visitors: Number(row.visitors) } : undefined;
}

beforeAll(async () => {
  assertTestDb();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  const state = await db.selectFrom('stats_rollup_state').select('last_event_id').where('id', '=', 1).executeTakeFirst();
  watermarkBefore = Number(state?.last_event_id ?? 0);

  const roles = new Map((await db.selectFrom('roles').select(['id', 'name']).execute()).map((role) => [role.name, role.id]));
  for (const [key, role] of [
    ['Owner', 'Owner'],
    ['Viewer', 'Viewer'],
  ] as const) {
    const email = `${MARK}-${role.toLowerCase()}@example.invalid`;
    const id = await createUser({ email, password: PASSWORD, name: `TRK ${role}` });
    await assignRole(id, roles.get(role) ?? '');
    createdUsers.push(id);
    users[key === 'Owner' ? 'owner' : 'viewer'] = await signIn(email);
  }
});

afterAll(async () => {
  await db.deleteFrom('stats_events').where('path', 'like', `/_${MARK}%`).execute();
  for (const day of [DAY_ONE, DAY_TWO, OLD_DAY]) {
    await sql`DELETE FROM stats_daily WHERE day = ${day}`.execute(db);
    await sql`DELETE FROM stats_referrers_daily WHERE day = ${day}`.execute(db);
    await sql`DELETE FROM stats_cta_daily WHERE day = ${day}`.execute(db);
    await sql`DELETE FROM stats_named_daily WHERE day = ${day}`.execute(db);
    await sql`DELETE FROM stats_sources_daily WHERE day = ${day}`.execute(db);
    await sql`DELETE FROM stats_geo_daily WHERE day = ${day}`.execute(db);
  }
  await db.updateTable('stats_rollup_state').set({ last_event_id: watermarkBefore }).where('id', '=', 1).execute();
  await db.deleteFrom('leads').where('page_path', 'like', `/${MARK}%`).execute();
  if (createdUsers.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', createdUsers).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', createdUsers).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', createdUsers).execute();
    await db.deleteFrom('leads').where('page_path', 'like', `/${MARK}%`).execute();
    await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'like', `${MARK}%`).execute();
  }
  const catalog = await db.selectFrom('roles').select('id').where('name', 'in', ROLE_SEEDS.map((role) => role.name)).execute();
  if (catalog.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', catalog.map((role) => role.id)).execute();
    await db.deleteFrom('roles').where('id', 'in', catalog.map((role) => role.id)).execute();
  }
  await destroyDb();
});

describe('POST /api/track', () => {
  it('answers a refusal with 204 and writes nothing at all', async () => {
    const before = await db
      .selectFrom('stats_events')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('path', '=', `/_${MARK}/refused`)
      .executeTakeFirstOrThrow();
    const res = await trackPost(trackRequest({ event: 'page_view', path: `/_${MARK}/refused` }, { dnt: '1' }));
    expect(res.status).toBe(204);
    const after = await db
      .selectFrom('stats_events')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('path', '=', `/_${MARK}/refused`)
      .executeTakeFirstOrThrow();
    expect(Number(after.n)).toBe(Number(before.n));
  });

  it('keeps a visitor as a salted hash and records the attribution the page sent', async () => {
    const res = await trackPost(
      trackRequest(
        {
          event: 'page_view',
          path: `/_${MARK}/pricing?utm_source=drop-me`,
          locale: 'ar',
          attribution: {
            source: 'instagram',
            medium: 'social',
            campaign: 'autumn',
            term: 'filler',
            content: 'story',
            landing: '/offers/autumn',
            referrer: 'https://www.instagram.com/p/abc',
            gclid: 'G-abc-123',
            fbclid: 'FB-xyz',
          },
          session: 'abcDEF123456',
        },
        {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
          'x-forwarded-for': '203.0.113.9',
          'cf-ipcity': 'Cairo',
        },
      ),
    );
    expect(res.status).toBe(204);

    const row = await db
      .selectFrom('stats_events')
      .selectAll()
      .where('path', '=', `/_${MARK}/pricing`)
      .executeTakeFirstOrThrow();
    expect(row.utm_source).toBe('instagram');
    expect(row.utm_medium).toBe('social');
    expect(row.utm_campaign).toBe('autumn');
    expect(row.landing).toBe('/offers/autumn');
    expect(row.referrer_host).toBe('www.instagram.com');
    expect(row.device).toBe('mobile');
    expect(row.city).toBe('Cairo');
    expect(row.bot).toBe(0);
    expect(row.visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.session_hash).toMatch(/^[a-f0-9]{64}$/);
    // The query string is never stored, and the raw address is nowhere in the row.
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    expect(JSON.stringify(row)).not.toContain('drop-me');
  });

  it('stores a bot with bot = 1 and no visitor hash', async () => {
    await trackPost(
      trackRequest(
        { event: 'page_view', path: `/_${MARK}/bot` },
        { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'x-forwarded-for': '203.0.113.10' },
      ),
    );
    const row = await db.selectFrom('stats_events').selectAll().where('path', '=', `/_${MARK}/bot`).executeTakeFirstOrThrow();
    expect(row.bot).toBe(1);
    expect(row.visitor_hash).toBeNull();
  });

  it('rejects an event name outside the closed list', async () => {
    const res = await trackPost(trackRequest({ event: 'keylogger', path: `/_${MARK}/bad` }));
    expect(res.status).toBe(400);
  });

  it('stops one address after 120 events in a minute', () => {
    const key = `test-${MARK}`;
    for (let i = 0; i < 120; i += 1) expect(rateLimited(key, 1_000)).toBe(false);
    expect(rateLimited(key, 1_000)).toBe(true);
    // A minute later the window has moved on.
    expect(rateLimited(key, 62_000)).toBe(false);
  });
});

describe('daily rollups', () => {
  beforeAll(async () => {
    const insert = async (values: Insertable<StatsEventsTable>): Promise<void> => {
      await db.insertInto('stats_events').values(values).execute();
    };
    await insert({
      day: DAY_ONE,
      event_type: 'page_view',
      path: `/_${MARK}/a`,
      locale: 'ar',
      referrer_host: 'www.google.com',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'brand',
      city: 'Cairo',
      visitor_hash: 'v1',
      session_hash: 's1',
      device: 'mobile',
    });
    await insert({
      day: DAY_ONE,
      event_type: 'page_view',
      path: `/_${MARK}/a`,
      locale: 'ar',
      city: 'Cairo',
      visitor_hash: 'v2',
      session_hash: 's2',
      device: 'desktop',
    });
    await insert({
      day: DAY_ONE,
      event_type: 'cta_click',
      path: `/_${MARK}/a`,
      cta_key: 'book-service',
      visitor_hash: 'v1',
      session_hash: 's1',
    });
    // A bot on the same day: counted in raw events, never in an aggregate.
    await insert({ day: DAY_ONE, event_type: 'page_view', path: `/_${MARK}/a`, bot: 1, visitor_hash: null });
    await insert({
      day: DAY_TWO,
      event_type: 'page_view',
      path: `/_${MARK}/b`,
      referrer_host: 'www.google.com',
      utm_source: 'google',
      city: 'Giza',
      visitor_hash: 'v3',
      session_hash: 's3',
    });
  });

  it('rebuilds a day from its events and excludes bots', async () => {
    await recomputeDays(DAY_ONE, DAY_TWO);

    expect(await rowsFor(DAY_ONE, `/_${MARK}/a`)).toEqual({ views: 2, visitors: 2 });
    expect(await rowsFor(DAY_TWO, `/_${MARK}/b`)).toEqual({ views: 1, visitors: 1 });

    const referrers = await db
      .selectFrom('stats_referrers_daily')
      .select(['views', 'visitors'])
      .where('day', '=', DAY_ONE)
      .where('host', '=', 'www.google.com')
      .executeTakeFirstOrThrow();
    expect({ views: Number(referrers.views), visitors: Number(referrers.visitors) }).toEqual({ views: 1, visitors: 1 });

    const cta = await db
      .selectFrom('stats_cta_daily')
      .select('clicks')
      .where('day', '=', DAY_ONE)
      .where('cta_key', '=', 'book-service')
      .executeTakeFirstOrThrow();
    expect(Number(cta.clicks)).toBe(1);

    const named = await db
      .selectFrom('stats_named_daily')
      .select(['events', 'sessions'])
      .where('day', '=', DAY_ONE)
      .where('event_type', '=', 'page_view')
      .executeTakeFirstOrThrow();
    expect(Number(named.events)).toBe(2);
    expect(Number(named.sessions)).toBe(2);

    const geo = await db
      .selectFrom('stats_geo_daily')
      .select(['views', 'visitors'])
      .where('day', '=', DAY_ONE)
      .where('city', '=', 'Cairo')
      .executeTakeFirstOrThrow();
    expect({ views: Number(geo.views), visitors: Number(geo.visitors) }).toEqual({ views: 2, visitors: 2 });
  });

  it('is idempotent: a second run over the same days changes nothing', async () => {
    await recomputeDays(DAY_ONE, DAY_TWO);
    expect(await rowsFor(DAY_ONE, `/_${MARK}/a`)).toEqual({ views: 2, visitors: 2 });
    expect(await rowsFor(DAY_TWO, `/_${MARK}/b`)).toEqual({ views: 1, visitors: 1 });
  });

  it('maintain() rolls up only the days that received events and never today', async () => {
    const today = dayOf();
    const todayId = await (async () => {
      await db
        .insertInto('stats_events')
        .values({ day: today, event_type: 'page_view', path: `/_${MARK}/today`, visitor_hash: 'v9', session_hash: 's9' })
        .execute();
      const row = await db
        .selectFrom('stats_events')
        .select('id')
        .where('path', '=', `/_${MARK}/today`)
        .executeTakeFirstOrThrow();
      return Number(row.id);
    })();

    // Pretend nothing was ever rolled up, so the fixture days are pending.
    await db.updateTable('stats_rollup_state').set({ last_event_id: 0 }).where('id', '=', 1).execute();
    const first = await maintain();
    // Other suites may have left closed-day events in the test database; ours must be in
    // the rebuilt range, and the range must not include the open day.
    expect(first.from).not.toBe('');
    expect(first.from <= DAY_ONE).toBe(true);
    expect(first.pruned).toBeGreaterThanOrEqual(0);

    const state = await db.selectFrom('stats_rollup_state').select('last_event_id').where('id', '=', 1).executeTakeFirstOrThrow();
    expect(Number(state.last_event_id)).toBeLessThan(todayId);
    expect(await rowsFor(DAY_ONE, `/_${MARK}/a`)).toEqual({ views: 2, visitors: 2 });

    const again = await maintain();
    expect(again.from).toBe('');
    expect(await rowsFor(DAY_ONE, `/_${MARK}/a`)).toEqual({ views: 2, visitors: 2 });
  });

  it('prunes raw events past the retention window and keeps the daily counts', async () => {
    await db
      .insertInto('stats_events')
      .values({ day: OLD_DAY, event_type: 'page_view', path: `/_${MARK}/ancient`, visitor_hash: 'v0' })
      .execute();
    const removed = await pruneEvents(new Date('2026-10-29T12:00:00Z'));
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await db
      .selectFrom('stats_events')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('path', '=', `/_${MARK}/ancient`)
      .executeTakeFirstOrThrow();
    expect(Number(left.n)).toBe(0);
  });
});

describe('lead exports', () => {
  beforeAll(async () => {
    await recordLead({
      source: 'booking',
      name: `TRK ${MARK} "quoted"`,
      phone: '0100 000 0000',
      message: '=1+1, and a comma\nsecond line',
      locale: 'ar',
      pagePath: `/${MARK}/thanks`,
      landingPage: `/${MARK}/offers`,
      referrer: `https://site.test/${MARK}/offers`,
      firstReferrer: 'https://www.instagram.com/',
      gclid: 'G-TRK-123',
      fbclid: 'FB-TRK-456',
      device: 'mobile',
      city: 'Cairo',
      campaign: { source: 'google', medium: 'cpc', campaign: 'autumn', term: 'filler', content: 'ad-1' },
      sessionHash: 's'.repeat(64),
      visitorHash: 'v'.repeat(64),
    });
    const booked = await db
      .selectFrom('leads')
      .select('id')
      .where('page_path', '=', `/${MARK}/thanks`)
      .executeTakeFirstOrThrow();
    await db.updateTable('leads').set({ status: 'booked' }).where('id', '=', booked.id).execute();
    await recordLead({ source: 'contact-form', name: `TRK ${MARK} new`, phone: '0111', pagePath: `/${MARK}/contact` });
  });

  it('streams a CSV with every attribution column and a spreadsheet-safe cell', async () => {
    const res = await exportRequest(users.owner, `format=csv&q=${encodeURIComponent(`TRK ${MARK}`)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toContain('attachment;');

    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    // Excel only reads Arabic as Arabic when the file starts with the UTF-8 BOM.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const text = await res.text();
    const [header] = text.split('\r\n');
    expect(header.split(',')).toContain('utm_source');
    expect(header.split(',')).toContain('landing_page');
    expect(header.split(',')).toContain('gclid');
    expect(text).toContain('instagram.com');
    expect(text).toContain('google,cpc,autumn,filler,ad-1');
    // The message began with `=`: a spreadsheet must read it, not run it.
    expect(text).toContain(`'=1+1`);
    expect(text).toContain('""quoted""');
  });

  it('refuses a role without lead.export', async () => {
    const res = await exportRequest(users.viewer, `format=csv&q=${encodeURIComponent(`TRK ${MARK}`)}`);
    expect(res.status).toBe(403);
  });

  it('writes the Google Ads file with only a booked click id, in Cairo time', async () => {
    const res = await exportRequest(users.owner, `format=google-ads&q=${encodeURIComponent(`TRK ${MARK}`)}`);
    expect(res.status).toBe(200);
    const text = (await res.text()).replace(/^\uFEFF/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('G-TRK-123');
    expect(lines[1]).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/);
  });

  it('records the export in the audit log without copying the leads into it', async () => {
    const row = await db
      .selectFrom('audit_log')
      .selectAll()
      .where('actor_id', '=', users.owner.id)
      .where('action', '=', 'lead.export')
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    expect(row).toBeTruthy();
    const after = typeof row?.after_json === 'string' ? row.after_json : JSON.stringify(row?.after_json ?? {});
    expect(after).toContain('google-ads');
    expect(after).not.toContain('0100 000 0000');
  });
});
