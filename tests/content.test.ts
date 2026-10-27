/**
 * BK-6 content, against the disposable `shamah_cms_test` database.
 *
 * What is worth proving here is the part a reviewer cannot see by reading one file:
 *   - `parseWrites` only ever touches the columns it should — one locale's draft,
 *     never another locale's and never a published twin;
 *   - the four guarded handlers answer the way `guard()` orders its checks, so a
 *     role without the grant gets a 403 and never learns what the body was missing;
 *   - publishing moves the copy a visitor reads and nothing before it does, and a
 *     rollback puts an older published copy back without deleting a revision or
 *     overwriting the draft somebody is currently writing;
 *   - a secret setting never leaves the settings endpoint, not even inside a 200, and a
 *     digits-only one stays the string an editor typed rather than becoming a number.
 *
 * Every fixture is named `bk6-<run>` and every row it creates is removed in
 * `afterAll`, including the catalog roles this suite seeds.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { can, type Grant } from '../src/lib/auth/permissions';
import { EDITOR_LIST_KEYS, LIST_KEYS, ROLE_SEEDS, syncRoles } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import { contentActionHandler, contentCollectionHandler, contentItemHandler, settingsHandler } from '../src/lib/content/api';
import { seoHandler } from '../src/lib/content/seo-api';
import { readSeoOverride, readSeoOverrides, saveSeoOverride } from '../src/lib/content/seo';
import { seoCenterData, entitySeoOf } from '../src/lib/console/seo-center';
import { viewItemHandler, viewsHandler } from '../src/lib/console/views-route';
import { kindSpec, parseWrites, type ContentLocale } from '../src/lib/content/kinds';
import { writeScopeQuery, type ListView } from '../src/lib/content/list-view';
import type { ListPage } from '../src/lib/content/summary';
import type { SavedView } from '../src/lib/console/views-route';
import type { ContentRow } from '../src/lib/content/store';
import { syncLists } from '../src/lib/content/lists';
import type { RevisionView } from '../src/lib/content/publish';
import type { SettingView } from '../src/lib/content/settings';
import { contentScreenData } from '../src/lib/console/content-screen';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-content-2026';
const SECRET_VALUE = 'never-leave-the-endpoint';

const emails = {
  Owner: `bk6-owner-${run}@example.invalid`,
  Admin: `bk6-admin-${run}@example.invalid`,
  Editor: `bk6-editor-${run}@example.invalid`,
  // No `list read`, which is what makes the lists screen disappear for this role.
  Marketer: `bk6-marketer-${run}@example.invalid`,
  Viewer: `bk6-viewer-${run}@example.invalid`,
  ArabicOnly: `bk6-ar-only-${run}@example.invalid`,
} satisfies Record<string, string>;

const ar = `bk6-${run}`;
const slug = (name: string): string => `${ar}-${name}`;

interface Session {
  email: string;
  token: string;
  csrf: string;
  grants: Grant[];
}
const actors = {} as Record<keyof typeof emails, Session>;
const userIds: string[] = [];
const arRole = { id: '' };

let ipSeq = 0;
const ip = (): string => `203.0.113.${++ipSeq % 254}`;

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
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

/** The one place a path becomes the handler the route file would have picked. */
function route(req: Request): Promise<Response> {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  if (parts[2] === 'views') return parts.length === 3 ? viewsHandler(req) : viewItemHandler(req);
  if (parts[2] === 'settings') return settingsHandler(req);
  if (parts[2] === 'seo') return seoHandler(req);
  const tail = parts.slice(3);
  if (tail.length === 1) return contentCollectionHandler(req);
  if (tail.length === 2) return contentItemHandler(req);
  return contentActionHandler(req);
}

class Reply {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {}

  get error(): string | undefined {
    return this.body.error as string | undefined;
  }
  get denied(): string | undefined {
    return this.body.action as string | undefined;
  }
  get issues(): { path: string; message: string }[] {
    return (this.body.issues ?? []) as { path: string; message: string }[];
  }
  get row(): ContentRow {
    return this.body.row as ContentRow;
  }
  get rows(): ContentRow[] {
    return (this.body.rows ?? []) as ContentRow[];
  }
  /** A list endpoint answers with one page of summaries, not with documents. */
  get page(): ListPage {
    return this.body.page as ListPage;
  }
  get view(): ListView {
    return this.body.view as ListView;
  }
  get done(): string[] {
    return (this.body.done ?? []) as string[];
  }
  get failed(): { id: string; code: string }[] {
    return (this.body.failed ?? []) as { id: string; code: string }[];
  }
  get views(): SavedView[] {
    return (this.body.views ?? []) as SavedView[];
  }
  get viewRow(): SavedView {
    return this.body.view as SavedView;
  }
  get settings(): SettingView[] {
    return (this.body.rows ?? []) as SettingView[];
  }
  get revisions(): RevisionView[] {
    return (this.body.revisions ?? []) as RevisionView[];
  }
  get locales(): ContentLocale[] {
    return (this.body.locales ?? []) as ContentLocale[];
  }
  get revision(): number {
    return Number(this.body.revision ?? 0);
  }
}

async function raw(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  return route(request(path, init));
}

async function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Reply> {
  const res = await raw(path, init);
  return new Reply(res.status, (await res.json()) as Record<string, unknown>);
}

/** A GET carries a session and no CSRF header — a read writes nothing. */
function read(actor: Session): RequestInit & { cookie: string } {
  return { cookie: `shamah_session=${actor.token}` };
}

function write(actor: Session, method: 'POST' | 'PATCH' | 'DELETE', body: unknown = {}): RequestInit & { cookie: string } {
  return {
    method,
    cookie: `shamah_session=${actor.token}`,
    headers: { [CSRF_HEADER]: actor.csrf },
    body: JSON.stringify(body),
  };
}

async function auditCount(action: string, actor: Session): Promise<number> {
  return (await db.selectFrom('audit_log').select('id').where('action', '=', action).where('actor_email', '=', actor.email).execute()).length;
}

/** Every row this suite can create, by its fixture name — so a crashed run cannot leave residue. */
async function purge(): Promise<void> {
  // A revision is named by the row it belongs to, so collect the ids before the rows go.
  const ids = [
    ...(await db.selectFrom('articles').select('id').where('slug', 'like', 'bk6-%').execute()),
    ...(await db.selectFrom('offers').select('id').where('slug', 'like', 'bk6-%').execute()),
    ...(await db.selectFrom('pages').select('id').where('route', 'like', '/bk6-%').execute()),
    ...(await db.selectFrom('list_items').select('id').where('uid', 'like', 'bk6-%').execute()),
  ].map((row) => row.id);

  await db.deleteFrom('list_items').where('uid', 'like', 'bk6-%').execute();
  await db.deleteFrom('lists').where('list_key', 'in', [...LIST_KEYS]).execute();
  await db.deleteFrom('articles').where('slug', 'like', 'bk6-%').execute();
  await db.deleteFrom('offers').where('slug', 'like', 'bk6-%').execute();
  await db.deleteFrom('pages').where('route', 'like', '/bk6-%').execute();
  await db.deleteFrom('settings').where('group_name', 'like', 'bk6-%').execute();
  await db.deleteFrom('console_views').where('name', 'like', 'bk6-%').execute();
  await db.deleteFrom('seo_entries').where('entity_id', 'like', '/bk6-%').execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

async function login(email: string): Promise<Session> {
  const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) }));
  const body = (await res.json()) as { csrfToken: string };
  const stored = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return { email, token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken, grants: (await loadGrants(stored.id)).grants };
}

beforeAll(async () => {
  assertTestDb();
  await purge();

  const { database } = readDbConfig();
  await syncRoles({ dryRun: false, database });

  // A single-language editor is not in the catalog, and it is the role the locale
  // scoping exists for: everything below about "Arabic only" is measured against it.
  arRole.id = await getOrCreateRole(`bk6-ar-only-${run}`, { is_system: false });
  await db
    .insertInto('role_permissions')
    .values([
      { id: randomUUID(), role_id: arRole.id, resource: 'article', action: 'read', scope: json(null) },
      { id: randomUUID(), role_id: arRole.id, resource: 'article', action: 'create', scope: json({ locales: ['ar'] }) },
      { id: randomUUID(), role_id: arRole.id, resource: 'article', action: 'update', scope: json({ locales: ['ar'] }) },
      { id: randomUUID(), role_id: arRole.id, resource: 'article', action: 'publish', scope: json({ locales: ['ar'] }) },
    ])
    .execute();

  const roleIds = new Map<string, string>();
  for (const role of await db.selectFrom('roles').select(['id', 'name']).execute()) roleIds.set(role.name, role.id);

  for (const [key, email] of Object.entries(emails)) {
    const name = key as keyof typeof emails;
    const roleName = name === 'ArabicOnly' ? `bk6-ar-only-${run}` : name;
    const id = await createUser({ email, password: PASSWORD, name: `BK6 ${name}` });
    await assignRole(id, roleIds.get(roleName) ?? '');
    userIds.push(id);
    actors[name] = await login(email);
  }
});

afterAll(async () => {
  await purge();
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db
      .deleteFrom('login_attempts')
      .where('email_lc', 'in', Object.values(emails).map((email) => email.toLowerCase()))
      .execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await db.deleteFrom('role_permissions').where('role_id', '=', arRole.id).execute();
  await db.deleteFrom('roles').where('id', '=', arRole.id).execute();
  const catalog = await db.selectFrom('roles').select('id').where('name', 'in', ROLE_SEEDS.map((role) => role.name)).execute();
  if (catalog.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', catalog.map((role) => role.id)).execute();
    await db.deleteFrom('roles').where('id', 'in', catalog.map((role) => role.id)).execute();
  }
  await destroyDb();
});

// --- the column map, with no database in sight --------------------------------

