/**
 * `/api/console/redirects` — the Redirects screen's writes.
 *
 *   GET    /api/console/redirects               rules and the 404 log      redirect.read
 *   POST   /api/console/redirects               a new rule                 redirect.create
 *   PATCH  /api/console/redirects/<id>          edit a rule                redirect.update
 *   DELETE /api/console/redirects/<id>          remove a rule              redirect.delete
 *   DELETE /api/console/redirects/404/<id|all>  forget a 404 row, or all   redirect.delete
 *
 * The id is read from the path, like the leads API, so one handler serves every verb.
 */
import { z } from 'zod';
import { guard, jsonError } from '../auth/guard';
import { deleteNotFound, listNotFound } from './not-found-log';
import { isSelfRedirect, normalizeRedirectPath, normalizeRedirectTarget } from './redirect-rules';
import { createRedirect, deleteRedirect, listRedirects, updateRedirect, type RedirectInput } from './redirects';

const ruleSchema = z
  .object({
    source: z.string().max(1000),
    target: z.string().max(1000),
    status: z.union([z.literal(301), z.literal(302)]).default(301),
    match: z.enum(['exact', 'prefix']).default('exact'),
    enabled: z.boolean().default(true),
    note: z.string().max(500).default(''),
  })
  .transform((value, ctx): RedirectInput => {
    const source = normalizeRedirectPath(value.source);
    const target = normalizeRedirectTarget(value.target);
    if (!source || source === '/') ctx.addIssue({ code: 'custom', path: ['source'], message: 'invalid_source' });
    if (!target) ctx.addIssue({ code: 'custom', path: ['target'], message: 'invalid_target' });
    if (source && target && isSelfRedirect(source, target, value.match)) {
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'loop' });
    }
    return { ...value, source: source ?? '', target: target ?? '', note: value.note.trim() };
  });

type Body = Record<string, unknown>;

function idsOf(req: Request): { id: string | null; notFound: string | null } {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean); // api console redirects …
  const rest = parts.slice(3);
  if (rest[0] === '404') return { id: null, notFound: rest[1] ?? null };
  return { id: rest[0] ?? null, notFound: null };
}

export async function redirectsHandler(req: Request): Promise<Response> {
  const { id, notFound } = idsOf(req);

  if (notFound !== null) {
    if (req.method !== 'DELETE') return jsonError(405, 'method_not_allowed');
    return guard<unknown, Body>(req, { resource: 'redirect', action: 'delete' }, async () => {
      const removed = await deleteNotFound(notFound === 'all' ? 'all' : notFound);
      return { data: { removed }, audit: { entityType: 'not_found', entityId: notFound, after: { removed } } };
    });
  }

  if (id === null) {
    if (req.method === 'GET') {
      return guard<unknown, Body>(req, { resource: 'redirect', action: 'read' }, async () => ({
        data: { redirects: await listRedirects(), notFound: await listNotFound().catch(() => []) },
      }));
    }
    if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');
    return guard<RedirectInput, Body>(req, { resource: 'redirect', action: 'create', schema: ruleSchema }, async (ctx) => {
      const saved = await createRedirect(ctx.input, ctx.auth.user.id);
      if (!saved.ok) return { status: saved.status, data: { error: saved.code }, audit: false };
      return { status: 201, data: { redirect: saved.value }, audit: { entityType: 'redirect', entityId: saved.value.id, after: saved.value } };
    });
  }

  if (req.method === 'PATCH') {
    return guard<RedirectInput, Body>(req, { resource: 'redirect', action: 'update', schema: ruleSchema }, async (ctx) => {
      const saved = await updateRedirect(id, ctx.input, ctx.auth.user.id);
      if (!saved.ok) return { status: saved.status, data: { error: saved.code }, audit: false };
      return { data: { redirect: saved.value }, audit: { entityType: 'redirect', entityId: id, after: saved.value } };
    });
  }
  if (req.method === 'DELETE') {
    return guard<unknown, Body>(req, { resource: 'redirect', action: 'delete' }, async () => {
      const removed = await deleteRedirect(id);
      if (!removed) return { status: 404, data: { error: 'not_found' }, audit: false };
      return { data: { removed: true }, audit: { entityType: 'redirect', entityId: id, after: null } };
    });
  }
  return jsonError(405, 'method_not_allowed');
}
