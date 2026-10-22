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
 */
import { z } from 'zod';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { can, type Grant, type Resource, type Target } from '../auth/permissions';
import { CONTENT_LOCALES, isContentKind, isContentLocale, kindSpec, type ContentKind, type ContentLocale, type KindSpec } from './kinds';
import { createRow, getRow, listRows, saveDraft, setTrashed, type StoreResult } from './store';
import { listRevisions, publishRow, rollbackToRevision } from './publish';
import { readSettings, writeSetting } from './settings';

const fieldValues = z.record(z.string(), z.unknown());
const createSchema = z.object({ key: z.string().min(1).max(191), fields: fieldValues.optional() });
const saveSchema = z.object({ fields: fieldValues, version: z.number().int().positive().optional() });
const trashSchema = z.object({ trashed: z.boolean().optional() });
const publishSchema = z.object({ locales: z.array(z.enum(['ar', 'en'])).min(1).max(2).optional(), note: z.string().max(200).optional() });
const rollbackSchema = z.object({ revision: z.number().int().positive() });
const settingSchema = z.object({ group: z.string().min(1).max(64), key: z.string().min(1).max(120), value: z.unknown() });

type Action = 'publish' | 'restore' | 'rollback' | 'revisions';
interface Route {
  kind: ContentKind;
  id: string | null;
  action: Action | null;
}

/** `/api/console/content/<kind>[/<id>[/<action>]]` */
function parseRoute(url: string): Route | null {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const offset = segments.indexOf('content');
  if (offset === -1) return null;
  const [kind, id, action] = segments.slice(offset + 1);
  if (!kind || !isContentKind(kind)) return null;
  const known: readonly Action[] = ['publish', 'restore', 'rollback', 'revisions'];
  if (action && !known.includes(action as Action)) return null;
  return { kind, id: id ?? null, action: (action as Action) ?? null };
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
    const listKey = param(req, 'list');
    if (spec.scope === 'lists' && !listKey) return { status: 400, data: { error: 'list_required' } };
    const trash = param(req, 'trash') === '1';
    return { data: { kind, listKey, trash, rows: await listRows(kind, { listKey: listKey ?? undefined, trash }) } };
  });
}

async function createHandler(req: Request, spec: KindSpec, kind: ContentKind): Promise<Response> {
  return guard<z.output<typeof createSchema>, Body>(
    req,
    { resource: spec.resource, action: 'create', schema: createSchema, target: (r) => scopeOf(r, spec) },
    async (ctx): Promise<GuardResult<Body>> => {
      const listKey = spec.scope === 'lists' ? param(req, 'list') : null;
      if (spec.scope === 'lists' && !listKey) return { status: 400, data: { error: 'list_required' } };

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

/** `POST /api/console/content/<kind>/<id>/publish|restore|rollback`, `GET .../revisions` */
export async function contentActionHandler(req: Request): Promise<Response> {
  const route = parseRoute(req.url);
  if (!route?.id || !route.action) return jsonError(404, 'unknown_route');
  const spec = kindSpec(route.kind);
  const { id, kind } = route;

  if (route.action === 'revisions') return req.method === 'GET' ? revisionsHandler(req, spec, kind, id) : jsonError(405, 'method_not_allowed');
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');
  if (route.action === 'publish') return publishHandler(req, spec, kind, id);
  if (route.action === 'rollback') return rollbackHandler(req, spec, kind, id);
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
      return { data: { row: saved.value }, audit: { entityType: 'setting', entityId: `${ctx.input.group}.${ctx.input.key}`, after: saved.value } };
    },
  );
}