describe('parseWrites turns fields into columns and nothing else', () => {
  const article = kindSpec('article');
  const offer = kindSpec('offer');
  const listItem = kindSpec('list_item');

  it('writes only the locale the request named, and never a published twin', () => {
    const arabic = parseWrites(article, { key: 's', fields: { title: 'عنوان', content: 'محتوى' } }, 'ar');
    expect(arabic.columns).toEqual({ title_ar: 'عنوان', content_ar: 'محتوى' });
    expect(arabic.issues).toEqual([]);

    const english = parseWrites(article, { key: 's', fields: { title: 'Title' } }, 'en');
    expect(english.columns).toEqual({ title_en: 'Title' });

    // The twin a visitor reads is moved by publish(), so a save cannot leak into it.
    expect(Object.keys(arabic.columns).some((column) => column.startsWith('pub_'))).toBe(false);
  });

  it('refuses a field the kind does not have, a value over the column length, and the wrong type', () => {
    expect(parseWrites(article, { key: 's', fields: { nope: 'x' } }, 'ar').issues).toEqual([{ path: 'nope', message: 'unknown field' }]);
    expect(parseWrites(article, { key: 's', fields: { title: 'ط'.repeat(501) } }, 'ar').issues).toEqual([
      { path: 'title', message: 'longer than 500 characters' },
    ]);
    expect(parseWrites(article, { key: 's', fields: { title: 42 } }, 'ar').issues).toEqual([{ path: 'title', message: 'expected text' }]);
    expect(parseWrites(offer, { key: 's', fields: { price: 'free' } }, 'ar').issues).toEqual([{ path: 'price', message: 'expected a number' }]);
    expect(parseWrites(offer, { key: 's', fields: { onSale: 'yes' } }, 'ar').issues).toEqual([
      { path: 'onSale', message: 'expected true or false' },
    ]);
  });

  it('maps a flag to 1/0, a cleared text field to its column fallback, and JSON to text', () => {
    expect(parseWrites(offer, { key: 's', fields: { onSale: true, enabled: false, currency: '', images: [{ url: 'a.jpg' }] } }, 'ar').columns).toEqual({
      on_sale: 1,
      enabled: 0,
      currency: 'EGP',
      images: JSON.stringify([{ url: 'a.jpg' }]),
    });
    // A text column that allows NULL falls back to NULL, so clearing an image really clears it.
    expect(parseWrites(article, { key: 's', fields: { image: '', categoryId: 'c1' } }, 'ar').columns).toEqual({ image: null, category_id: 'c1' });
    expect(parseWrites(offer, { key: 's', fields: { price: 250, regularPrice: null } }, 'ar').columns).toEqual({ price: 250, regular_price: null });
  });

  it('requires the JSON document on a list item and leaves its published twin alone', () => {
    expect(parseWrites(listItem, { key: 'u', fields: { position: 3 } }, 'ar').issues).toEqual([{ path: 'data', message: 'required' }]);
    expect(parseWrites(listItem, { key: 'u', fields: { data: 'text' } }, 'ar').issues).toEqual([
      { path: 'data', message: 'expected an object or an array' },
    ]);
    expect(parseWrites(listItem, { key: 'u', fields: { data: { name: { ar: 'سارة' } } } }, 'ar').columns).toEqual({
      draft: JSON.stringify({ name: { ar: 'سارة' } }),
    });
    // A list item is one document, so a locale means nothing to it — and the document
    // this call never sent is still required.
    expect(parseWrites(listItem, { key: 'u', fields: { title: 'x' } }, 'en').issues).toEqual([
      { path: 'title', message: 'unknown field' },
      { path: 'data', message: 'required' },
    ]);
  });
});

// --- the list catalog ----------------------------------------------------------

describe('the list catalog reaches `lists`', () => {
  it('changes nothing on a dry run, creates the seven once applied, then changes nothing again', async () => {
    // `purge()` in `beforeAll` empties `lists`, so every row counted here is this test's.
    const count = async (): Promise<number> => (await db.selectFrom('lists').select('id').execute()).length;
    const before = await count();
    const dry = await syncLists({ dryRun: true, database: readDbConfig().database });
    expect(await count()).toBe(before);
    expect(dry.rows.map((row) => row.listKey)).toEqual([...LIST_KEYS]);
    expect(dry.rows.every((row) => !row.existed)).toBe(true);

    const apply = await syncLists({ dryRun: false, database: readDbConfig().database });
    expect(await count()).toBe(before + LIST_KEYS.length);
    expect(apply.rows.every((row) => !row.existed)).toBe(true);

    const again = await syncLists({ dryRun: false, database: readDbConfig().database });
    expect(await count()).toBe(before + LIST_KEYS.length);
    expect(again.rows.every((row) => row.existed)).toBe(true);
  });

  it('names the lists the Editor is scoped to, and keeps the nav out of their reach', async () => {
    const stored = (await db.selectFrom('lists').select('list_key').execute()).map((row) => row.list_key);
    // A list the catalog no longer names (the archived `treatments`) may keep its row and
    // its items; every catalog key is registered, and only the catalog keys are offered.
    const catalog = [...LIST_KEYS].sort();
    expect(stored).toEqual(expect.arrayContaining(catalog));
    expect(EDITOR_LIST_KEYS).not.toContain('nav');
    // The Editor's `lists` grants and the `lists` table are one vocabulary: an
    // Editor can edit every seeded list except the navigation.
    for (const key of EDITOR_LIST_KEYS) {
      expect(can(actors.Editor.grants, 'list', 'update', { lists: key }), key).toBe(true);
    }
    expect(can(actors.Editor.grants, 'list', 'update', { lists: 'nav' })).toBe(false);
  });
});

// --- the guarded API -----------------------------------------------------------

