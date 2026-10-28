/**
 * S3e: the marketing change history, its revert, and the role that runs marketing.
 *
 * The history is read from `audit_log`, which is append-only: these tests prove that a
 * revert writes the earlier tag document as a new save, that the row it restores from is
 * still there afterwards, that a sheet row is shown but refused (its URL and token are
 * never in the log), and that the Marketer can do all of it while the global audit
 * resource stays closed to them.
 *
 * Runs against the disposable `shamah_cms_test` database; the tracking setting is read
 * before the suite and written back afterwards.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { can } from '../src/lib/auth/permissions';
import { syncRoles, type RoleName } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser } from '../src/lib/auth/users';
import { sheetsHandler, trackingHandler } from '../src/lib/integrations/api';
import { TRACKING_GROUP, TRACKING_KEY } from '../src/lib/tracking/server';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-int-2026';
const emails: Partial<Record<RoleName, string>> = {
  Owner: `s3e-owner-${run}@example.invalid`,
  Marketer: `s3e-marketer-${run}@example.invalid`,
  Viewer: `s3e-viewer-${run}@example.invalid`,
};

const userIds: Record<string, string> = {};
const actors: Partial<Record<RoleName, { token: string; csrf: string }>> = {};
let trackingBefore: unknown = null;
let trackingExisted = false;

let ipSeq = 0;
const ip = (): string => `198.51.100.${++ipSeq % 254}`;

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip());
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
  if (!line) return '';
  return decodeURIComponent(line.slice(name.length + 1).split(';')[0]);
}

async function login(email: string): Promise<{ token: string; csrf: string }> {
  const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) }));
  const body = (await res.json()) as { csrfToken: string };
  return { token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken };
}

/** A call as one of the actors; `body` is JSON for every unsafe method. */
function call(
  actor: RoleName,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
): Promise<Response> {
  const session = actors[actor];
  if (!session) throw new Error(`No session for ${actor}`);
  const init: RequestInit & { cookie?: string } = { method, cookie: `shamah_session=${session.token}` };
  if (method !== 'GET') {
    init.body = JSON.stringify(body ?? {});
    init.headers = { 'content-type': 'application/json', [CSRF_HEADER]: session.csrf };
  }
  return trackingHandler(request('/tracking', init));
}

interface TrackingBody {
  config: Record<string, { id: string; enabled: boolean }>;
  plan: { gtm: string | null };
  history: Array<{
    id: number;
    actorEmail: string;
    entityId: string;
    before: unknown;
    after: unknown;
    revertable: boolean;
  }>;
  catalog: Array<{ key: string }>;
}

async function trackingOf(actor: RoleName): Promise<{ status: number; body: TrackingBody }> {
  const res = await call(actor, 'GET');
  return { status: res.status, body: (await res.json()) as TrackingBody };
}

beforeAll(async () => {
  assertTestDb();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  for (const name of Object.keys(emails) as RoleName[]) {
    const email = emails[name]!;
    const userId = await createUser({ email, password: PASSWORD, name: `S3E ${name}` });
    const role = await db.selectFrom('roles').select('id').where('name', '=', name).executeTakeFirstOrThrow();
    await assignRole(userId, role.id);
    userIds[name] = userId;
    actors[name] = await login(email);
  }

  const row = await db
    .selectFrom('settings')
    .select('value')
    .where('group_name', '=', TRACKING_GROUP)
    .where('setting_key', '=', TRACKING_KEY)
    .executeTakeFirst();
  trackingExisted = Boolean(row);
  trackingBefore = row?.value ?? null;
  await db.deleteFrom('settings').where('group_name', '=', TRACKING_GROUP).where('setting_key', '=', TRACKING_KEY).execute();
});

afterAll(async () => {
  if (trackingExisted) {
    await db
      .updateTable('settings')
      .set({ value: trackingBefore as string })
      .where('group_name', '=', TRACKING_GROUP)
      .where('setting_key', '=', TRACKING_KEY)
      .execute();
  } else {
    await db.deleteFrom('settings').where('group_name', '=', TRACKING_GROUP).where('setting_key', '=', TRACKING_KEY).execute();
  }

  const ids = Object.values(userIds);
  if (ids.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', ids).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', ids).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', ids).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', ids).execute();
    await db.deleteFrom('users').where('id', 'in', ids).execute();
    await db
      .deleteFrom('login_attempts')
      .where('email_lc', 'in', Object.values(emails).map((email) => email!.toLowerCase()))
      .execute();
  }
  await destroyDb();
});

