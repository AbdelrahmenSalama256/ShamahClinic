/**
 * The SEO section's one write path, called as each of the six roles.
 *
 * The pure matrix lives in `seo.test.ts`; this suite proves the endpoint reads it: the
 * three roles that may write get a save, the other three are refused before a character
 * of the body is parsed, the audit row names the address and the person, a malformed
 * path from an allowed role is a 400 rather than a write, and an empty pair clears the
 * row (which is how the screen offers "back to the inherited copy").
 *
 * Runs against the disposable `shamah_cms_test` database and removes only the users and
 * the one synthetic address it creates.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { can } from '../src/lib/auth/permissions';
import { syncRoles, type RoleName } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser } from '../src/lib/auth/users';
import { seoHandler } from '../src/lib/content/seo-api';
import { SEO_ENTITY_TYPE } from '../src/lib/content/seo';
import { seoCenterData } from '../src/lib/console/seo-center';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-seo-2026';
/** Valid by `isSeoPath()`, and served by no page — so it can never touch a real row. */
const PATH = `/__seo-proof-${run}`;
const ROLES: RoleName[] = ['Owner', 'Admin', 'Editor', 'SEO', 'Marketer', 'Viewer'];
const emails: Partial<Record<RoleName, string>> = Object.fromEntries(
  ROLES.map((role) => [role, `seo-${role.toLowerCase()}-${run}@example.invalid`]),
) as Partial<Record<RoleName, string>>;
const userIds: Record<string, string> = {};
const actors: Partial<Record<RoleName, { token: string; csrf: string }>> = {};

let ipSeq = 0;
const ip = (): string => `198.51.100.${++ipSeq % 254}`;

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
  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const body = (await res.json()) as { csrfToken: string };
  return { token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken };
}

async function call(actor: RoleName, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
  const session = actors[actor];
  if (!session) throw new Error(`No session for ${actor}`);
  const headers = new Headers({ 'x-forwarded-for': ip() });
  if (method !== 'GET') {
    headers.set('content-type', 'application/json');
    headers.set(CSRF_HEADER, session.csrf);
  }
  headers.set('cookie', `shamah_session=${session.token}`);
  return seoHandler(
    new Request('http://localhost/api/console/seo', {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    }),
  );
}

async function rowFor(locale: 'ar' | 'en') {
  return db
    .selectFrom('seo_entries')
    .select(['title', 'description', 'robots', 'og_image'])
    .where('entity_type', '=', SEO_ENTITY_TYPE)
    .where('entity_id', '=', PATH)
    .where('locale', '=', locale)
    .executeTakeFirst();
}

beforeAll(async () => {
  assertTestDb();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  for (const name of ROLES) {
    const email = emails[name]!;
    const userId = await createUser({ email, password: PASSWORD, name: `SEO ${name}` });
    const role = await db.selectFrom('roles').select('id').where('name', '=', name).executeTakeFirstOrThrow();
    await assignRole(userId, role.id);
    userIds[name] = userId;
    actors[name] = await login(email);
  }
});

