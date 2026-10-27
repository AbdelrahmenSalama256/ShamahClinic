/**
 * The content API the console calls — plain `Request` in, `Response` out, every
 * write through `guard()`, so it is testable without a server and the route files
 * stay one-liners.
 *
 * The permission scope is read from the URL and never from the body, because
 * `guard()` decides permission before it parses a payload:
 *   - `?list=branches` says which list a `list_item` write belongs to, and
 *   - `?locale=ar` says which locale a bilingual write is editing.
 *
 * Publishing is the one place a body choice needs checking: the request may ask for
 * both locales, and each one is then re-tested against the caller's `update` grant
 * for that locale. A caller who may write Arabic but not English gets the Arabic
 * published, the English untouched, and a response naming what actually moved.
 *
 * A collection `GET` returns one page of summaries — filtered, searched and ordered by
 * MariaDB, not by the browser — because a screen of 92 articles must not fetch 92
 * article bodies to draw them. Bulk writes answer with the ids that moved and the ones
 * that did not, since a page of rows that is half-allowed is an ordinary thing to send.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { can, type Action as PermissionAction, type Grant, type Resource, type Target } from '../auth/permissions';
import { CONTENT_LOCALES, isContentKind, isContentLocale, kindSpec, type ContentKind, type ContentLocale, type KindSpec } from './kinds';
import { createRow, getRow, listKeyOfItem, saveDraft, setTrashed, type StoreResult } from './store';
import { createTitledRow } from './create';
import { listRevisions, publishRow, rollbackToRevision } from './publish';
import { listSummaries } from './summary';
import { moveRow } from './order';
import { parseListView, parseListScope } from './list-view';
import { readSettings, writeSetting } from './settings';

const fieldValues = z.record(z.string(), z.unknown());
/**
 * A new row is named by its title. The identity (`slug`, `route`, `uid`) is derived
 * from that title, because the person adding an article knows what it is called and
 * not what a URL-safe version of that looks like. An explicit `key` is still accepted
 * for an import, which has one already.
 */
const createSchema = z
  .object({
    key: z.string().min(1).max(191).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    locale: z.enum(['ar', 'en']).optional(),
    fields: fieldValues.optional(),
  })
  .refine((input) => Boolean(input.key || input.title), { path: ['title'], message: 'required' });
const saveSchema = z.object({ fields: fieldValues, version: z.number().int().positive().optional() });
const trashSchema = z.object({ trashed: z.boolean().optional() });
const publishSchema = z.object({ locales: z.array(z.enum(['ar', 'en'])).min(1).max(2).optional(), note: z.string().max(200).optional() });
const rollbackSchema = z.object({ revision: z.number().int().positive() });
const settingSchema = z.object({ group: z.string().min(1).max(64), key: z.string().min(1).max(120), value: z.unknown() });
/**
 * A move names a step, never a number. The caller says "this row, one place up" and the
 * server works out which row it passed and renumbers the list, because a position typed into
 * a box is a position two people can claim at once.
 */
const moveSchema = z.object({ direction: z.enum(['up', 'down']) });
/** A bulk request is capped: 100 rows is a page of lists, and anything larger is a script's job. */
const bulkSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });

type RowAction = 'publish' | 'restore' | 'rollback' | 'revisions' | 'move';
/** The bulk verbs, named in the path so permission is decided before the body is read. */
type Bulk = 'publish' | 'trash' | 'restore';
const BULK_ACTIONS: readonly Bulk[] = ['publish', 'trash', 'restore'];

interface Route {
  kind: ContentKind;
  id: string | null;
  action: RowAction | null;
  bulk: Bulk | null;
}

/** `/api/console/content/<kind>[/<id>[/<action>]]`, or `…/<kind>/bulk/<publish|trash|restore>` */
function parseRoute(url: string): Route | null {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const offset = segments.indexOf('content');
  if (offset === -1) return null;
  const [kind, id, action] = segments.slice(offset + 1);
  if (!kind || !isContentKind(kind)) return null;
  // `bulk` is a reserved segment: a row id is a UUID, so it can never be the word.
  if (id === 'bulk') {
    if (!action || !BULK_ACTIONS.includes(action as Bulk)) return null;
    return { kind, id: null, action: null, bulk: action as Bulk };
  }
  const known: readonly RowAction[] = ['publish', 'restore', 'rollback', 'revisions', 'move'];
  if (action && !known.includes(action as RowAction)) return null;
  return { kind, id: id ?? null, action: (action as RowAction) ?? null, bulk: null };
}

function param(req: Request, name: string): string | null {
  return new URL(req.url).searchParams.get(name);
}

