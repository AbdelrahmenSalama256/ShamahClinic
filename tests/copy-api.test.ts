/**
 * The texts screen's one write path, called as each of the six roles and as a caller whose
 * grant covers only one language.
 *
 * The endpoint's whole design is a response to two rules in `guard()`: permission is decided
 * before the body is parsed, and the scope comes from the request line. So the language lives
 * in `?locale=`, and one test here aims a request at the language the caller does *not* hold
 * while naming the language it does in the JSON body — if the body were ever read for scope,
 * that call would succeed.
 *
 * The other half is what a reset does. A sentence an owner clears is not deleted: the row
 * stays with `deleted_at` set, and saving the same address again brings it back. Rows this run
 * creates are removed by `afterAll`; nothing else in `shamah_cms_test` is touched.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { json } from '../src/lib/db/json';
import { assertTestDb } from '../src/lib/db/guard';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { can } from '../src/lib/auth/permissions';
import { syncRoles, type RoleName } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser } from '../src/lib/auth/users';
import { COPY_BY_KEY, COPY_CATALOG } from '../src/lib/copy/catalog';
import { copyHandler } from '../src/lib/copy/api';
import { pairKey } from '../src/lib/copy/shared';
import { readCopy, readCopyRows } from '../src/lib/copy/store';
import { textsCenterData } from '../src/lib/console/texts-center';
import type { ContentLocale } from '../src/lib/content/kinds';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-copy-2026';
const ROLES: RoleName[] = ['Owner', 'Admin', 'Editor', 'SEO', 'Marketer', 'Viewer'];
const LIMITED = 'arabic-only';
const emails: Record<string, string> = Object.fromEntries(
  [...ROLES, LIMITED].map((name) => [name, `copy-${name.toLowerCase()}-${run}@example.invalid`]),
);
const userIds: Record<string, string> = {};
const actors: Record<string, { token: string; csrf: string }> = {};

/** Three addresses of the site's own copy — one of them carries a slot — and one that belongs to nothing. */
const A = COPY_CATALOG[0]!;
const B = COPY_CATALOG[1]!;
const SLOT = COPY_CATALOG.find((entry) => entry !== A && entry !== B && entry.ar.includes('{0}'))!;
const ORPHAN_KEY = (() => {
  for (let i = 0; i < 100; i++) {
    const key = `copy.${createHash('sha256').update(`orphan-${run}-${i}`, 'utf8').digest('hex').slice(0, 12)}`;
    if (!COPY_BY_KEY.has(key)) return key;
  }
  throw new Error('no free copy address');
})();

const AR_TEXT = `صياغة المالك ${run}`;
const EN_TEXT = `The owner’s wording ${run}`;
const LIMITED_TEXT = `صياغة محرّك الاختبار ${run}`;
const SLOT_TEXT = `عندنا {0} فقط ${run}`;
const ORPHAN_DEFAULT = { ar: 'جملة غيّرها المطور', en: 'A sentence a developer reworded' };

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
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
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