describe('the content API keeps the guard order', () => {
  it('401s an anonymous caller on a read and a write alike', async () => {
    const list = await call('/content/article');
    expect(list.status).toBe(401);
    expect(list.error).toBe('unauthenticated');

    const create = await call('/content/article?locale=ar', { method: 'POST', body: JSON.stringify({ key: slug('anon') }) });
    expect(create.status).toBe(401);
  });

  it('403s a write that carries no CSRF header, before the body matters', async () => {
    const res = await call('/content/article?locale=ar', {
      method: 'POST',
      cookie: `shamah_session=${actors.Owner.token}`,
      body: JSON.stringify({ key: slug('no-csrf') }),
    });
    expect(res.status).toBe(403);
    expect(res.error).toBe('csrf_failed');
  });

  it('answers 403 rather than 400 when the caller has no grant — even for a body that cannot parse', async () => {
    const res = await call('/content/article?locale=ar', write(actors.Viewer, 'POST', { not_a_key: true }));
    expect(res.status).toBe(403);
    expect(res.denied).toBe('article.create');

    // The same broken body against a grant they do hold reaches validation instead.
    const bad = await call('/content/article?locale=ar', write(actors.Owner, 'POST', {}));
    expect(bad.status).toBe(400);
    expect(bad.error).toBe('invalid_input');
  });

  it('lets a scoped editor write Arabic and refuses English on the same row', async () => {
    const created = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: slug('arabic-only') }));
    expect(created.status).toBe(200);
    expect(created.row).toMatchObject({ key: slug('arabic-only'), status: 'draft', version: 1, trashed: false });
    expect(created.row.fields.title.immediate).toBe(false);
    // imageAlt has no published twin, which is what the console labels "live on save".
    expect(created.row.fields.imageAlt.immediate).toBe(true);

    const saved = await call(
      `/content/article/${created.row.id}?locale=ar`,
      write(actors.ArabicOnly, 'PATCH', { fields: { title: 'عنوان', content: 'محتوى', imageAlt: 'بديل' }, version: created.row.version }),
    );
    expect(saved.status).toBe(200);
    expect(saved.row.fields.title.draft).toEqual({ ar: 'عنوان', en: '' });
    expect(saved.row.fields.title.pub).toEqual({ ar: '', en: '' });
    expect(saved.row.pendingLocales).toEqual(['ar']);

    const english = await call(
      `/content/article/${created.row.id}?locale=en`,
      write(actors.ArabicOnly, 'PATCH', { fields: { title: 'nope' }, version: saved.row.version }),
    );
    expect(english.status).toBe(403);
    // No locale in the URL is no scope, so the request is refused rather than guessed at.
    const noScope = await call(
      `/content/article/${created.row.id}`,
      write(actors.ArabicOnly, 'PATCH', { fields: { title: 'nope' }, version: saved.row.version }),
    );
    expect(noScope.status).toBe(403);
  });

  it('409s a duplicate identity and a stale version, and 400s an unknown field without auditing it', async () => {
    const first = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: slug('dupe') }));
    const second = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: slug('dupe') }));
    expect(second.status).toBe(409);
    expect(second.error).toBe('key_taken');

    const updates = await auditCount('article.update', actors.Owner);

    const stale = await call(
      `/content/article/${first.row.id}?locale=ar`,
      write(actors.Owner, 'PATCH', { fields: { title: 'written elsewhere' }, version: first.row.version + 7 }),
    );
    expect(stale.status).toBe(409);
    expect(stale.error).toBe('stale_row');
    expect(await auditCount('article.update', actors.Owner)).toBe(updates);

    const unknown = await call(
      `/content/article/${first.row.id}?locale=ar`,
      write(actors.Owner, 'PATCH', { fields: { title: 'ok', invented: 'x' } }),
    );
    expect(unknown.status).toBe(400);
    expect(unknown.issues).toEqual([{ path: 'invented', message: 'unknown field' }]);
    // A handler that refused changed nothing, so the trail must not claim otherwise.
    expect(await auditCount('article.update', actors.Owner)).toBe(updates);

    const ok = await call(`/content/article/${first.row.id}?locale=ar`, write(actors.Owner, 'PATCH', { fields: { title: 'ok' } }));
    expect(ok.status).toBe(200);
    expect(await auditCount('article.update', actors.Owner)).toBe(updates + 1);

    const gone = await call(`/content/article/${randomUUID()}?locale=ar`, read(actors.Owner));
    expect(gone.status).toBe(404);
    expect(gone.error).toBe('not_found');
  });

  it('round-trips an offer through the column types the console converts to', async () => {
    const created = await call('/content/offer?locale=ar', write(actors.Editor, 'POST', { key: slug('offer') }));
    expect(created.status).toBe(200);

    const saved = await call(
      `/content/offer/${created.row.id}?locale=ar`,
      write(actors.Editor, 'PATCH', {
        fields: { name: 'عرض', price: 250, regularPrice: 400, onSale: true, enabled: false, currency: '', images: [{ url: 'offer.jpg' }] },
      }),
    );
    expect(saved.status).toBe(200);
    expect(saved.row.fields).toMatchObject({
      name: { draft: { ar: 'عرض', en: '' } },
      price: { value: 250 },
      regularPrice: { value: 400 },
      onSale: { value: true },
      enabled: { value: false },
      currency: { value: 'EGP' },
      images: { draftJson: [{ url: 'offer.jpg' }], immediate: true },
    });

    const raw = await db.selectFrom('offers').select(['currency', 'price', 'enabled']).where('id', '=', created.row.id).executeTakeFirstOrThrow();
    expect({ currency: raw.currency, price: Number(raw.price), enabled: raw.enabled }).toEqual({ currency: 'EGP', price: 250, enabled: 0 });
  });

  it('creates, edits, publishes and re-edits a list item in one Editor-scoped list', async () => {
    const noList = await call('/content/list_item', read(actors.Owner));
    expect(noList.status).toBe(400);
    expect(noList.error).toBe('list_required');

    const wrongList = await call('/content/list_item?list=nope', write(actors.Owner, 'POST', { key: 'x' }));
    expect(wrongList.status).toBe(400);
    expect(wrongList.error).toBe('unknown_list');

    const nav = await call('/content/list_item?list=nav', write(actors.Editor, 'POST', { key: `${ar}-nav-link` }));
    expect(nav.status).toBe(403);
    expect(nav.denied).toBe('list.create');
    // Reading is unscoped, so an Editor can still see the list they cannot write.
    expect((await call('/content/list_item?list=nav', read(actors.Editor))).status).toBe(200);

    const created = await call('/content/list_item?list=branches', write(actors.Editor, 'POST', { key: `${ar}-dr-sara` }));
    expect(created.status).toBe(200);
    expect(created.row.fields.data.draftJson).toEqual({});

    const saved = await call(
      `/content/list_item/${created.row.id}?list=branches`,
      write(actors.Editor, 'PATCH', { fields: { data: { name: { ar: 'د. سارة', en: 'Dr Sara' }, phone: '+20 100' }, position: 4 } }),
    );
    expect(saved.status).toBe(200);
    // The list's own form writes the document: a nested pair is stored as the flat pair the
    // site reads, and every field the branches form names is present. The phone is one value
    // for the whole site, so it keeps the single key the site and the importer use.
    expect(saved.row.fields.data.draftJson).toEqual(expect.objectContaining({ name_ar: 'د. سارة', name_en: 'Dr Sara', phone: '+20 100' }));
    expect(saved.row.fields.data.draftJson).not.toHaveProperty('name');
    expect(saved.row.fields.data.draftJson).not.toHaveProperty('phone_ar');
    expect(saved.row.fields.data.pubJson).toBeNull();
    expect(saved.row.fields.data.pending).toBe(true);
    expect(saved.row.status).toBe('draft');

    const published = await call(`/content/list_item/${created.row.id}/publish?list=branches`, write(actors.Editor, 'POST', {}));
    expect(published.status).toBe(200);
    expect(published.row.fields.data.pubJson).toEqual(saved.row.fields.data.draftJson);
    expect(published.row.fields.data.pending).toBe(false);
    expect(published.row.status).toBe('published');

    const edited = await call(
      `/content/list_item/${created.row.id}?list=branches`,
      write(actors.Editor, 'PATCH', { fields: { data: { name: { ar: 'د. سارة مالك', en: 'Dr Sara Malik' } } }, version: published.row.version }),
    );
    // A published item that was then edited is its own state: the site still serves
    // the older document, and the console must say so rather than "draft".
    expect(edited.row.status).toBe('changed');
    expect(edited.row.fields.data.pending).toBe(true);
    expect(edited.row.fields.data.pubJson).toEqual(published.row.fields.data.pubJson);

    // Rollback of a JSON document: the snapshot holds a parsed object, and the column
    // wants valid JSON text — the same encoding rule the draft write follows.
    const second = await call(`/content/list_item/${created.row.id}/publish?list=branches`, write(actors.Editor, 'POST', {}));
    expect(second.revision).toBe(2);
    const rolled = await call(`/content/list_item/${created.row.id}/rollback?list=branches`, write(actors.Editor, 'POST', { revision: 1 }));
    expect(rolled.status).toBe(200);
    expect(rolled.row.fields.data.pubJson).toEqual(published.row.fields.data.pubJson);
    expect(rolled.row.fields.data.pending).toBe(true);

    const dupe = await call('/content/list_item?list=branches', write(actors.Editor, 'POST', { key: `${ar}-dr-sara` }));
    expect(dupe.status).toBe(409);
    expect(dupe.error).toBe('key_taken');
    // The same uid in a different list is a different row.
    expect((await call('/content/list_item?list=faq', write(actors.Editor, 'POST', { key: `${ar}-dr-sara` }))).status).toBe(200);
  });

  it('refuses a document key the list’s own form does not name', async () => {
    // The typed contract is what lets the console drop its JSON textarea: a key nobody
    // declared cannot be smuggled in by a paste, and the answer names the key so the
    // editor can offer to remove it. Nothing is written, so nothing is lost either.
    const row = await call('/content/list_item?list=branches', write(actors.Editor, 'POST', { key: `${ar}-odd-keys` }));
    expect(row.status).toBe(200);
    const refused = await call(
      `/content/list_item/${row.row.id}?list=branches`,
      write(actors.Editor, 'PATCH', { fields: { data: { name_ar: 'فرع', script: '<script>no()</script>', tags: ['a'] } } }),
    );
    expect(refused.status).toBe(400);
    expect(refused.error).toBe('invalid_input');
    const paths = (refused.issues ?? []).map((issue: { path: string; message: string }) => issue.path);
    expect(paths).toContain('script');
    expect(paths).toContain('tags');
    expect((await call(`/content/list_item/${row.row.id}?list=branches`, read(actors.Editor))).row.fields.data.draftJson).toEqual({});
  });

  it('405s a method the routes do not implement and 404s a kind that does not exist', async () => {
    const put = await call('/content/article', { method: 'PUT', cookie: `shamah_session=${actors.Owner.token}`, headers: { [CSRF_HEADER]: actors.Owner.csrf }, body: '{}' });
    expect(put.status).toBe(405);
    const unknown = await call('/content/widgets', read(actors.Owner));
    expect(unknown.status).toBe(404);
    expect(unknown.error).toBe('unknown_route');
  });
});

// --- draft → published, revisions, rollback (BK-6.2) ---------------------------

describe('publishing moves the copy a visitor reads, and only that', () => {
  let id = '';

  beforeAll(async () => {
    const created = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: slug('publish') }));
    id = created.row.id;
    await call(`/content/article/${id}?locale=ar`, write(actors.ArabicOnly, 'PATCH', { fields: { title: 'عنوان واحد', content: 'مقال' } }));
  });

  it('refuses a publish that asks for a locale the caller cannot write', async () => {
    const denied = await call(`/content/article/${id}/publish?locale=en`, write(actors.ArabicOnly, 'POST', {}));
    expect(denied.status).toBe(403);
    expect(denied.denied).toBe('article.publish');

    // The URL scope passes, so the body is read — and it asks only for English.
    const none = await call(`/content/article/${id}/publish?locale=ar`, write(actors.ArabicOnly, 'POST', { locales: ['en'] }));
    expect(none.status).toBe(403);
    expect(none.error).toBe('no_writable_locale');
  });

  it('publishes Arabic alone for an Arabic-only editor, leaving the English twin empty', async () => {
    const first = await call(`/content/article/${id}/publish?locale=ar`, write(actors.ArabicOnly, 'POST', { locales: ['ar', 'en'] }));
    expect(first.status).toBe(200);
    expect(first.locales).toEqual(['ar']);
    expect(first.revision).toBe(1);
    expect(first.row.status).toBe('published');
    expect(first.row.publishedAt).not.toBeNull();

    const stored = await db
      .selectFrom('articles')
      .select(['pub_title_ar', 'pub_title_en', 'pub_content_ar', 'pub_content_en'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ pub_title_ar: 'عنوان واحد', pub_title_en: '', pub_content_ar: 'مقال', pub_content_en: null });
  });

  it('publishes both locales for an editor who holds both, then keeps the whole history', async () => {
    await call(`/content/article/${id}?locale=en`, write(actors.Editor, 'PATCH', { fields: { title: 'One title', content: 'An article' } }));
    const second = await call(`/content/article/${id}/publish?locale=ar`, write(actors.Editor, 'POST', {}));
    expect(second.locales).toEqual(['ar', 'en']);
    expect(second.revision).toBe(2);

    const stored = await db.selectFrom('articles').select(['pub_title_ar', 'pub_title_en']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(stored).toEqual({ pub_title_ar: 'عنوان واحد', pub_title_en: 'One title' });

    const list = await call(`/content/article/${id}/revisions`, read(actors.Viewer));
    expect(list.status).toBe(200);
    expect(list.revisions.map((revision) => revision.revision)).toEqual([2, 1]);
    expect(list.revisions[0].snapshot).toMatchObject({ pub_title_en: 'One title' });
    expect(list.revisions[1].authorEmail).toBe(actors.ArabicOnly.email);
  });

  it('rolls a revision back onto the published columns without touching the draft or deleting history', async () => {
    // Somebody is mid-edit in English while the rollback happens.
    await call(`/content/article/${id}?locale=en`, write(actors.Editor, 'PATCH', { fields: { title: 'Work in progress' } }));

    const rolled = await call(`/content/article/${id}/rollback?locale=ar`, write(actors.Editor, 'POST', { revision: 1 }));
    expect(rolled.status).toBe(200);
    expect(rolled.revision).toBe(3);

    const stored = await db
      .selectFrom('articles')
      .select(['title_ar', 'title_en', 'pub_title_ar', 'pub_title_en'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(stored).toEqual({ title_ar: 'عنوان واحد', title_en: 'Work in progress', pub_title_ar: 'عنوان واحد', pub_title_en: '' });

    const list = await call(`/content/article/${id}/revisions`, read(actors.Editor));
    expect(list.revisions.map((revision) => revision.revision)).toEqual([3, 2, 1]);
    expect(list.revisions[0].note).toBe('rollback to revision 1');

    const missing = await call(`/content/article/${id}/rollback?locale=ar`, write(actors.Editor, 'POST', { revision: 99 }));
    expect(missing.status).toBe(404);
    expect(missing.error).toBe('revision_not_found');

    // Rollback publishes, so it belongs to the publish grant and nothing else.
    const denied = await call(`/content/article/${id}/rollback?locale=ar`, write(actors.Viewer, 'POST', { revision: 1 }));
    expect(denied.status).toBe(403);
    expect(denied.denied).toBe('article.publish');
  });

  it('refuses to publish a row that is sitting in the trash', async () => {
    const trashed = await call(`/content/article/${id}`, write(actors.Owner, 'DELETE', { trashed: true }));
    expect(trashed.status).toBe(200);
    const blocked = await call(`/content/article/${id}/publish?locale=ar`, write(actors.Owner, 'POST', {}));
    expect(blocked.status).toBe(409);
    expect(blocked.error).toBe('in_trash');
    await call(`/content/article/${id}/restore?locale=ar`, write(actors.Owner, 'POST', {}));
  });
});

// --- trash, restore, never-delete (BK-6.4) -------------------------------------

describe('trash hides a row and restore brings it back with its history', () => {
  let id = '';

  beforeAll(async () => {
    const created = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: slug('trash') }));
    id = created.row.id;
    await call(`/content/article/${id}?locale=ar`, write(actors.Owner, 'PATCH', { fields: { title: 'الى سلة المحذوفات' } }));
    await call(`/content/article/${id}/publish?locale=ar`, write(actors.Owner, 'POST', {}));
  });

  it('moves the row out of the live list and into the trash view', async () => {
    const before = await call('/content/article', read(actors.Owner));
    expect(before.page.rows.some((row) => row.id === id)).toBe(true);

    const trashed = await call(`/content/article/${id}?locale=ar`, write(actors.Owner, 'DELETE', { trashed: true }));
    expect(trashed.status).toBe(200);
    expect(trashed.row).toMatchObject({ trashed: true, status: 'trash' });
    // Soft delete keeps the identity, the version it had reached and its author.
    expect(trashed.row.id).toBe(id);

    const live = await call('/content/article', read(actors.Owner));
    expect(live.page.rows.some((row) => row.id === id)).toBe(false);
    const inTrash = await call('/content/article?trash=1', read(actors.Owner));
    expect(inTrash.page.rows.filter((row) => row.id === id)).toHaveLength(1);
    // A list page is a page of summaries, never the documents: the body of an article is
    // not something 25 rows should carry to the browser.
    expect('fields' in inTrash.page.rows[0]).toBe(false);

    const save = await call(`/content/article/${id}?locale=ar`, write(actors.Owner, 'PATCH', { fields: { title: 'nope' } }));
    expect(save.status).toBe(409);
    expect(save.error).toBe('in_trash');
  });

  it('needs a write grant to restore and a delete grant to trash', async () => {
    const noTrash = await call(`/content/article/${id}?locale=ar`, write(actors.Viewer, 'DELETE', { trashed: true }));
    expect(noTrash.status).toBe(403);
    expect(noTrash.denied).toBe('article.delete');

    const noRestore = await call(`/content/article/${id}/restore?locale=ar`, write(actors.Viewer, 'POST', {}));
    expect(noRestore.status).toBe(403);
    expect(noRestore.denied).toBe('article.update');

    const restored = await call(`/content/article/${id}/restore?locale=ar`, write(actors.Editor, 'POST', {}));
    expect(restored.status).toBe(200);
    expect(restored.row).toMatchObject({ trashed: false, status: 'published' });

    const again = await call(`/content/article/${id}/restore?locale=ar`, write(actors.Owner, 'POST', {}));
    expect(again.status).toBe(200);
    expect(again.row.trashed).toBe(false);

    const revisions = await call(`/content/article/${id}/revisions`, read(actors.Owner));
    expect(revisions.revisions.length).toBeGreaterThan(0);
  });

  it('never lets a page be deleted by a role that only holds create, update and publish', async () => {
    const page = await call('/content/page?locale=ar', write(actors.Editor, 'POST', { key: `/bk6-${run}/about` }));
    expect(page.status).toBe(200);
    const denied = await call(`/content/page/${page.row.id}?locale=ar`, write(actors.Editor, 'DELETE', { trashed: true }));
    expect(denied.status).toBe(403);
    expect(denied.denied).toBe('page.delete');

    const saved = await call(`/content/page/${page.row.id}?locale=ar`, write(actors.Editor, 'PATCH', { fields: { title: 'من نحن', redirectTo: '' } }));
    expect(saved.row.fields.redirectTo.value).toBeNull();
    expect(saved.row.fields.enabled.value).toBe(true);
    expect(saved.row.fields.enabled.immediate).toBe(true);
  });
});