/** The permission scope, from the request line: a list item names its list, the rest name their locale. */
function scopeOf(req: Request, spec: KindSpec): Target {
  if (spec.scope === 'lists') {
    const list = param(req, 'list');
    return list ? { lists: list } : {};
  }
  const locale = param(req, 'locale');
  return locale && isContentLocale(locale) ? { locales: locale } : {};
}

function localeFor(req: Request, spec: KindSpec): ContentLocale | null {
  if (!spec.perLocale) return 'ar';
  const value = param(req, 'locale');
  return value && isContentLocale(value) ? value : null;
}

type Body = Record<string, unknown>;

function failure(result: StoreResult<unknown>): GuardResult<Body> {
  if (result.ok) return { data: {} };
  return { status: result.status, data: { error: result.code, ...(result.issues ? { issues: result.issues } : {}) } };
}

function notFound(): GuardResult<Body> {
  return { status: 404, data: { error: 'not_found' } };
}

/** The locales this caller may write — and therefore may publish. */
function writableLocales(grants: readonly Grant[], resource: Resource): ContentLocale[] {
  return CONTENT_LOCALES.filter((locale) => can(grants, resource, 'update', { locales: locale }));
}

async function listHandler(req: Request, spec: KindSpec, kind: ContentKind): Promise<Response> {
  return guard(req, { resource: spec.resource, action: 'read' }, async (): Promise<GuardResult<Body>> => {
    const params = new URL(req.url).searchParams;
    const scope = parseListScope(params);
    if (spec.scope === 'lists' && !scope.listKey) return { status: 400, data: { error: 'list_required' } };
    // The view is re-read here rather than trusted from the query string, so the
    // `view` the response echoes is the one the query actually ran.
    const view = parseListView(params, kind);
    const asked = scope.locale ?? '';
    const page = await listSummaries(kind, {
      view,
      listKey: scope.listKey,
      trash: scope.trash,
      locale: isContentLocale(asked) ? asked : 'ar',
    });
    return { data: { kind, listKey: scope.listKey, trash: scope.trash, view, page } };
  });
}

async function createHandler(req: Request, spec: KindSpec, kind: ContentKind): Promise<Response> {
  return guard<z.output<typeof createSchema>, Body>(
    req,
    { resource: spec.resource, action: 'create', schema: createSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const listKey = spec.scope === 'lists' ? param(req, 'list') : null;
      if (spec.scope === 'lists' && !listKey) return { status: 400, data: { error: 'list_required' } };

      // A title is the whole input: the identity is derived from it and made unique
      // against every row, trashed ones included. An explicit key still wins, which is
      // how an import keeps the address its old site served.
      if (!ctx.input.key) {
        const created = await createTitledRow(kind, {
          title: ctx.input.title ?? '',
          locale: ctx.input.locale ?? localeFor(req, spec) ?? 'ar',
          listKey: listKey ?? undefined,
          actorId: ctx.auth.user.id,
        });
        if (!created.ok) return failure(created);
        return { data: { row: created.value }, audit: { entityType: kind, entityId: created.value.id, after: created.value } };
      }

      const created = await createRow(kind, { key: ctx.input.key, listKey: listKey ?? undefined, actorId: ctx.auth.user.id });
      if (!created.ok) return failure(created);

      let row = created.value;
      if (ctx.input.fields) {
        const locale = localeFor(req, spec);
        if (!locale) return { status: 400, data: { error: 'locale_required' } };
        const saved = await saveDraft(kind, { id: created.value.id, locale, fields: ctx.input.fields, actorId: ctx.auth.user.id });
        if (!saved.ok) return failure(saved);
        row = saved.value;
      }
      return { data: { row }, audit: { entityType: kind, entityId: row.id, after: row } };
    },
  );
}

async function readHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard(req, { resource: spec.resource, action: 'read' }, async (): Promise<GuardResult<Body>> => {
    const row = await getRow(kind, id);
    return row ? { data: { row } } : notFound();
  });
}

async function revisionsHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard(req, { resource: spec.resource, action: 'read' }, async (): Promise<GuardResult<Body>> => {
    const row = await getRow(kind, id);
    if (!row) return notFound();
    return { data: { revisions: await listRevisions(kind, id) } };
  });
}

async function saveHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard<z.output<typeof saveSchema>, Body>(
    req,
    { resource: spec.resource, action: 'update', schema: saveSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await getRow(kind, id);
      if (!before) return notFound();
      const locale = localeFor(req, spec);
      if (!locale) return { status: 400, data: { error: 'locale_required' } };

      const saved = await saveDraft(kind, { id, locale, fields: ctx.input.fields, expectedVersion: ctx.input.version, actorId: ctx.auth.user.id });
      if (!saved.ok) return failure(saved);
      return { data: { row: saved.value }, audit: { entityType: kind, entityId: id, before, after: saved.value } };
    },
  );
}

