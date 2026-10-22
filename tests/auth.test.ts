/**
 * BK-3 auth core, against the disposable `shamah_cms_test` database.
 *
 * The parts worth proving are the ones a reviewer cannot see in the code: that
 * permission is decided before the body is parsed, that a revoked or expired
 * session stops working, that the throttle actually bites, and that a mutation
 * leaves an audit row.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { passwordProblem, hashPassword, verifyPassword, verifyPasswordOrDecoy } from '../src/lib/auth/password';
import { can, type Grant } from '../src/lib/auth/permissions';
import { createSession, findUserByEmail, loadAuth, revokeAllSessions } from '../src/lib/auth/sessions';
import { checkThrottle, recordLoginAttempt } from '../src/lib/auth/throttle';
import { guard } from '../src/lib/auth/guard';
import { changePasswordHandler, loginHandler, logoutHandler, meHandler } from '../src/lib/auth/login';
import { assignRole, createUser, getOrCreateRole, setPassword } from '../src/lib/auth/users';
import { sha256 } from '../src/lib/auth/tokens';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-console-2026';
const ownerEmail = `bk3-owner-${run}@example.invalid`;
const writerEmail = `bk3-writer-${run}@example.invalid`;
const tempEmail = `bk3-temp-${run}@example.invalid`;
const nobodyEmail = `nobody-${run}@example.invalid`;

const ownerRoleId = { value: '' };
const writerRoleId = { value: '' };
const tempRoleId = { value: '' };
const userIds: string[] = [];

let ipSeq = 0;
const ip = (): string => `203.0.113.${++ipSeq % 254}`;

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip());
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

function sessionCookie(token: string): string {
  return `shamah_session=${token}`;
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

/** The route every guard test runs through: a settings write, the smallest real mutation. */
function settingRoute(req: Request): Promise<Response> {
  return guard<{ note: string }, { saved: string }>(
    req,
    { resource: 'setting', action: 'update', schema: z.object({ note: z.string().min(1) }) },
    async ({ input }) => ({
      data: { saved: input.note },
      audit: { entityType: 'setting', entityId: `bk3-${run}`, before: { note: 'old' }, after: { note: input.note } },
    }),
  );
}

async function login(email: string, password: string): Promise<{ token: string; csrf: string; res: Response }> {
  const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password }) }));
  const body = res.ok ? ((await res.json()) as { csrfToken: string }) : { csrfToken: '' };
  return { token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken, res };
}

async function auditRows(action: string): Promise<Array<{ actor_email: string; entity_id: string; after_json: unknown }>> {
  return await db
    .selectFrom('audit_log')
    .select(['actor_email', 'entity_id', 'after_json'])
    .where('action', '=', action)
    .where('entity_id', 'like', `bk3-${run}%`)
    .execute();
}
beforeAll(async () => {
  assertTestDb();

  ownerRoleId.value = await getOrCreateRole('Owner', { is_system: true, is_owner: true });
  writerRoleId.value = await getOrCreateRole(`bk3-writer-${run}`, { is_system: false });
  tempRoleId.value = await getOrCreateRole(`bk3-temp-${run}`, { is_system: false });

  await db.insertInto('role_permissions').values([
    { id: randomUUID(), role_id: writerRoleId.value, resource: 'setting', action: 'update', scope: json(null) },
    { id: randomUUID(), role_id: writerRoleId.value, resource: 'article', action: 'read', scope: json({ locales: ['ar'] }) },
    { id: randomUUID(), role_id: writerRoleId.value, resource: 'lead', action: 'read', scope: json({ leadSources: [] }) },
    // The must-change-password account needs a real grant, otherwise the guard
    // would answer 403 forbidden and never reach the password rule.
    { id: randomUUID(), role_id: tempRoleId.value, resource: 'setting', action: 'update', scope: json(null) },
  ]).execute();

  userIds.push(
    await createUser({ email: ownerEmail, password: PASSWORD, name: 'BK3 Owner' }),
    await createUser({ email: writerEmail, password: PASSWORD, name: 'BK3 Writer' }),
    await createUser({ email: tempEmail, password: PASSWORD, name: 'BK3 Temp', mustChangePassword: true }),
  );
  await assignRole(userIds[0], ownerRoleId.value);
  await assignRole(userIds[1], writerRoleId.value);
  await assignRole(userIds[2], tempRoleId.value);
});