// --- settings ------------------------------------------------------------------

describe('settings keep a secret inside the environment', () => {
  const group = `bk6-${run}`;

  beforeAll(async () => {
    await db
      .insertInto('settings')
      .values([
        { group_name: group, setting_key: 'whatsapp', value: JSON.stringify('+20'), default_value: JSON.stringify(''), is_secret: 0, version: 1 },
        { group_name: group, setting_key: 'maps_key', value: JSON.stringify(SECRET_VALUE), default_value: null, is_secret: 1, version: 1 },
      ])
      .execute();
  });

  it('hides a secret value from the list, and never carries it in the response body at all', async () => {
    const res = await raw('/settings', read(actors.Owner));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET_VALUE);

    const rows = (JSON.parse(text) as { rows: SettingView[] }).rows.filter((row) => row.group === group);
    expect(rows.find((row) => row.key === 'maps_key')).toMatchObject({ secret: true, value: null, defaultValue: null });
    expect(rows.find((row) => row.key === 'whatsapp')).toMatchObject({ secret: false, value: '+20' });
  });

  it('refuses a caller without the grant, before it says anything about the payload', async () => {
    expect((await call('/settings', read(actors.Viewer))).status).toBe(403);
    const editor = await call('/settings', write(actors.Editor, 'PATCH', { group, key: 'whatsapp', value: '+966' }));
    expect(editor.status).toBe(403);
    expect(editor.denied).toBe('setting.update');
  });

  it('writes a plain setting, refuses a secret one, and creates the row a key never used before', async () => {
    const updates = await auditCount('setting.update', actors.Admin);
    const saved = await call('/settings', write(actors.Admin, 'PATCH', { group, key: 'whatsapp', value: { number: '+20 100', enabled: true } }));
    expect(saved.status).toBe(200);
    expect(saved.body.row).toMatchObject({ group, key: 'whatsapp', value: { number: '+20 100', enabled: true }, version: 2 });
    expect(await auditCount('setting.update', actors.Admin)).toBe(updates + 1);

    const secret = await call('/settings', write(actors.Admin, 'PATCH', { group, key: 'maps_key', value: 'try me' }));
    expect(secret.status).toBe(403);
    expect(secret.error).toBe('secret_setting');
    const held = await db.selectFrom('settings').select('value').where('group_name', '=', group).where('setting_key', '=', 'maps_key').executeTakeFirstOrThrow();
    expect(String(held.value)).toContain(SECRET_VALUE);

    const fresh = await call('/settings', write(actors.Owner, 'PATCH', { group, key: 'maintenance', value: false }));
    expect(fresh.body.row).toMatchObject({ key: 'maintenance', version: 1, secret: false });
  });

  it('keeps a digits-only setting the string an editor typed', async () => {
    // A phone number is a word, not a quantity. Reading the column had become a number
    // here, and saving that number back put a JSON number in a field no site reader can
    // show — the operator's edit disappeared without an error anywhere.
    const hotline = await call('/settings', write(actors.Owner, 'PATCH', { group, key: 'hotline', value: '20555000111' }));
    expect(hotline.status).toBe(200);
    const row = hotline.body.row as SettingView;
    expect(row).toMatchObject({ key: 'hotline', value: '20555000111' });
    expect(typeof row.value).toBe('string');

    const listed = (JSON.parse(await (await raw('/settings', read(actors.Owner))).text()) as { rows: SettingView[] })
      .rows.find((row) => row.group === group && row.key === 'hotline');
    expect(typeof listed?.value).toBe('string');
    expect(listed?.value).toBe('20555000111');
  });
});

// --- one page of rows, decided by MariaDB (BK-13.3) ----------------------------

/** A list request line, built by `URLSearchParams`, so a `%` or an Arabic term reaches the server as it was typed. */
function listUrl(kind: string, params: Record<string, string> = {}): string {
  const line = new URLSearchParams(params).toString();
  return `/content/${kind}${line ? `?${line}` : ''}`;
}