async function trashHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string, trashed: boolean): Promise<Response> {
  // Restoring is not a delete, so it needs the write grant rather than `delete`.
  const action = trashed ? 'delete' : 'update';
  return guard<z.output<typeof trashSchema>, Body>(
    req,
    { resource: spec.resource, action, schema: trashed ? trashSchema : undefined, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await getRow(kind, id);
      if (!before) return notFound();
      const move = trashed ? (ctx.input.trashed ?? true) : false;
      const result = await setTrashed(kind, { id, trashed: move, actorId: ctx.auth.user.id });
      if (!result.ok) return failure(result);
      return { data: { row: result.value }, audit: { entityType: kind, entityId: id, before, after: result.value } };
    },
  );
}

async function publishHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard<z.output<typeof publishSchema>, Body>(
    req,
    { resource: spec.resource, action: 'publish', schema: publishSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await getRow(kind, id);
      if (!before) return notFound();

      const asked = (ctx.input.locales ?? ['ar', 'en']) as ContentLocale[];
      let locales = asked.filter((locale) => writableLocales(ctx.auth.user.grants, spec.resource).includes(locale));
      if (!spec.perLocale) locales = [...CONTENT_LOCALES];
      if (spec.perLocale && locales.length === 0) return { status: 403, data: { error: 'no_writable_locale' } };

      const done = await publishRow(kind, { id, locales, actor: { id: ctx.auth.user.id, email: ctx.auth.user.email }, note: ctx.input.note });
      if (!done.ok) return failure(done);
      return { data: { row: done.value.row, revision: done.value.revision, locales: done.value.locales }, audit: { entityType: kind, entityId: id, before, after: done.value.row } };
    },
  );
}

async function rollbackHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard<z.output<typeof rollbackSchema>, Body>(
    req,
    // `can()` answers before the body is parsed, so an unauthorised rollback never
    // learns which revision numbers exist.
    { resource: spec.resource, action: 'publish', schema: rollbackSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await getRow(kind, id);
      if (!before) return notFound();
      const done = await rollbackToRevision(kind, { id, revision: ctx.input.revision, actor: { id: ctx.auth.user.id, email: ctx.auth.user.email } });
      if (!done.ok) return failure(done);
      return { data: { row: done.value.row, revision: done.value.revision }, audit: { entityType: kind, entityId: id, before, after: done.value.row } };
    },
  );
}

/**
 * Move one row one step through its list.
 *
 * The scope is read off the request line like every other write, and a list item is then
 * checked against the list it names — the same test a bulk write runs, so a grant over
 * `branches` cannot reorder `specialists` by pasting one of their ids. The renumbering itself
 * is `./order.ts`, which rewrites the whole list `1..n` so no two rows can end up sharing a
 * number and trading places between two page loads.
 */
async function moveHandler(req: Request, spec: KindSpec, kind: ContentKind, id: string): Promise<Response> {
  return guard<z.output<typeof moveSchema>, Body>(
    req,
    { resource: spec.resource, action: 'update', schema: moveSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const listKey = spec.scope === 'lists' ? param(req, 'list') : null;
      if (spec.scope === 'lists' && !listKey) return { status: 400, data: { error: 'list_required' } };
      if (listKey && (await listKeyOfItem(id)) !== listKey) return notFound();

      const moved = await moveRow(kind, { id, direction: ctx.input.direction, listKey, actorId: ctx.auth.user.id });
      if (!moved.ok) return failure(moved);
      // The order a visitor sees is the order this just changed, and the pages are ISR.
      revalidateSite();
      return {
        data: { ids: moved.value.ids },
        audit: { entityType: kind, entityId: id, after: { direction: ctx.input.direction, renumbered: moved.value.written } },
      };
    },
  );
}

/**
 * Publish, Trash or restore a page of rows in one request.
 *
 * The verb is a path segment, not a body field, because `guard()` decides permission
 * before it reads a payload. The rows are the caller's own ids, but each one is still
 * tested against the scope the request line names: a grant over `branches` must not
 * publish a `specialists` row because someone pasted its id.
 */
