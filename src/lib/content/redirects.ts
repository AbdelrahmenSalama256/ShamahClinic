/**
 * Redirects the console manages, and the lookup the proxy asks on every page request.
 *
 * The proxy cannot afford a query per request, so it reads an in-memory copy of the
 * enabled rules. A console save bumps a version on `globalThis` — the proxy and the route
 * handlers share one Node process — and the next request reloads; a 60-second age limit
 * covers anything that writes the table from elsewhere. A database that cannot answer is
 * "no redirects", never an error page: a redirect is an improvement, not a dependency.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { matchRedirect, type RedirectMatch, type RedirectRule, type RedirectStatus } from './redirect-rules';

export interface RedirectView extends RedirectRule {
  enabled: boolean;
  hits: number;
  note: string;
  updatedAt: string;
}

interface Cache {
  version: number;
  loadedAt: number;
  loadedVersion: number;
  rules: RedirectRule[];
  loading: Promise<RedirectRule[]> | null;
}

const MAX_AGE_MS = 60_000;
const shared = globalThis as typeof globalThis & { __shamahRedirects?: Cache };
function cache(): Cache {
  shared.__shamahRedirects ??= { version: 0, loadedAt: 0, loadedVersion: -1, rules: [], loading: null };
  return shared.__shamahRedirects;
}

/** Tells the proxy its copy is stale. Called after every console write. */
export function bumpRedirects(): void {
  cache().version += 1;
}

async function loadRules(): Promise<RedirectRule[]> {
  const rows = await db
    .selectFrom('redirects')
    .select(['id', 'source_path', 'target_path', 'status_code', 'match_type'])
    .where('enabled', '=', 1)
    .where('deleted_at', 'is', null)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    source: row.source_path,
    target: row.target_path,
    status: (Number(row.status_code) === 302 ? 302 : 301) as RedirectStatus,
    match: (row.match_type === 'prefix' ? 'prefix' : 'exact') as RedirectMatch,
  }));
}

async function currentRules(): Promise<RedirectRule[]> {
  const state = cache();
  const fresh = state.loadedVersion === state.version && Date.now() - state.loadedAt < MAX_AGE_MS;
  if (fresh) return state.rules;
  if (!state.loading) {
    const version = state.version;
    state.loading = loadRules()
      .then((rules) => {
        state.rules = rules;
        state.loadedVersion = version;
        state.loadedAt = Date.now();
        return rules;
      })
      .catch(() => {
        // Try again in a minute rather than on every request while the database is down.
        state.loadedVersion = version;
        state.loadedAt = Date.now();
        return state.rules;
      })
      .finally(() => {
        state.loading = null;
      });
  }
  return state.loading;
}

/** The redirect for a request path, if one applies. Never throws. */
export async function findRedirect(pathname: string): Promise<{ id: string; location: string; status: RedirectStatus } | null> {
  try {
    const rules = await currentRules();
    if (rules.length === 0) return null;
    const hit = matchRedirect(rules, pathname);
    return hit ? { id: hit.rule.id, location: hit.location, status: hit.rule.status } : null;
  } catch {
    return null;
  }
}

export async function recordRedirectHit(id: string): Promise<void> {
  try {
    await db
      .updateTable('redirects')
      .set((eb) => ({ hits: eb('hits', '+', 1) }))
      .where('id', '=', id)
      .execute();
  } catch {
    /* a lost count is not worth a failed redirect */
  }
}

function toView(row: {
  id: string;
  source_path: string;
  target_path: string;
  status_code: number;
  match_type: string;
  enabled: number;
  hits: number;
  note: string;
  updated_at: Date;
}): RedirectView {
  return {
    id: row.id,
    source: row.source_path,
    target: row.target_path,
    status: Number(row.status_code) === 302 ? 302 : 301,
    match: row.match_type === 'prefix' ? 'prefix' : 'exact',
    enabled: Number(row.enabled) === 1,
    hits: Number(row.hits),
    note: row.note,
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = ['id', 'source_path', 'target_path', 'status_code', 'match_type', 'enabled', 'hits', 'note', 'updated_at'] as const;

export async function listRedirects(): Promise<RedirectView[]> {
  const rows = await db.selectFrom('redirects').select([...COLUMNS]).where('deleted_at', 'is', null).orderBy('updated_at', 'desc').execute();
  return rows.map(toView);
}

export interface RedirectInput {
  source: string;
  target: string;
  status: RedirectStatus;
  match: RedirectMatch;
  enabled: boolean;
  note: string;
}

export type RedirectWrite = { ok: true; value: RedirectView } | { ok: false; status: number; code: string };

async function readOne(id: string): Promise<RedirectView | null> {
  const row = await db.selectFrom('redirects').select([...COLUMNS]).where('id', '=', id).executeTakeFirst();
  return row ? toView(row) : null;
}

async function sourceTaken(source: string, except: string | null): Promise<boolean> {
  let query = db.selectFrom('redirects').select('id').where('source_path', '=', source);
  if (except) query = query.where('id', '!=', except);
  return !!(await query.executeTakeFirst());
}

export async function createRedirect(input: RedirectInput, actorId: string): Promise<RedirectWrite> {
  // A rule deleted earlier still owns its source in the unique index; a new one replaces it.
  await db.deleteFrom('redirects').where('source_path', '=', input.source).where('deleted_at', 'is not', null).execute();
  if (await sourceTaken(input.source, null)) return { ok: false, status: 409, code: 'duplicate_source' };
  const id = randomUUID();
  await db
    .insertInto('redirects')
    .values({
      id,
      source_path: input.source,
      target_path: input.target,
      status_code: input.status,
      match_type: input.match,
      enabled: input.enabled ? 1 : 0,
      note: input.note,
      created_by: actorId,
      updated_by: actorId,
    })
    .execute();
  bumpRedirects();
  const value = await readOne(id);
  return value ? { ok: true, value } : { ok: false, status: 500, code: 'write_failed' };
}

export async function updateRedirect(id: string, input: RedirectInput, actorId: string): Promise<RedirectWrite> {
  const existing = await readOne(id);
  if (!existing) return { ok: false, status: 404, code: 'not_found' };
  if (await sourceTaken(input.source, id)) return { ok: false, status: 409, code: 'duplicate_source' };
  await db
    .updateTable('redirects')
    .set({
      source_path: input.source,
      target_path: input.target,
      status_code: input.status,
      match_type: input.match,
      enabled: input.enabled ? 1 : 0,
      note: input.note,
      updated_by: actorId,
      version: (eb) => eb('version', '+', 1),
    })
    .where('id', '=', id)
    .execute();
  bumpRedirects();
  const value = await readOne(id);
  return value ? { ok: true, value } : { ok: false, status: 500, code: 'write_failed' };
}

export async function deleteRedirect(id: string): Promise<boolean> {
  const result = await db.deleteFrom('redirects').where('id', '=', id).executeTakeFirst();
  bumpRedirects();
  return Number(result.numDeletedRows) > 0;
}