describe('a list page filters, searches, orders and pages in the database', () => {
  // Every other describe in this file leaves rows in the same tables, so a count here is
  // only honest over rows this one can name: the search term is always a fixture prefix.
  const pg = (n: number): string => `${ar}-pg-${String(n).padStart(2, '0')}`;
  const st = (name: string): string => `${ar}-st-${name}`;
  let offerId = '';
  let branchId = '';
  let namedId = '';

  beforeAll(async () => {
    // Twelve, because a page of ten is the smallest set that proves an OFFSET was applied.
    // The English titles run opposite to the keys, so a title sort cannot pass by key order.
    for (let n = 1; n <= 12; n++) {
      await call('/content/article?locale=en', write(actors.Owner, 'POST', { key: pg(n), fields: { title: `t${String(13 - n).padStart(2, '0')}` } }));
    }
    for (const [name, title] of [
      ['pct', 'خصم 20%'],
      ['word', 'خصم 20 percent'],
      ['draft', 'مسودة'],
    ] as const) {
      await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: st(name), fields: { title } }));
    }
    const published = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: st('pub'), fields: { title: 'نشر كامل' } }));
    await call(`/content/article/${published.row.id}/publish?locale=ar`, write(actors.Owner, 'POST', {}));

    const changed = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: st('changed'), fields: { title: 'أول نشر' } }));
    await call(`/content/article/${changed.row.id}/publish?locale=ar`, write(actors.Owner, 'POST', {}));
    await call(`/content/article/${changed.row.id}?locale=ar`, write(actors.Owner, 'PATCH', { fields: { title: 'تعديل بعد النشر' } }));

    const offer = await call('/content/offer?locale=ar', write(actors.Editor, 'POST', { key: `${ar}-of-1`, fields: { name: 'عرض قائمة', price: 250, regularPrice: 400, onSale: true, enabled: false } }));
    offerId = offer.row.id;

    // A list item's columns are read off its own document, so this row is the fixture for
    // both the sampled column and the search that reaches inside the JSON.
    const branch = await call('/content/list_item?list=branches', write(actors.Editor, 'POST', { key: st('branch') }));
    branchId = branch.row.id;
    await call(
      `/content/list_item/${branchId}?list=branches`,
      write(actors.Editor, 'PATCH', { fields: { data: { name_ar: 'فرع المعادي', name_en: 'Maadi branch', phone: '+20 100' } } }),
    );
    // A second row whose document holds an area beside its name: the list has to title a
    // row by the key that names it, not by whichever one the sample happened to meet
    // first. See `rankOf` in summary.ts.
    const named = await call('/content/list_item?list=branches', write(actors.Editor, 'POST', { key: st('named') }));
    namedId = named.row.id;
    await call(
      `/content/list_item/${namedId}?list=branches`,
      write(actors.Editor, 'PATCH', {
        fields: { data: { area_ar: 'مدينة نصر', area_en: 'Nasr City', name_ar: 'فرع التجمع', name_en: 'New Cairo branch', phone: '+20 111' } },
      }),
    );
  });

  it('answers with the page and the view it actually ran', async () => {
    const res = await call(listUrl('article', { q: `${ar}-pg` }), read(actors.Owner));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('article');
    expect(res.body.trash).toBe(false);
    // The kind's own defaults, re-stated: the screen and the address bar agree without
    // the browser having to remember what it did not send.
    expect(res.view).toEqual({ mode: 'table', sort: 'updated', dir: 'desc', q: `${ar}-pg`, filter: 'all', page: 1, per: 25 });
    expect(res.page.total).toBe(12);
    expect(res.page.pages).toBe(1);
    // An article has no number or flag columns, so the table prints none.
    expect(res.page.columns).toEqual([]);

    const empty = await call(listUrl('article', { q: `${ar}-no-such-row` }), read(actors.Owner));
    expect({ rows: empty.page.rows.length, total: empty.page.total, page: empty.page.page, pages: empty.page.pages }).toEqual({ rows: 0, total: 0, page: 1, pages: 1 });
  });

  it('pages by an offset the server chose and clamps a page past the end', async () => {
    const first = await call(listUrl('article', { q: `${ar}-pg`, sort: 'key', dir: 'asc', per: '10' }), read(actors.Owner));
    expect(first.page.rows.map((row) => row.key)).toEqual(Array.from({ length: 12 }, (_, i) => pg(i + 1)).slice(0, 10));
    expect({ page: first.page.page, pages: first.page.pages, per: first.page.per }).toEqual({ page: 1, pages: 2, per: 10 });

    const second = await call(listUrl('article', { q: `${ar}-pg`, sort: 'key', dir: 'asc', per: '10', page: '2' }), read(actors.Owner));
    expect(second.page.rows.map((row) => row.key)).toEqual([pg(11), pg(12)]);
    // Nothing overlaps the two pages, which a shifting order would show at once.
    expect(second.page.rows.every((row) => !first.page.rows.some((other) => other.id === row.id))).toBe(true);

    const beyond = await call(listUrl('article', { q: `${ar}-pg`, sort: 'key', dir: 'asc', per: '10', page: '99' }), read(actors.Owner));
    expect(beyond.page.page).toBe(2);
    expect(beyond.page.rows.map((row) => row.key)).toEqual([pg(11), pg(12)]);
  });

  it('orders by the column the sort names, in the language the console is drawn in', async () => {
    const byKey = await call(listUrl('article', { q: `${ar}-pg`, sort: 'key', dir: 'asc' }), read(actors.Owner));
    expect(byKey.page.rows[0]?.key).toBe(pg(1));
    const flipped = await call(listUrl('article', { q: `${ar}-pg`, sort: 'key', dir: 'desc' }), read(actors.Owner));
    expect(flipped.page.rows[0]?.key).toBe(pg(12));

    // `t01` belongs to the last key: an order by title is provably not an order by key.
    const byTitle = await call(listUrl('article', { q: `${ar}-pg`, sort: 'title', dir: 'asc', locale: 'en' }), read(actors.Owner));
    expect(byTitle.page.rows.map((row) => row.key)).toEqual(Array.from({ length: 12 }, (_, i) => pg(13 - (i + 1))));
    expect(byTitle.page.rows[0]).toMatchObject({ titleEn: 't01', titleAr: '' });

    // A term the kind cannot honour is answered with the view that ran, not a lie.
    const noPosition = await call(listUrl('article', { sort: 'position' }), read(actors.Owner));
    expect(noPosition.view.sort).toBe('updated');
    const noOff = await call(listUrl('article', { filter: 'off' }), read(actors.Owner));
    expect(noOff.view.filter).toBe('all');
  });

  it('searches the identity and both titles, and escapes what LIKE would read as a wildcard', async () => {
    const byKey = await call(listUrl('article', { q: st('pub') }), read(actors.Owner));
    expect(byKey.page.rows.map((row) => row.key)).toEqual([st('pub')]);

    const byEnglish = await call(listUrl('article', { q: 't05' }), read(actors.Owner));
    expect(byEnglish.page.rows.map((row) => row.key)).toEqual([pg(8)]);

    // The draft title, not the published twin: the list is the editor's, and it must
    // find the copy they are working on.
    const byArabic = await call(listUrl('article', { q: 'تعديل بعد' }), read(actors.Owner));
    expect(byArabic.page.rows.map((row) => row.key)).toEqual([st('changed')]);

    // `20%` is a term a marketer types. Unescaped it also matches `20 percent`, so the
    // answer here is the one row whose title really holds a percent sign.
    const percent = await call(listUrl('article', { q: 'خصم 20%' }), read(actors.Owner));
    expect(percent.page.rows.map((row) => row.key)).toEqual([st('pct')]);
    // `_` is LIKE's single-character wildcard: unescaped it matches the space in `20 percent`.
    const underscore = await call(listUrl('article', { q: 'خصم 20_' }), read(actors.Owner));
    expect(underscore.page.total).toBe(0);

    const long = await call(listUrl('article', { q: 'ط'.repeat(200) }), read(actors.Owner));
    expect(long.view.q).toHaveLength(80);
  });

  it('keeps each filter chip to the rows it names', async () => {
    const keysOf = async (filter: string): Promise<string[]> => (await call(listUrl('article', { q: `${ar}-st`, filter }), read(actors.Owner))).page.rows.map((row) => row.key).sort();
    const sorted = (names: string[]): string[] => [...names].sort();

    // A published document whose draft has moved on still reads `published`: only a list
    // item's enum carries `changed`, which is why that chip is a list's and the unpublished
    // changes of an article are the `pending` flag rather than a status.
    expect(await keysOf('published')).toEqual(sorted([st('pub'), st('changed')]));
    expect(await keysOf('draft')).toEqual(sorted([st('draft'), st('pct'), st('word')]));
    // Pending is computed, not matched: it is the draft differing from the published copy,
    // so the one row in sync drops out and every unpublished draft stays in.
    expect(await keysOf('pending')).toEqual(sorted([st('changed'), st('draft'), st('pct'), st('word')]));
    expect(await keysOf('all')).toHaveLength(5);
    // The chip a kind cannot honour is answered by the view that ran, not a silent match.
    const changed = await call(listUrl('article', { q: `${ar}-st`, filter: 'changed' }), read(actors.Owner));
    expect(changed.view.filter).toBe('all');
    expect(changed.page.total).toBe(5);
  });

  it('prints the number and flag columns of an offer as cells, and the row that is off the site', async () => {
    // The term is the whole key: a shorter one would also match the `-offer` another
    // describe leaves in the same table.
    const res = await call(listUrl('offer', { q: `${ar}-of-1` }), read(actors.Editor));
    expect(res.page.columns).toEqual(['price', 'regularPrice', 'position', 'onSale', 'enabled']);
    const row = res.page.rows.find((cell) => cell.id === offerId);
    expect(row?.cells).toMatchObject({ price: '250.00', regularPrice: '400.00', onSale: true, enabled: false });
    // A DECIMAL column comes back as the column's own text, scale included: the console
    // prints `250.00` because a float here would lose the price the site has to show.
    expect(typeof row?.cells.price).toBe('string');

    const off = await call(listUrl('offer', { q: `${ar}-of-1`, filter: 'off' }), read(actors.Editor));
    expect(off.page.rows.map((cell) => cell.id)).toEqual([offerId]);
  });

  it('reads the columns and the title of a list item from its own document', async () => {
    const res = await call(listUrl('list_item', { list: 'branches' }), read(actors.Editor));
    expect(res.body.listKey).toBe('branches');
    // `name_ar`/`name_en` name the row, so they are labels, not columns: what is left is
    // the keys the table can print beside the title. A branch's phone is one value for the
    // whole site, so it is stored under the one key the site reads, `phone`, and printed as
    // one cell — not as a translated pair a person would have to keep in step.
    expect(res.page.columns).not.toContain('name_ar');
    expect(res.page.columns).not.toContain('name_en');
    expect(res.page.columns).toEqual(expect.arrayContaining(['phone', 'area_ar', 'area_en']));
    expect(res.page.rows.find((row) => row.id === branchId)).toMatchObject({
      key: st('branch'),
      titleAr: 'فرع المعادي',
      titleEn: 'Maadi branch',
      cells: { phone: '+20 100' },
    });
    // The row that carries an area beside its name is still titled by its name: `area_ar`
    // ranks with the other `*_ar` keys, so a label chosen by count alone would title the
    // list with an area and bury the branch's name in a column.
    expect(res.page.rows.find((row) => row.id === namedId)).toMatchObject({
      key: st('named'),
      titleAr: 'فرع التجمع',
      titleEn: 'New Cairo branch',
      cells: { area_ar: 'مدينة نصر', phone: '+20 111' },
    });
    // An item saved in another describe through the same typed form is titled the same way:
    // the list never falls back to a row's internal identity when its own document names it.
    expect(res.page.rows.find((row) => row.key === `${ar}-dr-sara`)?.titleAr).toBe('د. سارة مالك');

    const byName = await call(listUrl('list_item', { list: 'branches', q: 'المعادي' }), read(actors.Editor));
    expect(byName.page.rows.map((row) => row.id)).toEqual([branchId]);
    // The search reads the draft document: `dr-sara` still holds this phone in its
    // published copy, so a hit on that row would mean the list was searched over the
    // wrong column.
    const byPhone = await call(listUrl('list_item', { list: 'branches', q: '+20 100' }), read(actors.Editor));
    expect(byPhone.page.rows.map((row) => row.id)).toEqual([branchId]);

    // An unknown list is not an error a read can make: the scope is validated when a row
    // is written, and a page of nothing is what an unrecognised list reads.
    expect((await call(listUrl('list_item', { list: 'nope' }), read(actors.Owner))).page.total).toBe(0);
  });
});

// --- bulk writes (BK-13.3) ------------------------------------------------------