async function bulkHandler(req: Request, spec: KindSpec, kind: ContentKind, bulk: Bulk): Promise<Response> {
  // Trash is a delete, restore is a write, publish is publish — the same mapping the
  // single-row routes use, so a role that can do one can do the other at scale.
  const action: PermissionAction = bulk === 'publish' ? 'publish' : bulk === 'trash' ? 'delete' : 'update';
  return guard<z.output<typeof bulkSchema>, Body>(
    req,
    { resource: spec.resource, action, schema: bulkSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const listKey = spec.scope === 'lists' ? param(req, 'list') : null;
      if (spec.scope === 'lists' && !listKey) return { status: 400, data: { error: 'list_required' } };

      const allowed = writableLocales(ctx.auth.user.grants, spec.resource);
      const locales = spec.perLocale ? allowed : [...CONTENT_LOCALES];
      if (spec.perLocale && locales.length === 0) return { status: 403, data: { error: 'no_writable_locale' } };

      const actor = { id: ctx.auth.user.id, email: ctx.auth.user.email };
      const done: string[] = [];
      const failed: { id: string; code: string }[] = [];
      for (const id of ctx.input.ids) {
        if (listKey && (await listKeyOfItem(id)) !== listKey) {
          failed.push({ id, code: 'out_of_scope' });
          continue;
        }
        const result =
          bulk === 'publish'
            ? await publishRow(kind, { id, locales, actor })
            : await setTrashed(kind, { id, trashed: bulk === 'trash', actorId: ctx.auth.user.id });
        if (result.ok) done.push(id);
        else failed.push({ id, code: result.code });
      }

      // A request that moved nothing changed nothing: it answers 409 and writes no audit row.
      if (done.length === 0) return { status: 409, data: { error: 'bulk_nothing_applied', failed } };
      return {
        data: { done, failed, locales: spec.perLocale ? locales : null },
        audit: { entityType: kind, entityId: `bulk.${bulk}`, after: { action: bulk, done, failed } },
      };
    },
  );
}

/** `GET/POST /api/console/content/<kind>` */
export async function contentCollectionHandler(req: Request): Promise<Response> {
  const route = parseRoute(req.url);
  if (!route) return jsonError(404, 'unknown_route');
  const spec = kindSpec(route.kind);
  if (req.method === 'GET') return listHandler(req, spec, route.kind);
  if (req.method === 'POST') return createHandler(req, spec, route.kind);
  return jsonError(405, 'method_not_allowed');
}

/** `GET/PATCH/DELETE /api/console/content/<kind>/<id>` */
export async function contentItemHandler(req: Request): Promise<Response> {
  const route = parseRoute(req.url);
  if (!route?.id) return jsonError(404, 'unknown_route');
  const spec = kindSpec(route.kind);
  if (req.method === 'GET') return readHandler(req, spec, route.kind, route.id);
  if (req.method === 'PATCH') return saveHandler(req, spec, route.kind, route.id);
  if (req.method === 'DELETE') return trashHandler(req, spec, route.kind, route.id, true);
  return jsonError(405, 'method_not_allowed');
}

/** `POST /api/console/content/<kind>/<id>/publish|restore|rollback|move`, `GET .../revisions`, `POST .../bulk/<verb>` */
export async function contentActionHandler(req: Request): Promise<Response> {
  const route = parseRoute(req.url);
  if (!route) return jsonError(404, 'unknown_route');
  const spec = kindSpec(route.kind);
  if (route.bulk) return req.method === 'POST' ? bulkHandler(req, spec, route.kind, route.bulk) : jsonError(405, 'method_not_allowed');
  if (!route.id || !route.action) return jsonError(404, 'unknown_route');
  const { id, kind } = route;

  if (route.action === 'revisions') return req.method === 'GET' ? revisionsHandler(req, spec, kind, id) : jsonError(405, 'method_not_allowed');
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');
  if (route.action === 'publish') return publishHandler(req, spec, kind, id);
  if (route.action === 'rollback') return rollbackHandler(req, spec, kind, id);
  if (route.action === 'move') return moveHandler(req, spec, kind, id);
  return trashHandler(req, spec, kind, id, false);
}

/** `GET /api/console/settings`, `PATCH /api/console/settings` */
export async function settingsHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'setting', action: 'read' }, async () => ({ data: { rows: await readSettings() } }));
  }
  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof settingSchema>, Body>(
    req,
    { resource: 'setting', action: 'update', schema: settingSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const saved = await writeSetting({ group: ctx.input.group, key: ctx.input.key, value: ctx.input.value, actorId: ctx.auth.user.id });
      if (!saved.ok) return failure(saved);
      revalidateSite();
      return { data: { row: saved.value }, audit: { entityType: 'setting', entityId: `${ctx.input.group}.${ctx.input.key}`, after: saved.value } };
    },
  );
}

/**
 * A setting is live the moment its row is written, but the public pages are ISR and were
 * rendered with the old value — a renamed clinic or a hidden page would keep its old
 * answer for up to five minutes. The pattern covers both language segments, and the
 * layout covers every route under it, the same way the site's own revalidate endpoint
 * names patterns rather than concrete URLs.
 *
 * Outside a request (the unit tests call the handler directly) there is no cache to
 * invalidate and `revalidatePath` throws; that is not a failed save.
 */
function revalidateSite(): void {
  try {
    revalidatePath('/[lang]', 'layout');
    revalidatePath('/sitemap.xml', 'page');
  } catch {
    /* no request scope */
  }
}