afterAll(async () => {
  await db.deleteFrom('seo_entries').where('entity_type', '=', SEO_ENTITY_TYPE).where('entity_id', '=', PATH).execute();

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

describe('the SEO screen follows the role matrix', () => {
  it('lets every role read the screen, and only three write it', async () => {
    const expected: Record<RoleName, { read: boolean; update: boolean }> = {
      Owner: { read: true, update: true },
      Admin: { read: true, update: true },
      Editor: { read: true, update: false },
      SEO: { read: true, update: true },
      Marketer: { read: true, update: false },
      Viewer: { read: true, update: false },
    };
    for (const name of ROLES) {
      const { grants } = await loadGrants(userIds[name]);
      expect({ read: can(grants, 'seo', 'read'), update: can(grants, 'seo', 'update') }, name).toEqual(expected[name]);
    }
  });

  it('shows a read-only screen to a role that may not write', async () => {
    const editor = await seoCenterData({ grants: (await loadGrants(userIds.Editor)).grants, locale: 'ar' });
    const seo = await seoCenterData({ grants: (await loadGrants(userIds.SEO)).grants, locale: 'ar' });
    expect(editor?.writable).toBe(false);
    expect(seo?.writable).toBe(true);
    expect(editor?.rows.length).toBeGreaterThan(0);
  });
});

describe('the one write path', () => {
  it('accepts a save from the SEO role and audits the address and the person', async () => {
    const res = await call('SEO', 'POST', {
      path: PATH,
      locale: 'ar',
      title: 'عنوان اختبار الظهور',
      description: 'وصف اختبار الظهور في البحث',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { override: { title: string; description: string } };
    expect(body.override).toMatchObject({ title: 'عنوان اختبار الظهور', description: 'وصف اختبار الظهور في البحث' });
    expect(await rowFor('ar')).toMatchObject({ title: 'عنوان اختبار الظهور' });

    const audit = await db
      .selectFrom('audit_log')
      .select(['action', 'entity_type', 'entity_id', 'actor_email'])
      .where('entity_type', '=', 'seo')
      .where('entity_id', '=', `${PATH}#ar`)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    expect(audit).toMatchObject({
      action: 'seo.update',
      entity_type: 'seo',
      entity_id: `${PATH}#ar`,
      actor_email: emails.SEO,
    });
  });

  it('lets Owner and Admin save as well', async () => {
    for (const actor of ['Owner', 'Admin'] as const) {
      const res = await call(actor, 'POST', { path: PATH, locale: 'en', title: `${actor} title`, description: '' });
      expect(res.status, actor).toBe(200);
    }
    expect((await rowFor('en'))?.title).toBe('Admin title');
  });

  it('refuses the three read-only roles before it reads the body', async () => {
    for (const actor of ['Editor', 'Marketer', 'Viewer'] as const) {
      // Deliberately malformed: a permission check that ran after zod would answer 400.
      const res = await call(actor, 'POST', { path: 'not-a-path' });
      expect(res.status, actor).toBe(403);
      expect(((await res.json()) as { error: string }).error, actor).toBe('forbidden');
    }
    expect(await rowFor('ar')).toBeTruthy(); // untouched by the refused calls
  });

  it('answers a malformed path from an allowed role with a 400, not a write', async () => {
    const res = await call('SEO', 'POST', { path: 'about', locale: 'ar', title: 'x', description: 'y' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: unknown };
    expect(body.error).toBe('invalid_input');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('keeps the share card and noindex when the two-field table saves the pair', async () => {
    const full = await call('SEO', 'POST', {
      path: PATH,
      locale: 'ar',
      title: 'عنوان اختبار الظهور',
      description: '',
      focusKeyword: 'كلمة اختبار',
      ogImage: '/uploads/test-share.webp',
      canonical: '/about',
      noindex: true,
    });
    expect(full.status).toBe(200);
    // The SEO center's row posts only the pair; every other field must survive it.
    const pair = await call('SEO', 'POST', { path: PATH, locale: 'ar', title: 'عنوان جديد', description: 'وصف' });
    expect(((await pair.json()) as { override: unknown }).override).toMatchObject({
      title: 'عنوان جديد',
      focusKeyword: 'كلمة اختبار',
      ogImage: '/uploads/test-share.webp',
      canonical: '/about',
      noindex: true,
    });
    expect(await rowFor('ar')).toMatchObject({ robots: 'noindex,follow', og_image: '/uploads/test-share.webp' });
    // A share image from another site's protocol-relative address is refused outright.
    const bad = await call('SEO', 'POST', { path: PATH, locale: 'ar', title: 'x', description: '', ogImage: '//evil.example/a.jpg' });
    expect(bad.status).toBe(400);
    // Back to the pair alone, so the next case starts from a row it can clear.
    await call('SEO', 'POST', { path: PATH, locale: 'ar', title: 'عنوان جديد', description: 'وصف', focusKeyword: '', ogImage: '', canonical: '', noindex: false });
  });

  it('clears the red row when both fields are emptied', async () => {
    const res = await call('SEO', 'POST', { path: PATH, locale: 'ar', title: '  ', description: '' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { override: unknown }).override).toBeNull();
    expect(await rowFor('ar')).toBeUndefined();
    // The English row the Admin wrote is untouched: the key includes the language.
    expect((await rowFor('en'))?.title).toBe('Admin title');
  });

  it('does not answer GET: reads happen on the server-rendered screen', async () => {
    const res = await call('Owner', 'GET');
    expect(res.status).toBe(405);
    expect(((await res.json()) as { error: string }).error).toBe('method_not_allowed');
  });
});