/** The screen sends the language in the query string; `locale: null` sends no language at all. */
async function call(
  actor: string,
  input: { locale: ContentLocale | null; key: string; value: string; extra?: Record<string, unknown> },
  options: { csrf?: boolean; method?: string } = {},
): Promise<Response> {
  const session = actors[actor];
  if (!session) throw new Error(`No session for ${actor}`);
  const method = options.method ?? 'POST';
  const headers = new Headers({ 'x-forwarded-for': ip(), cookie: `shamah_session=${session.token}` });
  // A GET carries no body — the request cannot even be built with one.
  if (method !== 'GET') {
    headers.set('content-type', 'application/json');
    if (options.csrf !== false) headers.set(CSRF_HEADER, session.csrf);
  }
  const query = input.locale === null ? '' : `?locale=${input.locale}`;
  return copyHandler(
    new Request(`http://localhost/api/console/copy${query}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify({ key: input.key, value: input.value, ...(input.extra ?? {}) }),
    }),
  );
}

async function code(res: Response): Promise<string> {
  return String(((await res.json()) as { error?: string }).error ?? '');
}

async function stored(res: Response): Promise<{ ar: string | null; en: string | null }> {
  return ((await res.json()) as { stored: { ar: string | null; en: string | null } }).stored;
}

async function rowOf(key: string) {
  return db
    .selectFrom('content_fields')
    .select(['pub_ar', 'pub_en', 'default_ar', 'default_en', 'status', 'enabled', 'deleted_at', 'section_id', 'version'])
    .where('field_key', '=', key)
    .executeTakeFirst();
}

async function grantsOf(actor: string) {
  return (await loadGrants(userIds[actor])).grants;
}

beforeAll(async () => {
  assertTestDb();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  for (const name of ROLES) {
    const userId = await createUser({ email: emails[name], password: PASSWORD, name: `Copy ${name}` });
    const role = await db.selectFrom('roles').select('id').where('name', '=', name).executeTakeFirstOrThrow();
    await assignRole(userId, role.id);
    userIds[name] = userId;
    actors[name] = await login(emails[name]);
  }

  // A caller with no role and one language: the only way to prove the grant is honoured as
  // written, and that a body cannot widen it.
  const limited = await createUser({ email: emails[LIMITED], password: PASSWORD, name: `Copy Arabic only ${run}` });
  const owner = await db.selectFrom('users').select('id').where('email_lc', '=', emails[ROLES[0]]).executeTakeFirstOrThrow();
  await db
    .insertInto('permission_grants')
    .values({
      id: randomUUID(),
      user_id: limited,
      resource: 'page',
      action: 'update',
      scope: json({ locales: ['ar'] }),
      granted_by: owner.id,
      expires_at: null,
      revoked_at: null,
    })
    .execute();
  userIds[LIMITED] = limited;
  actors[LIMITED] = await login(emails[LIMITED]);
});

afterAll(async () => {
  // Only the addresses this run wrote, including the soft-deleted one it stranded.
  await db.deleteFrom('content_fields').where('field_key', 'in', [A.key, B.key, SLOT.key, ORPHAN_KEY]).execute();

  const ids = Object.values(userIds);
  if (ids.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', ids).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', ids).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', ids).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', ids).execute();
    await db.deleteFrom('users').where('id', 'in', ids).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', Object.values(emails)).execute();
  }
  await destroyDb();
});

describe('the texts screen follows the role matrix', () => {
  it('opens for every role and says which of them may write this language', async () => {
    // Editor publishes both languages, so both tabs are live for it; the three workers that
    // read pages get a read-only screen.
    const writable = { Owner: true, Admin: true, Editor: true, SEO: false, Marketer: false, Viewer: false };
    for (const name of ROLES) {
      const grants = await grantsOf(name);
      for (const locale of ['ar', 'en'] as const) {
        const data = await textsCenterData({ grants, locale });
        expect(data, `${name} ${locale} has no screen`).not.toBeNull();
        expect(data?.locale).toBe(locale);
        expect(data?.writable, `${name} ${locale} writable`).toBe(writable[name]);
        expect(can(grants, 'page', 'update', { locales: locale }), `${name} ${locale} grant`).toBe(writable[name]);
      }
    }
  });

  it('lists every sentence the site was built with, one group per part of the site', async () => {
    const data = await textsCenterData({ grants: await grantsOf('Owner'), locale: 'ar' });
    const keys = (data?.rows ?? []).map((row) => row.key);
    expect(keys.length).toBe(COPY_CATALOG.length);
    expect(new Set(keys).size).toBe(COPY_CATALOG.length);
    for (const entry of COPY_CATALOG) expect(keys).toContain(entry.key);
    // Grouped: rows of one area stay together, so the same heading never opens twice.
    const areas = (data?.rows ?? []).map((row) => row.area);
    const runs: string[] = [];
    for (const area of areas) if (runs.at(-1) !== area) runs.push(area);
    expect(runs.length).toBe(new Set(areas).size);
  });

  it('shows nothing at all to a caller whose grants do not read pages', async () => {
    const grants = await grantsOf(LIMITED);
    expect(can(grants, 'page', 'read', {})).toBe(false);
    expect(await textsCenterData({ grants, locale: 'ar' })).toBeNull();
  });
});

describe('the one write path', () => {
  it('writes the address it was aimed at, and audits the address and the language', async () => {
    const res = await call('Owner', { locale: 'ar', key: A.key, value: AR_TEXT });
    expect(res.status).toBe(200);
    expect(await stored(res)).toEqual({ ar: AR_TEXT, en: null });

    expect(await rowOf(A.key)).toMatchObject({
      pub_ar: AR_TEXT,
      pub_en: null,
      default_ar: A.ar,
      default_en: A.en,
      status: 'published',
      enabled: 1,
      deleted_at: null,
    });

    const audit = await db
      .selectFrom('audit_log')
      .select(['action', 'entity_type', 'entity_id', 'actor_email'])
      .where('entity_type', '=', 'copy')
      .where('entity_id', '=', `${A.key}#ar`)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    expect(audit).toMatchObject({ action: 'page.update', entity_type: 'copy', actor_email: emails.Owner });
  });

  it('does not touch the other language, because one address is two records', async () => {
    const res = await call('Admin', { locale: 'en', key: A.key, value: EN_TEXT });
    expect(res.status).toBe(200);
    expect(await stored(res)).toEqual({ ar: AR_TEXT, en: EN_TEXT });
    expect((await rowOf(A.key))?.pub_ar).toBe(AR_TEXT);
  });

  it('reads the scope from the request line, never from the body', async () => {
    // This caller holds `page update` for Arabic only. Its JSON names English; the URL names
    // Arabic. A handler that took its scope from the payload would write English here.
    const res = await call(LIMITED, { locale: 'ar', key: B.key, value: LIMITED_TEXT, extra: { locale: 'en' } });
    expect(res.status).toBe(200);
    expect(await stored(res)).toEqual({ ar: LIMITED_TEXT, en: null });
    expect((await rowOf(B.key))?.pub_en).toBeNull();
  });

  it('refuses a language this caller does not hold before it reads the body', async () => {
    // Shaped like a valid save; only the URL differs from the call that just succeeded.
    const res = await call(LIMITED, { locale: 'en', key: B.key, value: 'لا' });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('forbidden');
    expect((await rowOf(B.key))?.pub_en).toBeNull();
  });

  it('refuses the three read-only roles, and a request that names no language', async () => {
    for (const name of ['SEO', 'Marketer', 'Viewer'] as const) {
      const res = await call(name, { locale: 'ar', key: A.key, value: 'ممنوع' });
      expect(res.status, name).toBe(403);
      expect(await code(res), name).toBe('forbidden');
    }
    // A locale-less URL names a scope no locale-scoped grant matches, so even Editor is
    // refused — refused before the body, which here is shaped to fail the schema instead.
    const editor = await call('Editor', { locale: null, key: 'not-a-copy-key', value: '' });
    expect(editor.status).toBe(403);
    expect((await rowOf(A.key))?.pub_ar).toBe(AR_TEXT); // untouched by every call above
  });

  it('asks a role that holds every language for the language too', async () => {
    const res = await call('Owner', { locale: null, key: A.key, value: 'بلا لغة' });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('locale_required');
    expect((await rowOf(A.key))?.pub_ar).toBe(AR_TEXT);
  });

  it('refuses a body that names a sentence the site does not render', async () => {
    const res = await call('Owner', { locale: 'ar', key: ORPHAN_KEY, value: 'لا شيء يعرض هذا' });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('unknown_key');
    expect(await rowOf(ORPHAN_KEY)).toBeUndefined();
  });

  it('refuses an address that is not an address at all', async () => {
    const res = await call('Owner', { locale: 'ar', key: 'copy.ffffffffffzz', value: 'x' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: unknown };
    expect(body.error).toBe('invalid_input');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('keeps the slot an owner reworded around', async () => {
    const res = await call('Editor', { locale: 'ar', key: SLOT.key, value: SLOT_TEXT });
    expect(res.status).toBe(200);
    expect((await rowOf(SLOT.key))?.pub_ar).toBe(SLOT_TEXT);
  });

  it('treats an empty field as the site’s own wording, not as an empty string', async () => {
    const res = await call('Owner', { locale: 'ar', key: A.key, value: '   ' });
    expect(res.status).toBe(200);
    expect(await stored(res)).toEqual({ ar: null, en: EN_TEXT });
    const row = await rowOf(A.key);
    expect(row?.pub_ar).toBeNull();
    // One language still overridden is not history yet.
    expect(row?.deleted_at).toBeNull();
  });

  it('keeps the row as history, and revives it when the same address is written again', async () => {
    const before = await rowOf(A.key);
    const cleared = await call('Owner', { locale: 'en', key: A.key, value: '' });
    expect(cleared.status).toBe(200);
    expect(await stored(cleared)).toEqual({ ar: null, en: null });
    const kept = await rowOf(A.key);
    expect(kept?.deleted_at).toBeInstanceOf(Date);
    expect(kept).toBeDefined(); // kept, never dropped

    const res = await call('Owner', { locale: 'ar', key: A.key, value: AR_TEXT });
    expect(res.status).toBe(200);
    const after = await rowOf(A.key);
    expect(after?.deleted_at).toBeNull();
    expect(after?.pub_ar).toBe(AR_TEXT);
    expect(Number(after?.version)).toBeGreaterThan(Number(before?.version));
  });

  it('clears an override stranded by a developer, the one way it can go', async () => {
    await db
      .insertInto('content_fields')
      .values({
        id: randomUUID(),
        field_key: ORPHAN_KEY,
        label: 'جملة لم تعد صفحة تعرضها',
        role: 'text',
        route: '',
        section_id: 'home',
        default_ar: ORPHAN_DEFAULT.ar,
        default_en: ORPHAN_DEFAULT.en,
        draft_ar: 'نص معلّق',
        draft_en: null,
        pub_ar: 'نص معلّق',
        pub_en: null,
        status: 'published',
        enabled: 1,
        source_file: 'src/components/home/Gone.tsx',
        source_line: 12,
        created_by: userIds.Owner,
        updated_by: userIds.Owner,
        version: 1,
      })
      .execute();

    const data = await textsCenterData({ grants: await grantsOf('Owner'), locale: 'ar' });
    expect(data?.orphaned.map((row) => row.key)).toContain(ORPHAN_KEY);
    const onRows = (data?.rows ?? []).filter((row) => row.override.ar !== null || row.override.en !== null).length;
    expect(data?.changed).toBe(onRows + (data?.orphaned.length ?? 0));

    const res = await call('Owner', { locale: 'ar', key: ORPHAN_KEY, value: '' });
    expect(res.status).toBe(200);
    expect(await stored(res)).toEqual({ ar: null, en: null });
    const row = await rowOf(ORPHAN_KEY);
    expect(row?.pub_ar).toBeNull();
    expect(row?.deleted_at).toBeInstanceOf(Date);

    const cleared = await textsCenterData({ grants: await grantsOf('Owner'), locale: 'ar' });
    expect(cleared?.orphaned.map((orphan) => orphan.key)).not.toContain(ORPHAN_KEY);
  });

  it('asks for the CSRF header like every other write', async () => {
    const res = await call('Owner', { locale: 'ar', key: B.key, value: 'بلا رأس CSRF' }, { csrf: false });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('csrf_failed');
    expect((await rowOf(B.key))?.pub_ar).toBe(LIMITED_TEXT);
  });

  it('does not answer GET: the rows are read on the server-rendered screen', async () => {
    const res = await call('Owner', { locale: 'ar', key: A.key, value: '' }, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(await code(res)).toBe('method_not_allowed');
  });
});

describe('what the site reads when it renders', () => {
  it('answers the component’s own pair with the owner’s sentence', async () => {
    // One read per language, taken after every write above has settled: `readCopy` is
    // request-scoped, and this is the dictionary the public layout hands to `t()`.
    const ar = await readCopy('ar');
    expect(ar[pairKey(A.ar, A.en)]).toBe(AR_TEXT);
    expect(ar[pairKey(B.ar, B.en)]).toBe(LIMITED_TEXT);
    expect(ar[pairKey(SLOT.ar, SLOT.en)]).toBe(SLOT_TEXT);

    const en = await readCopy('en');
    expect(en[pairKey(A.ar, A.en)]).toBeUndefined();
    expect(Object.keys(en).length).toBe(0);
  });

  it('leaves a sentence nobody touched out of the dictionary', async () => {
    const untouched = COPY_CATALOG.find((entry) => entry !== A && entry !== B && entry !== SLOT)!;
    expect((await readCopy('ar'))[pairKey(untouched.ar, untouched.en)]).toBeUndefined();
  });

  it('lists the live rows for the screen, and not the one it retired', async () => {
    const rows = await readCopyRows();
    const keys = rows.map((row) => row.key);
    expect(keys).toContain(A.key);
    expect(keys).toContain(B.key);
    expect(keys).not.toContain(ORPHAN_KEY);
    const saved = rows.find((row) => row.key === A.key);
    expect(saved).toMatchObject({ ar: AR_TEXT, en: null, defaultAr: A.ar, defaultEn: A.en, sourceFile: A.file });
  });

  it('marks those rows changed on the screen the owner sees', async () => {
    const data = await textsCenterData({ grants: await grantsOf('Editor'), locale: 'ar' });
    const row = data?.rows.find((entry) => entry.key === A.key);
    expect(row?.override).toEqual({ ar: AR_TEXT, en: null });
    expect(data?.total).toBe(COPY_CATALOG.length);
    expect(data?.changed).toBeGreaterThan(0);
  });
});