afterAll(async () => {
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db
      .deleteFrom('login_attempts')
      .where('email_lc', 'in', [ownerEmail, writerEmail, tempEmail, nobodyEmail].map((email) => email.toLowerCase()))
      .execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('role_permissions').where('role_id', 'in', [writerRoleId.value, tempRoleId.value]).execute();
    await db.deleteFrom('roles').where('id', 'in', [writerRoleId.value, tempRoleId.value]).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await destroyDb();
});

describe('passwords', () => {
  it('hashes at cost 12 and verifies both ways', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash.slice(0, 7)).toBe('$2b$12$');
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}-x`, hash)).toBe(false);
  });

  it('spends the same work on an unknown address, and still says no', async () => {
    expect(await verifyPasswordOrDecoy(PASSWORD, null)).toBe(false);
  });

  it('refuses the passwords bcrypt would silently truncate or too few characters to guess', () => {
    expect(passwordProblem('short1')).toMatch('at least 12');
    expect(passwordProblem('alllettersnodigits')).toMatch('digit');
    expect(passwordProblem('x'.repeat(80))).toMatch('bytes');
    expect(passwordProblem(PASSWORD)).toBeNull();
  });
});

describe('can()', () => {
  const grant = (resource: string, action: string, scope: Grant['scope']): Grant => ({ resource, action, scope });

  it('treats a wildcard grant as everything', () => {
    expect(can([grant('*', '*', null)], 'lead', 'export')).toBe(true);
  });

  it('narrows a scoped grant to the value the request names', () => {
    const grants = [grant('article', 'read', { locales: ['ar'] })];
    expect(can(grants, 'article', 'read', { locales: 'ar' })).toBe(true);
    expect(can(grants, 'article', 'read', { locales: 'en' })).toBe(false);
    // A grant that names a dimension forces the request to name it too: no accidental all-locales.
    expect(can(grants, 'article', 'read')).toBe(false);
  });

  it('reads an empty scope array as none of it', () => {
    expect(can([grant('lead', 'read', { leadSources: [] })], 'lead', 'read', { leadSources: 'site_form' })).toBe(false);
  });

  it('gives every signed-in user their own account, and nothing above it', () => {
    expect(can([], 'self', 'update')).toBe(true);
    expect(can([], 'self', 'read')).toBe(true);
    expect(can([], 'user', 'delete')).toBe(false);
  });
});

describe('sessions', () => {
  it('loads a live session, and refuses a revoked or expired one', async () => {
    const created = await createSession(userIds[0], { ipHash: sha256(ip()), userAgent: 'vitest' });
    const auth = await loadAuth(created.token);
    expect(auth?.user.email).toBe(ownerEmail);
    expect(auth?.user.roles).toContain('Owner');

    await revokeAllSessions(userIds[0], created.sessionId);
    expect(await loadAuth(created.token)).not.toBeNull();
    expect(await loadAuth(`${created.token}x`)).toBeNull();

    await db.updateTable('sessions').set({ revoked_at: new Date() }).where('id', '=', created.sessionId).execute();
    expect(await loadAuth(created.token)).toBeNull();

    const renewed = await createSession(userIds[0], { ipHash: sha256(ip()), userAgent: 'vitest' });
    await db.updateTable('sessions').set({ expires_at: new Date(Date.now() - 1000) }).where('id', '=', renewed.sessionId).execute();
    expect(await loadAuth(renewed.token)).toBeNull();
    await db.deleteFrom('sessions').where('user_id', '=', userIds[0]).execute();
  });

  it('does not invent a user for a disabled or soft-deleted account', async () => {
    await db.updateTable('users').set({ status: 'disabled' }).where('id', '=', userIds[1]).execute();
    const created = await createSession(userIds[1], { ipHash: sha256(ip()), userAgent: 'vitest' });
    expect(await loadAuth(created.token)).toBeNull();
    await db.updateTable('users').set({ status: 'active' }).where('id', '=', userIds[1]).execute();
    expect((await loadAuth(created.token))?.user.email).toBe(writerEmail);
    await db.deleteFrom('sessions').where('id', '=', created.sessionId).execute();
  });
});

describe('login throttle', () => {
  it('blocks the account after the budget and clears when the owner signs in', async () => {
    const email = `bk3-throttle-${run}@example.invalid`;
    const hash = sha256(ip());
    for (let i = 0; i < 8; i++) await recordLoginAttempt({ email_lc: email, ip_hash: hash, success: false });
    expect((await checkThrottle(email, hash)).allowed).toBe(false);

    await recordLoginAttempt({ email_lc: email, ip_hash: hash, success: true });
    expect((await checkThrottle(email, hash)).allowed).toBe(true);

    await db.deleteFrom('login_attempts').where('email_lc', '=', email).execute();
  });

  it('answers 429 to a caller who keeps guessing, without checking the password again', async () => {
    const email = `bk3-brute-${run}@example.invalid`;
    userIds.push(await createUser({ email, password: PASSWORD }));
    const address = ip();
    for (let i = 0; i < 8; i++) {
      const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: 'wrong-password-1' }), headers: { 'x-forwarded-for': address } }));
      expect([401, 429]).toContain(res.status);
    }
    const blocked = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }), headers: { 'x-forwarded-for': address } }));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: 'too_many_attempts' });

    // Cooldown belongs to the account, not the address: the same credentials
    // from a clean address are refused until the window slides.
    const elsewhere = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) }));
    expect(elsewhere.status).toBe(429);
    expect(elsewhere.headers.get('retry-after')).not.toBeNull();
    await db.deleteFrom('login_attempts').where('email_lc', '=', email).execute();
  });
});

describe('login, me, logout', () => {
  it('rejects a bad password with one message and no cookie', async () => {
    const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email: ownerEmail, password: 'wrong-password-1' }) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    expect(setCookies(res)).toEqual([]);
  });

  it('sets an httpOnly, SameSite=Lax session cookie and a readable csrf cookie', async () => {
    const { token, csrf, res } = await login(ownerEmail, PASSWORD);
    expect(res.status).toBe(200);
    expect(token).toHaveLength(43);
    const [session, csrfCookie] = setCookies(res);
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\//);
    expect(session).not.toMatch(/Secure/); // localhost over http, by design
    expect(csrfCookie).not.toMatch(/HttpOnly/);
    expect(csrf).toHaveLength(43);
    expect(csrf).not.toBe(token);

    const me = await meHandler(request('/auth/me', { cookie: sessionCookie(token) }));
    expect(await me.json()).toMatchObject({ user: { email: ownerEmail, roles: ['Owner'], mustChangePassword: false } });

    const anonymous = await meHandler(request('/auth/me'));
    expect(anonymous.status).toBe(401);

    const out = await logoutHandler(request('/auth', { method: 'DELETE', cookie: sessionCookie(token), headers: { [ 'x-csrf-token' ]: csrf } }));
    expect(out.status).toBe(200);
    expect((await meHandler(request('/auth/me', { cookie: sessionCookie(token) })).then((r) => r.status))).toBe(401);
  });

  it('never says which half of the credentials was wrong, and never for an unknown address', async () => {
    const unknown = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email: nobodyEmail, password: PASSWORD }) }));
    const known = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email: writerEmail, password: 'wrong-password-1' }) }));
    expect(await unknown.json()).toEqual(await known.json());
  });
});

describe('the one enforcement path', () => {
  it('401s before anything else when there is no session', async () => {
    const res = await settingRoute(request('/settings', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('403s on CSRF before it looks at the payload', async () => {
    const { token } = await login(ownerEmail, PASSWORD);
    const res = await settingRoute(request('/settings', { method: 'POST', cookie: sessionCookie(token), body: JSON.stringify({ note: 'x' }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'csrf_failed' });
  });

  it('answers 403, not 400, when the caller lacks the grant — permission is checked before the body is parsed', async () => {
    const { token, csrf } = await login(writerEmail, PASSWORD);
    const res = await settingRoute(
      request('/settings', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ note: 12345 }) }),
    );
    // The Writer has setting.update, so this reaches validation and fails there...
    expect(res.status).toBe(400);

    // ...and the same broken body against a resource they do not have is a 403.
    const forbidden = await guard(request('/leads', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ note: 12345 }) }),
      { resource: 'lead', action: 'delete' },
      async () => ({ data: { never: true } }),
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: 'forbidden', action: 'lead.delete' });
  });

  it('writes one audit row per mutation, with the actor and the before/after', async () => {
    const { token, csrf } = await login(ownerEmail, PASSWORD);
    const note = `hello-${run}`;
    const res = await settingRoute(request('/settings', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ note }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: note });
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);

    const rows = await auditRows('setting.update');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_email).toBe(ownerEmail);
    // mysql2 type-casts the JSON column, so a read is already a value — the
    // same asymmetry `Json<T>` documents (write a string, read a value).
    expect(rows[0].after_json).toEqual({ note });
  });

  it('honours a scoped grant: the Writer reads Arabic articles and nothing else', async () => {
    const { token, csrf } = await login(writerEmail, PASSWORD);
    const ar = await guard(request('/articles?locales=ar', { cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf } }),
      { resource: 'article', action: 'read', target: (req) => { const u = new URL(req.url); return { locales: u.searchParams.get('locales') ?? undefined }; } },
      async () => ({ data: { ok: true } }),
    );
    expect(ar.status).toBe(200);

    const en = await guard(request('/articles?locales=en', { cookie: sessionCookie(token) }),
      { resource: 'article', action: 'read', target: (req) => { const u = new URL(req.url); return { locales: u.searchParams.get('locales') ?? undefined }; } },
      async () => ({ data: { ok: true } }),
    );
    expect(en.status).toBe(403);

    const noSource = await guard(request('/leads', { cookie: sessionCookie(token) }),
      { resource: 'lead', action: 'read' },
      async () => ({ data: { ok: true } }),
    );
    expect(noSource.status).toBe(403);
  });
});

describe('password change', () => {
  it('locks mutations while must_change_password is set, then lets them through', async () => {
    const { token, csrf } = await login(tempEmail, PASSWORD);

    const blocked = await settingRoute(request('/settings', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ note: 'nope' }) }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'password_change_required' });

    const next = 'Rotated-2026-password';
    const changed = await changePasswordHandler(request('/auth/password', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ current: PASSWORD, next }) }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ ok: true });

    const after = await settingRoute(request('/settings', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ note: 'yes' }) }));
    expect(after.status).toBe(200);

    const old = await login(tempEmail, PASSWORD);
    expect(old.res.status).toBe(401);
    const fresh = await login(tempEmail, next);
    expect(fresh.res.status).toBe(200);
    expect(await loadAuth(fresh.token)).not.toBeNull();
  });

  it('refuses a weak new password and the wrong current one', async () => {
    const { token, csrf } = await login(writerEmail, PASSWORD);
    const weak = await changePasswordHandler(request('/auth/password', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ current: PASSWORD, next: 'short1' }) }));
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ error: 'weak_password' });

    const wrong = await changePasswordHandler(request('/auth/password', { method: 'POST', cookie: sessionCookie(token), headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ current: 'not-my-password-1', next: 'Rotated-2026-password' }) }));
    expect(wrong.status).toBe(401);

    const user = await findUserByEmail(writerEmail);
    if (user) await setPassword(user.id, PASSWORD);
  });
});