describe('a bulk action is one permission check per verb, then one row at a time', () => {
  const bk = (name: string): string => `${ar}-bk-${name}`;
  const idOf: Record<string, string> = {};

  beforeAll(async () => {
    for (const name of ['one', 'two', 'three']) {
      const created = await call('/content/article?locale=ar', write(actors.Owner, 'POST', { key: bk(name), fields: { title: `حجمي ${name}` } }));
      idOf[name] = created.row.id;
    }
    // Two lists, so a request scoped to one can name a row in the other.
    const specialists = await call('/content/list_item?list=specialists', write(actors.Editor, 'POST', { key: bk('doctor') }));
    idOf.specialists = specialists.row.id;
    await call(`/content/list_item/${idOf.specialists}?list=specialists`, write(actors.Editor, 'PATCH', { fields: { data: { name_ar: 'د. نفسية', name_en: 'Dr Nafsia' } } }));
    const faq = await call('/content/list_item?list=faq', write(actors.Editor, 'POST', { key: bk('question') }));
    idOf.faq = faq.row.id;
    await call(`/content/list_item/${idOf.faq}?list=faq`, write(actors.Editor, 'PATCH', { fields: { data: { question_ar: 'سؤال', question_en: 'A question' } } }));
  });

  it('decides the verb from the path before it reads a single id', async () => {
    const publish = await call('/content/article/bulk/publish', write(actors.Viewer, 'POST', { ids: ['not-even-a-uuid'] }));
    expect(publish.status).toBe(403);
    expect(publish.denied).toBe('article.publish');
    // A refusal says nothing about the payload it never parsed.
    expect(publish.body.done).toBeUndefined();
    expect(publish.body.failed).toBeUndefined();

    // Trash is a delete, restore is a write — the same mapping the single-row routes use.
    expect((await call('/content/article/bulk/trash', write(actors.Viewer, 'POST', { ids: [idOf.one] }))).denied).toBe('article.delete');
    expect((await call('/content/article/bulk/restore', write(actors.Viewer, 'POST', { ids: [idOf.one] }))).denied).toBe('article.update');
  });

  it('publishes every row it was given and writes one audit line for the request', async () => {
    const before = await auditCount('article.publish', actors.Editor);
    const res = await call('/content/article/bulk/publish?locale=ar', write(actors.Editor, 'POST', { ids: [idOf.one, idOf.two, idOf.three] }));
    expect(res.status).toBe(200);
    expect(res.done).toEqual([idOf.one, idOf.two, idOf.three]);
    expect(res.failed).toEqual([]);
    expect(res.body.locales).toEqual(['ar', 'en']);

    const stored = await db.selectFrom('articles').select(['slug', 'status', 'pub_title_ar']).where('slug', 'like', `${ar}-bk-%`).execute();
    expect(stored).toHaveLength(3);
    expect(stored.every((row) => row.status === 'published')).toBe(true);
    expect(stored.every((row) => String(row.pub_title_ar).startsWith('حجمي'))).toBe(true);

    expect(await auditCount('article.publish', actors.Editor)).toBe(before + 1);
    const trail = await db
      .selectFrom('audit_log')
      .select(['entity_type', 'entity_id'])
      .where('action', '=', 'article.publish')
      .where('actor_email', '=', actors.Editor.email)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(trail).toMatchObject({ entity_type: 'article', entity_id: 'bulk.publish' });
  });

  it('answers with the rows that did not move, and refuses a request that moved nothing', async () => {
    await call(`/content/article/${idOf.one}?locale=ar`, write(actors.Owner, 'DELETE', { trashed: true }));
    const ghost = randomUUID();
    const before = await auditCount('article.publish', actors.Editor);

    const both = await call('/content/article/bulk/publish?locale=ar', write(actors.Editor, 'POST', { ids: [idOf.one, ghost] }));
    expect(both.status).toBe(409);
    expect(both.error).toBe('bulk_nothing_applied');
    expect(both.body.done).toBeUndefined();
    expect(both.failed).toEqual([
      { id: idOf.one, code: 'in_trash' },
      { id: ghost, code: 'not_found' },
    ]);
    // Nothing moved, so the trail must not claim that something did.
    expect(await auditCount('article.publish', actors.Editor)).toBe(before);

    // Half a page is an ordinary thing to send: the rows that could move, did.
    const restored = await call('/content/article/bulk/restore', write(actors.Owner, 'POST', { ids: [idOf.one] }));
    expect(restored.done).toEqual([idOf.one]);
    const mixed = await call('/content/article/bulk/publish?locale=ar', write(actors.Editor, 'POST', { ids: [idOf.one, ghost] }));
    expect(mixed.status).toBe(200);
    expect(mixed.done).toEqual([idOf.one]);
    expect(mixed.failed).toEqual([{ id: ghost, code: 'not_found' }]);
  });

  it('keeps a list bulk inside the rows of the list the request named', async () => {
    // Permission comes first, and an Editor's list grants each name one list: a request
    // with no `?list=` asks for a scope nobody has given them, so it is a 403, not a 400.
    const editor = await call('/content/list_item/bulk/publish', write(actors.Editor, 'POST', { ids: [idOf.specialists] }));
    expect(editor.status).toBe(403);
    expect(editor.denied).toBe('list.publish');

    // With the grant settled, the missing list is a 400 about the request line.
    const owner = await call('/content/list_item/bulk/publish', write(actors.Owner, 'POST', { ids: [idOf.specialists] }));
    expect(owner.status).toBe(400);
    expect(owner.error).toBe('list_required');

    const res = await call('/content/list_item/bulk/publish?list=specialists', write(actors.Editor, 'POST', { ids: [idOf.specialists, idOf.faq] }));
    expect(res.status).toBe(200);
    expect(res.done).toEqual([idOf.specialists]);
    expect(res.failed).toEqual([{ id: idOf.faq, code: 'out_of_scope' }]);

    // The pasted id changed nothing, whatever the caller's grant over `faq` says.
    const faq = await call(`/content/list_item/${idOf.faq}?list=faq`, read(actors.Editor));
    expect(faq.row.status).toBe('draft');
    expect(faq.row.fields.data.pubJson).toBeNull();
  });

  it('moves a page of rows to the trash and back, and the list agrees', async () => {
    const trashed = await call('/content/article/bulk/trash', write(actors.Owner, 'POST', { ids: [idOf.two, idOf.three] }));
    expect(trashed.done).toEqual([idOf.two, idOf.three]);

    const inTrash = await call(listUrl('article', { q: `${ar}-bk`, trash: '1', sort: 'key', dir: 'asc' }), read(actors.Owner));
    expect(inTrash.page.rows.map((row) => row.id)).toEqual([idOf.three, idOf.two]);
    expect(inTrash.page.rows.every((row) => row.trashed)).toBe(true);

    // Every row in Trash is trashed, so a state chip carried in from the live list answers
    // "nothing" over rows that are plainly there. The screen ignores the chip instead.
    const trashCarryingAFilter = await call(listUrl('article', { q: `${ar}-bk`, trash: '1', filter: 'draft' }), read(actors.Owner));
    expect(trashCarryingAFilter.page.total).toBe(2);
    expect(trashCarryingAFilter.view.filter).toBe('all');

    const live = await call(listUrl('article', { q: `${ar}-bk` }), read(actors.Owner));
    expect(live.page.total).toBe(1);

    const back = await call('/content/article/bulk/restore', write(actors.Owner, 'POST', { ids: [idOf.two, idOf.three] }));
    expect(back.done).toEqual([idOf.two, idOf.three]);
    const again = await call(listUrl('article', { q: `${ar}-bk` }), read(actors.Owner));
    expect(again.page.total).toBe(3);
  });

  it('refuses an empty id list, a GET, and a verb that does not exist', async () => {
    const empty = await call('/content/article/bulk/publish', write(actors.Owner, 'POST', { ids: [] }));
    expect(empty.status).toBe(400);
    expect(empty.error).toBe('invalid_input');

    expect((await raw('/content/article/bulk/publish', read(actors.Owner))).status).toBe(405);

    const invented = await call('/content/article/bulk/delete', write(actors.Owner, 'POST', { ids: [idOf.one] }));
    expect(invented.status).toBe(404);
    expect(invented.error).toBe('unknown_route');
  });
});

// --- saved list views (BK-13.3) -------------------------------------------------