describe('the Marketer runs marketing, and not the audit', () => {
  it('holds integration read and update, and no global audit read', async () => {
    const { grants } = await loadGrants(userIds.Marketer);
    expect(can(grants, 'integration', 'read')).toBe(true);
    expect(can(grants, 'integration', 'update')).toBe(true);
    expect(can(grants, 'audit', 'read')).toBe(false);
  });

  it('opens the marketing screen and the connector', async () => {
    const tracking = await trackingOf('Marketer');
    expect(tracking.status).toBe(200);
    expect(tracking.body.catalog.length).toBe(9);
    expect(Array.isArray(tracking.body.history)).toBe(true);
    expect(tracking.body.config).toEqual({});

    const sheets = await sheetsHandler(
      request('/sheets', { method: 'GET', cookie: `shamah_session=${actors.Marketer!.token}` }),
    );
    expect(sheets.status).toBe(200);
    expect(((await sheets.json()) as { integration: unknown }).integration).toBeTruthy();
  });

  it('refuses an ID that could escape the snippet, before writing anything', async () => {
    const res = await call('Marketer', 'PATCH', {
      providers: { gtm: { id: '<script>alert(1)</script>', enabled: true } },
    });
    const body = (await res.json()) as { error: string; provider: string };
    expect(res.status).toBe(422);
    expect(body).toMatchObject({ error: 'invalid_id', provider: 'gtm' });
    expect((await trackingOf('Marketer')).body.config).toEqual({});
  });

  it('saves a tag and records who saved it', async () => {
    const res = await call('Marketer', 'PATCH', { providers: { gtm: { id: 'GTM-S3E1234', enabled: true } } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as TrackingBody).plan.gtm).toBe('GTM-S3E1234');

    const { body } = await trackingOf('Marketer');
    expect(body.config.gtm).toMatchObject({ id: 'GTM-S3E1234', enabled: true });
    const row = body.history.find((entry) => entry.actorEmail === emails.Marketer && entry.entityId === 'tracking.providers');
    expect(row).toBeDefined();
    expect(row?.revertable).toBe(true);
    expect(row?.before).toEqual({});
    expect(row?.after).toEqual({ gtm: { id: 'GTM-S3E1234', enabled: true } });
  });

  it('restores the earlier value as a new save and keeps the row it restored from', async () => {
    const beforeRevert = await trackingOf('Marketer');
    const target = beforeRevert.body.history.find(
      (entry) => entry.actorEmail === emails.Marketer && entry.entityId === 'tracking.providers',
    );
    expect(target).toBeDefined();

    const res = await call('Marketer', 'POST', { action: 'revert', id: target!.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as TrackingBody;
    expect(body.config).toEqual({});
    expect(body.plan.gtm).toBeNull();

    const after = await trackingOf('Marketer');
    expect(after.body.history).toHaveLength(beforeRevert.body.history.length + 1);
    const revertRow = after.body.history.find(
      (entry) => entry.actorEmail === emails.Marketer && entry.before && (entry.before as { gtm?: unknown }).gtm,
    );
    expect(revertRow?.after).toEqual({});
    expect(after.body.history.some((entry) => entry.id === target!.id)).toBe(true);
  });

  it('names the failures instead of guessing', async () => {
    const malformed = await call('Marketer', 'POST', { action: 'revert', id: 'one' });
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toBe('invalid_input');

    const unknown = await call('Marketer', 'POST', { action: 'revert', id: 999_999_999 });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toBe('not_found');

    const sheetRow = await db
      .insertInto('audit_log')
      .values({
        actor_id: userIds.Owner,
        actor_email: emails.Owner!,
        actor_kind: 'user',
        action: 'integration.update',
        entity_type: 'integration',
        entity_id: 'sheets',
        before_json: json({ maskedUrl: 'https://script.google.com/macros/s/…/exec', tokenSet: false, enabled: true }),
        after_json: json({ maskedUrl: 'https://script.google.com/macros/s/…/exec', tokenSet: false, enabled: false }),
      })
      .executeTakeFirstOrThrow();
    const refused = await call('Marketer', 'POST', { action: 'revert', id: Number(sheetRow.insertId) });
    expect(refused.status).toBe(422);
    expect(((await refused.json()) as { error: string }).error).toBe('not_revertable');
  });

  it('answers a Viewer 403 before reading the body', async () => {
    const read = await call('Viewer', 'GET');
    expect(read.status).toBe(403);

    const write = await call('Viewer', 'POST', { action: 'revert', id: 'not-a-number' });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { error: string }).error).toBe('forbidden');
  });

  it('keeps an installation check out of the change history', async () => {
    const check = await call('Marketer', 'POST', { action: 'check', provider: 'gtm', lang: 'ar' });
    expect(check.status).toBe(200);

    const { body } = await trackingOf('Marketer');
    const known = new Set(['tracking.providers', 'sheets', 'sheets.test', 'sheets.resend', 'sheets.drain']);
    expect(body.history.length).toBeGreaterThan(0);
    for (const row of body.history) expect(known.has(row.entityId), row.entityId).toBe(true);
  });
});
