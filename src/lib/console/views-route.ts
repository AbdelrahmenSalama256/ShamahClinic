/**
 * Saved list filters — one person's own, and nobody else's.
 *
 * A view is a name on a query string, and the query string is not trusted as sent: the
 * handler re-parses it through `parseListView()` and stores its own rendering of the
 * result. So a saved view can only ever hold terms the list can honour for that kind,
 * it carries no `?key=` (a filter is a way to read a list, not a bookmark of one row),
 * and what the console restores tomorrow is byte-for-byte what it saved today.
 *
 * `guard()` answers for the whole `self` resource, which is deliberately coarse: the
 * row filter on `user_id` below is what makes a view private. Every statement here
 * names `user_id` — a list, a rename check, a delete — so there is no path that reads
 * another person's filters by guessing an id.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../db';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { CONTENT_KINDS, isContentKind, type ContentKind } from '../content/kinds';
import { canonicalViewQuery } from '../content/list-view';

/** Views per person per kind: enough for a season of campaigns, short enough to scan as chips. */
const VIEWS_CAP = 24;

export interface SavedView {
  id: string;
  kind: ContentKind;
  name: string;
  /** the canonical query string, leading `?` included; '' means the plain default view */
  query: string;
}

type Body = Record<string, unknown>;

const createSchema = z.object({
  kind: z.enum(CONTENT_KINDS),
  name: z.string().min(1).max(80),
  query: z.string().max(600).optional(),
});

function kindAskedFor(req: Request): ContentKind | null {
  const value = new URL(req.url).searchParams.get('kind') ?? '';
  return isContentKind(value) ? value : null;
}

/** The line a request asks to save, re-rendered by the parser rather than stored verbatim. */
function canonOf(value: string | undefined, kind: ContentKind): string {
  const text = (value ?? '').trim().replace(/^\?/, '').slice(0, 512);
  return canonicalViewQuery(new URLSearchParams(text), kind);
}

/** `/api/console/views/<id>`: the segment after `views`, and nothing after that. */
function idFrom(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const [id, extra] = segments.slice(segments.indexOf('views') + 1);
  return id && !extra ? id : null;
}

function toView(row: { id: string; kind: string; name: string; query: string }): SavedView {
  return { id: row.id, kind: isContentKind(row.kind) ? row.kind : 'article', name: row.name, query: row.query };
}

/** `GET/POST /api/console/views` — list one kind's saved filters, or add one. */
export async function viewsHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'self', action: 'read' }, async (ctx): Promise<GuardResult<Body>> => {
      const kind = kindAskedFor(req);
      if (!kind) return { status: 400, data: { error: 'kind_required' } };
      const rows = await db
        .selectFrom('console_views')
        .select(['id', 'kind', 'name', 'query'])
        .where('user_id', '=', ctx.auth.user.id)
        .where('kind', '=', kind)
        .where('deleted_at', 'is', null)
        .orderBy('position', 'asc')
        .orderBy('name', 'asc')
        .execute();
      return { data: { views: rows.map(toView) } };
    });
  }
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof createSchema>, Body>(
    req,
    { resource: 'self', action: 'create', schema: createSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const kind = ctx.input.kind;
      const name = ctx.input.name.trim();
      if (!name) return { status: 400, data: { error: 'name_required' } };
      const query = canonOf(ctx.input.query, kind);
      // Every statement names `user_id`: the grant says the row is theirs to change,
      // this filter says which one. `owned` is what the person can actually see, so both
      // the name check and the cap run over it.
      const owned = () =>
        db
          .selectFrom('console_views')
          .where('user_id', '=', ctx.auth.user.id)
          .where('kind', '=', kind)
          .where('deleted_at', 'is', null);

      if (await owned().where('name', '=', name).select('id').executeTakeFirst()) {
        return { status: 409, data: { error: 'name_taken' } };
      }
      const counted = await owned().select(sql<number>`COUNT(*)`.as('total')).executeTakeFirst();
      const total = Number(counted?.total ?? 0);
      if (total >= VIEWS_CAP) return { status: 409, data: { error: 'views_full' } };

      // A deleted filter keeps its name — the unique index over (user, kind, name) says
      // so — so saving that name again brings the old row back instead of failing on a
      // chip the person can no longer see.
      const hidden = await db
        .selectFrom('console_views')
        .where('user_id', '=', ctx.auth.user.id)
        .where('kind', '=', kind)
        .where('name', '=', name)
        .where('deleted_at', 'is not', null)
        .select('id')
        .executeTakeFirst();

      let id = hidden?.id;
      if (id) {
        await db
          .updateTable('console_views')
          .set({ deleted_at: null, query, version: sql`version + 1` })
          .where('id', '=', id)
          .where('user_id', '=', ctx.auth.user.id)
          .execute();
      } else {
        id = randomUUID();
        await db
          .insertInto('console_views')
          .values({ id, user_id: ctx.auth.user.id, kind, name, query, position: total + 1 })
          .execute();
      }

      const saved = await db.selectFrom('console_views').select(['id', 'kind', 'name', 'query']).where('id', '=', id).executeTakeFirst();
      if (!saved) return { status: 500, data: { error: 'insert_failed' } };
      return { data: { view: toView(saved) }, audit: { entityType: 'view', entityId: id, after: saved } };
    },
  );
}

/** `DELETE /api/console/views/<id>` — and only ever the caller's own row. */
export async function viewItemHandler(req: Request): Promise<Response> {
  if (req.method !== 'DELETE') return jsonError(405, 'method_not_allowed');
  const id = idFrom(req);
  if (!id) return jsonError(404, 'unknown_route');

  return guard(req, { resource: 'self', action: 'delete' }, async (ctx): Promise<GuardResult<Body>> => {
    const before = await db
      .selectFrom('console_views')
      .select(['id', 'kind', 'name', 'query'])
      .where('id', '=', id)
      .where('user_id', '=', ctx.auth.user.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!before) return { status: 404, data: { error: 'not_found' } };

    await db.updateTable('console_views').set({ deleted_at: new Date() }).where('id', '=', id).where('user_id', '=', ctx.auth.user.id).execute();
    return { data: { deleted: id }, audit: { entityType: 'view', entityId: id, before } };
  });
}