describe('a saved view is the filter one person saved for themselves', () => {
  const viewName = (name: string): string => `${ar}-view-${name}`;

  it('needs a kind to list, and no content grant at all to read its own', async () => {
    expect((await call('/views')).status).toBe(401);
    const noKind = await call('/views', read(actors.Owner));
    expect(noKind.status).toBe(400);
    expect(noKind.error).toBe('kind_required');
    const wrongKind = await call('/views?kind=widgets', read(actors.Owner));
    expect(wrongKind.status).toBe(400);

    // The view is the caller's own row: the `self` resource answers here, not `list.read`,
    // which is why a Viewer with no content grants still has a filter bar.
    const viewer = await call('/views?kind=list_item', read(actors.Viewer));
    expect(viewer.status).toBe(200);
    expect(viewer.views).toEqual([]);
  });

  it('stores what the list would run and drops what the browser added', async () => {
    const saved = await call('/views', write(actors.Viewer, 'POST', {
      kind: 'article',
      name: viewName('card'),
      query: '?mode=card&sort=title&dir=desc&filter=published&page=4&per=10&q=فرع&key=some-row&bogus=1',
    }));
    expect(saved.status).toBe(200);
    // Re-rendered by the parser, in the address bar order, with the row it opened left out.
    expect(saved.viewRow).toMatchObject({ kind: 'article', name: viewName('card'), query: '?mode=card&sort=title&dir=desc&q=%D9%81%D8%B1%D8%B9&filter=published&page=4&per=10' });

    const ran = await call(`/content/article${saved.viewRow.query}`, read(actors.Viewer));
    expect(ran.view).toEqual({ mode: 'card', sort: 'title', dir: 'desc', q: 'فرع', filter: 'published', page: 4, per: 10 });
  });

  it('keeps the list and scope a view was run over', async () => {
    const saved = await call('/views', write(actors.Editor, 'POST', {
      kind: 'list_item',
      name: viewName('branches'),
      query: '?list=branches&locale=en&trash=1&key=some-row&filter=draft',
    }));
    // The row it opened and the chip that cannot be true in Trash are both dropped: a saved
    // view stores what the screen actually ran, not what the address bar happened to hold.
    expect(saved.viewRow.query).toBe('?list=branches&locale=en&trash=1');

    const ran = await call(`/content/list_item${saved.viewRow.query}`, read(actors.Editor));
    expect(ran.body.listKey).toBe('branches');
    expect(ran.body.trash).toBe(true);
    expect(ran.view.filter).toBe('all');
    expect(ran.view.mode).toBe('table');
  });

  it('is private: nobody else can list it, and nobody else can delete it', async () => {
    const mine = await call('/views', write(actors.Editor, 'POST', { kind: 'page', name: viewName('private') }));
    expect(mine.status).toBe(200);
    // No terms is the plain default view, and the empty line is what it stores.
    expect(mine.viewRow.query).toBe('');

    expect((await call('/views?kind=page', read(actors.Viewer))).views).toEqual([]);
    expect((await call('/views?kind=page', read(actors.Owner))).views).toEqual([]);

    const stolen = await call(`/views/${mine.viewRow.id}`, write(actors.Viewer, 'DELETE'));
    expect(stolen.status).toBe(404);
    expect(stolen.error).toBe('not_found');
    // The 404 alone does not prove the row survived; the owner's list does.
    expect((await call('/views?kind=page', read(actors.Editor))).views.map((view) => view.id)).toEqual([mine.viewRow.id]);

    const odd = await call(`/views/${mine.viewRow.id}/extra`, write(actors.Editor, 'DELETE'));
    expect(odd.status).toBe(404);
    expect(odd.error).toBe('unknown_route');

    expect((await call(`/views/${mine.viewRow.id}`, write(actors.Editor, 'DELETE'))).status).toBe(200);
    expect((await call('/views?kind=page', read(actors.Editor))).views).toEqual([]);
  });

  it('revives a filter whose name was already used instead of failing on a hidden chip', async () => {
    const first = await call('/views', write(actors.Owner, 'POST', { kind: 'offer', name: viewName('ghost'), query: '?filter=pending' }));
    expect(first.viewRow.query).toBe('?filter=pending');
    expect((await call(`/views/${first.viewRow.id}`, write(actors.Owner, 'DELETE'))).status).toBe(200);

    // The unique index over (user, kind, name) still holds that name, so a plain insert
    // here would surface as a 500 for a chip the person can no longer see.
    const again = await call('/views', write(actors.Owner, 'POST', { kind: 'offer', name: viewName('ghost'), query: '?sort=key' }));
    expect(again.status).toBe(200);
    expect(again.viewRow.id).toBe(first.viewRow.id);
    expect(again.viewRow.query).toBe('?sort=key');

    const stored = await db.selectFrom('console_views').select(['deleted_at', 'query', 'version']).where('id', '=', first.viewRow.id).executeTakeFirstOrThrow();
    expect(stored.deleted_at).toBeNull();
    expect(stored.query).toBe('?sort=key');
    expect(Number(stored.version)).toBe(2);
    const sameName = await db.selectFrom('console_views').select('id').where('name', '=', viewName('ghost')).execute();
    expect(sameName).toHaveLength(1);
  });

  it('refuses a name already in use, a blank one, and a kind that does not exist', async () => {
    const dupe = await call('/views', write(actors.Owner, 'POST', { kind: 'offer', name: viewName('ghost') }));
    expect(dupe.status).toBe(409);
    expect(dupe.error).toBe('name_taken');

    const blank = await call('/views', write(actors.Owner, 'POST', { kind: 'offer', name: '   ' }));
    expect(blank.status).toBe(400);
    expect(blank.error).toBe('name_required');

    const wrongKind = await call('/views', write(actors.Owner, 'POST', { kind: 'widgets', name: viewName('bad-kind') }));
    expect(wrongKind.status).toBe(400);
    expect(wrongKind.error).toBe('invalid_input');
    expect(wrongKind.issues[0]?.path).toBe('kind');
  });

  it('caps one person at twenty-four filters', async () => {
    const user = await db.selectFrom('users').select('id').where('email', '=', actors.Admin.email).executeTakeFirstOrThrow();
    await db
      .insertInto('console_views')
      .values(Array.from({ length: 24 }, (_, i) => ({ id: randomUUID(), user_id: user.id, kind: 'article', name: `${ar}-cap-${i}`, query: '' })))
      .execute();

    const full = await call('/views', write(actors.Admin, 'POST', { kind: 'article', name: viewName('one-more') }));
    expect(full.status).toBe(409);
    expect(full.error).toBe('views_full');

    await db.deleteFrom('console_views').where('name', 'like', `${ar}-cap-%`).execute();
    expect((await call('/views?kind=article', read(actors.Admin))).views).toEqual([]);
  });
});

// --- what the screens offer ----------------------------------------------------

describe('contentScreenData hands the workspace only the buttons the API honours', () => {
  it('gives the Owner both locales for a bilingual kind', async () => {
    const data = await contentScreenData('article', { grants: actors.Owner.grants, locale: 'ar' });
    expect(data).not.toBeNull();
    expect(data?.scopeKind).toBe('locales');
    expect(data?.keyColumn).toBe('slug');
    expect(data?.scopes).toEqual(['ar', 'en']);
    expect(data?.abilities).toEqual({ create: ['ar', 'en'], update: ['ar', 'en'], publish: ['ar', 'en'], remove: ['ar', 'en'] });
    expect(data?.writable).toBe(true);
    expect(data?.labels['content.save']).toBeTruthy();
  });

  it('trims a single-language editor down to Arabic', async () => {
    const data = await contentScreenData('article', { grants: actors.ArabicOnly.grants, locale: 'en' });
    expect(data?.abilities).toEqual({ create: ['ar'], update: ['ar'], publish: ['ar'], remove: [] });
    expect(data?.locale).toBe('en');
  });

  it('leaves a read-only role able to open the screen and unable to press anything', async () => {
    const viewer = await contentScreenData('article', { grants: actors.Viewer.grants, locale: 'ar' });
    expect(viewer).not.toBeNull();
    expect(viewer?.writable).toBe(false);
    expect(viewer?.abilities).toEqual({ create: [], update: [], publish: [], remove: [] });
    expect(viewer?.page.rows.length).toBeGreaterThan(0);

    // A Marketer holds no `list read` at all, so the lists screen is not shown to them.
    // A Marketer holds no `list read` at all, so the lists screen is not shown to them.
    expect(await contentScreenData('list_item', { grants: actors.Marketer.grants, locale: 'ar' })).toBeNull();
  });

  it('shows an editor every list but the navigation, and both language tabs on a page', async () => {
    const lists = await contentScreenData('list_item', { grants: actors.Editor.grants, locale: 'ar' });
    expect(lists?.scopeKind).toBe('lists');
    expect(lists?.listKey).toBeTruthy();
    expect(lists?.lists.map((list) => list.key).sort()).toEqual([...LIST_KEYS].sort());
    // The tabs are console chrome, not content, so an Arabic console labels them Arabic.
    expect(lists?.lists.find((list) => list.key === 'branches')?.label).toBe('الفروع');
    const english = await contentScreenData('list_item', { grants: actors.Editor.grants, locale: 'en' });
    expect(english?.lists.find((list) => list.key === 'branches')?.label).toBe('Branches');
    for (const key of ['create', 'update', 'publish', 'remove'] as const) {
      expect(lists?.abilities[key]).toEqual(expect.arrayContaining([...EDITOR_LIST_KEYS]));
      expect(lists?.abilities[key]).not.toContain('nav');
    }

    const pages = await contentScreenData('page', { grants: actors.Editor.grants, locale: 'ar' });
    expect(pages?.abilities.update).toEqual(['ar', 'en']);
    // The catalog gives a page create, update and publish — never delete.
    expect(pages?.abilities.remove).toEqual([]);
  });

  it('pins one list to the section that names it', async () => {
    // `/console/results` reads results and nothing else; the old list tabs are gone.
    const data = await contentScreenData('list_item', { grants: actors.Editor.grants, locale: 'ar', listKey: 'results' });
    expect(data?.listKey).toBe('results');
    expect(data?.scopes).toEqual(['results']);
  });
});

describe('one function spells the scope every write names (BK-13.5)', () => {
  it('answers a tab screen and a list screen through the line the screen now builds', async () => {
    // Workspace, editor and list each used to build this themselves. The rule moved into
    // `writeScopeQuery`, so the proof is that a write carrying the line the components call
    // is still judged against the scope its caller meant — on a save, a create and a bulk.
    const tab = writeScopeQuery({ listKey: null, locale: 'ar' });
    expect(tab).toBe('?locale=ar');

    const created = await call(`/content/article${tab}`, write(actors.Owner, 'POST', { key: slug('one-spelling') }));
    expect(created.status, JSON.stringify(created.body)).toBe(200);

    const saved = await call(`/content/article/${created.row.id}${tab}`, write(actors.Owner, 'PATCH', { fields: { title: 'spelled once' } }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.row.fields.title).toMatchObject({ draft: { ar: 'spelled once' } });

    const trashed = await call(`/content/article/bulk/trash${tab}`, write(actors.Owner, 'POST', { ids: [created.row.id] }));
    expect(trashed.status, JSON.stringify(trashed.body)).toBe(200);
    expect(trashed.done).toEqual([created.row.id]);
    const restored = await call(`/content/article/bulk/restore${tab}`, write(actors.Owner, 'POST', { ids: [created.row.id] }));
    expect(restored.done, JSON.stringify(restored.body)).toEqual([created.row.id]);

    const named = writeScopeQuery({ listKey: 'branches', locale: 'ar' });
    const row = await call(`/content/list_item${named}`, write(actors.Editor, 'POST', { key: `${ar}-one-spelling` }));
    expect(row.status, JSON.stringify(row.body)).toBe(200);
  });

  it('names the list and never both terms', () => {
    // The guard reads its scope off the URL, so a line that named a list *and* a language
    // would be judged against whichever it reads first. One term, always, is the rule.
    expect(writeScopeQuery({ listKey: 'nav', locale: 'ar' })).toBe('?list=nav');
    // An empty list is not a scope, so the language is what the write can name.
    expect(writeScopeQuery({ listKey: '', locale: 'en' })).toBe('?locale=en');
    expect(writeScopeQuery({ listKey: null, locale: null })).toBe('');
  });
});

describe('search appearance is one override per address and language (S4)', () => {
  const seoPath = `/bk6-seo-${run}`;
  const secondPath = `${seoPath}/second`;

  async function actorId(): Promise<string> {
    const row = await db.selectFrom('users').select('id').where('email', '=', actors.Owner.email).executeTakeFirstOrThrow();
    return row.id;
  }

  it('saves a trimmed pair, reads it back per language, and clears by writing an empty pair', async () => {
    const id = await actorId();
    await saveSeoOverride({ path: seoPath, locale: 'ar', title: '  عنوان  ', description: ' وصف ', actorId: id });

    expect(await readSeoOverride(seoPath, 'ar')).toEqual({ title: 'عنوان', description: 'وصف' });
    // The key is address plus language: the other tab still inherits.
    expect(await readSeoOverride(seoPath, 'en')).toBeNull();

    await saveSeoOverride({ path: seoPath, locale: 'ar', title: '', description: '', actorId: id });
    expect(await readSeoOverride(seoPath, 'ar')).toBeNull();
    expect(await db.selectFrom('seo_entries').select('id').where('entity_id', '=', seoPath).execute()).toEqual([]);
  });

  it('reads one screen’s overrides in one query, keyed by path', async () => {
    const id = await actorId();
    await saveSeoOverride({ path: seoPath, locale: 'en', title: 'English title', description: '', actorId: id });
    await saveSeoOverride({ path: secondPath, locale: 'en', title: '', description: 'English description', actorId: id });

    const batch = await readSeoOverrides([seoPath, secondPath, '/bk6-never-saved'], 'en');
    expect(batch.get(seoPath)).toEqual({ title: 'English title', description: '' });
    expect(batch.get(secondPath)).toEqual({ title: '', description: 'English description' });
    expect(batch.has('/bk6-never-saved')).toBe(false);

    await saveSeoOverride({ path: seoPath, locale: 'en', title: '', description: '', actorId: id });
    await saveSeoOverride({ path: secondPath, locale: 'en', title: '', description: '', actorId: id });
  });

  it('checks the permission before it parses the body', async () => {
    // No `seo update` at all: the answer is 403 even though the body is empty and invalid.
    const denied = await call('/seo', write(actors.Viewer, 'POST', {}));
    expect(denied.status).toBe(403);
    expect(denied.error).toBe('forbidden');

    const invalid = await call('/seo', write(actors.Owner, 'POST', { path: 'not-a-path', locale: 'ar', title: '', description: '' }));
    expect(invalid.status).toBe(400);
    expect(invalid.error).toBe('invalid_input');

    const saved = await call(
      '/seo',
      write(actors.Owner, 'POST', { path: seoPath, locale: 'ar', title: 'من الرابط', description: 'وصف من الرابط' }),
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.override).toEqual({ title: 'من الرابط', description: 'وصف من الرابط' });

    const cleared = await call('/seo', write(actors.Owner, 'POST', { path: seoPath, locale: 'ar', title: '', description: '' }));
    expect(cleared.status).toBe(200);
    expect(cleared.body.override).toBeNull();
  });

  it('builds the center from the site’s own reads and withholds the fields a role cannot write', async () => {
    const owner = await seoCenterData({ grants: actors.Owner.grants, locale: 'ar' });
    expect(owner).not.toBeNull();
    expect(owner?.writable).toBe(true);
    // The home page is a row even when the site has no article or offer at all.
    expect(owner?.rows.some((row) => row.section === 'pages' && row.path === '')).toBe(true);
    for (const row of owner?.rows ?? []) {
      expect(row.href.startsWith('/ar')).toBe(true);
      expect(['ok', 'long', 'missing']).toContain(row.status);
    }

    const viewer = await seoCenterData({ grants: actors.Viewer.grants, locale: 'en' });
    expect(viewer).not.toBeNull();
    expect(viewer?.writable).toBe(false);
    expect(viewer?.rows.find((row) => row.path === '')?.href).toBe('/en');
  });

  it('gives an entity panel the path the site serves, or says it has none', async () => {
    const about = await entitySeoOf('page', 'about', null, 'ar');
    expect(about.path).toBe('/about');
    expect(about.inherited.title.length).toBeGreaterThan(0);
    expect(about.override).toBeNull();

    const results = await entitySeoOf('list_item', `${ar}-result`, 'results', 'ar');
    expect(results.path).toBeNull();
  });
});

// --- an authored order is moved, not typed (review item 2) ---------------------

describe('moving a row one step renumbers its list, and no route takes a typed number', () => {
  const od = (name: string): string => `${ar}-od-${name}`;
  const ids: Record<string, string> = {};

  /**
   * The list in the order both the site and the arrows read it: the column, then the key.
   *
   * It answers with ids, because a move has to name the row this same read just returned —
   * looking an id up again by `uid` alone can hand back a trashed twin of it, and the route
   * would then refuse a row that is plainly on the screen.
   */
  async function orderOf(listKey: string): Promise<{ id: string; uid: string; position: number }[]> {
    const list = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirstOrThrow();
    const rows = await db
      .selectFrom('list_items')
      .select(['id', 'uid', 'position'])
      .where('list_id', '=', list.id)
      .where('deleted_at', 'is', null)
      .orderBy('position', 'asc')
      .orderBy('uid', 'asc')
      .execute();
    return rows.map((row) => ({ id: row.id, uid: row.uid, position: Number(row.position) }));
  }

  /** Just this describe's questions, in the order the list reads them. */
  const uidsOf = async (): Promise<string[]> => (await orderOf('faq')).filter((row) => row.uid.startsWith(od(''))).map((row) => row.uid);

  beforeAll(async () => {
    for (const name of ['a', 'b', 'c']) {
      const created = await call('/content/list_item?list=faq', write(actors.Editor, 'POST', { key: od(name) }));
      ids[name] = created.row.id;
      await call(`/content/list_item/${ids[name]}?list=faq`, write(actors.Editor, 'PATCH', { fields: { data: { question_ar: `سؤال ${name}`, question_en: `Question ${name}` } } }));
    }
    // A second list, so a request scoped to one can name a row that lives in the other.
    ids.doctor = (await call('/content/list_item?list=specialists', write(actors.Editor, 'POST', { key: od('doctor') }))).row.id;
    ids.offer = (await call('/content/offer?locale=ar', write(actors.Editor, 'POST', { key: od('offer'), fields: { name: 'عرض ترتيب' } }))).row.id;
  });

  it('appends a new row at the end of the list instead of in front of it', async () => {
    // The column defaults to 0 and the WordPress import left every imported row at 0, so a
    // question added through *Add new* used to arrive ahead of the list it had just joined.
    expect(await uidsOf()).toEqual([od('a'), od('b'), od('c')]);
    expect((await orderOf('faq')).at(-1)?.uid).toBe(od('c'));
  });

  it('swaps a row with the one above it and numbers the whole list 1..n', async () => {
    const before = await auditCount('list.update', actors.Editor);
    const res = await call(`/content/list_item/${ids.b}/move?list=faq`, write(actors.Editor, 'POST', { direction: 'up' }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body.ids as string[]).length).toBe((await orderOf('faq')).length);
    expect(await uidsOf()).toEqual([od('b'), od('a'), od('c')]);

    // No two rows are left sharing a number: that is what made an imported list change place
    // between two loads, because the read ordered by a column every row equalled.
    const all = await orderOf('faq');
    expect(all.map((row) => row.position)).toEqual(all.map((_, index) => index + 1));
    expect(await auditCount('list.update', actors.Editor)).toBe(before + 1);
  });

  it('has nowhere to go at either end, and writes nothing when it cannot move', async () => {
    const all = await orderOf('faq');
    // The ids come from the same read the route will run, so this names the row that is
    // actually first on the screen and not a trashed twin of it.
    const up = await call(`/content/list_item/${all[0]!.id}/move?list=faq`, write(actors.Editor, 'POST', { direction: 'up' }));
    expect(up.status, JSON.stringify(up.body)).toBe(409);
    expect(up.error).toBe('nothing_to_move');
    const down = await call(`/content/list_item/${all[all.length - 1]!.id}/move?list=faq`, write(actors.Editor, 'POST', { direction: 'down' }));
    expect(down.status, JSON.stringify(down.body)).toBe(409);
    expect(await orderOf('faq')).toEqual(all);
  });

  it('takes a direction and not a number', async () => {
    // The editor's Order box is gone, and this is the other half of that: the route cannot be
    // handed a position to jump to, only a step, so a saved number can never outrank a move.
    const typed = await call(`/content/list_item/${ids.a}/move?list=faq`, write(actors.Editor, 'POST', { position: 2 }));
    expect(typed.status).toBe(400);
    expect(typed.issues.map((issue) => issue.path)).toEqual(['direction']);
    expect((await call(`/content/list_item/${ids.a}/move?list=faq`, write(actors.Editor, 'POST', { direction: 'left' }))).status).toBe(400);
    expect(await uidsOf()).toEqual([od('b'), od('a'), od('c')]);
  });

  it('will not reorder a row the address does not name, and asks permission first', async () => {
    const cross = await call(`/content/list_item/${ids.doctor}/move?list=faq`, write(actors.Editor, 'POST', { direction: 'up' }));
    expect(cross.status).toBe(404);

    const denied = await call(`/content/list_item/${ids.doctor}/move?list=faq`, write(actors.Viewer, 'POST', { direction: 'up' }));
    expect(denied.status).toBe(403);
    expect(denied.denied).toBe('list.update');
    // A refusal never reached the table, so the order is exactly what the test above left.
    expect(await uidsOf()).toEqual([od('b'), od('a'), od('c')]);
  });

  it('moves an offer on the scope its own screen names', async () => {
    const second = await call('/content/offer?locale=ar', write(actors.Editor, 'POST', { key: od('offer2'), fields: { name: 'عرض ترتيب ثانٍ' } }));
    const slugsOf = async (): Promise<string[]> => {
      const rows = await db
        .selectFrom('offers')
        .select(['slug', 'position'])
        .where('deleted_at', 'is', null)
        .orderBy('position', 'asc')
        .orderBy('slug', 'asc')
        .execute();
      return rows.map((row) => row.slug).filter((slug) => slug.startsWith(od('')));
    };
    expect(await slugsOf()).toEqual([od('offer'), od('offer2')]);

    const res = await call(`/content/offer/${second.row.id}/move?locale=ar`, write(actors.Editor, 'POST', { direction: 'up' }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await slugsOf()).toEqual([od('offer2'), od('offer')]);
  });

  it('answers a list request with the order the move just wrote', async () => {
    // The whole scope on one page, because the claim is about the list as the site reads it:
    // every row printed at its own rank, so two rows can never share a number and swap places
    // between two loads. A search-filtered page would only prove the order of a slice.
    const res = await call(listUrl('list_item', { list: 'faq', per: '100' }), read(actors.Editor));
    expect(res.view.sort).toBe('position');
    const numbers = res.page.rows.map((row) => Number(row.cells.position));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(res.page.rows.map((row) => row.key).filter((key) => key.startsWith(od('')))).toEqual(await uidsOf());
  });
});
