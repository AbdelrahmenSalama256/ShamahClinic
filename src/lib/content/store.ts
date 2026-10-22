/**
 * Reading and writing content rows, one implementation for every kind.
 *
 * The tables differ only in their columns, so this module works from the column
 * map in ./kinds.ts and drives the query builder through the narrow shapes at the
 * bottom of the file. That makes this the one place a content column is touched by
 * name — and therefore the place to look when a kind gains a field.
 *
 * Nothing here hard-deletes. Trash is `deleted_at`: the row keeps its id, its
 * version and its revisions, and a restore puts them back. See ./publish.ts for
 * what publishing writes.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { CONTENT_LOCALES, kindSpec, parseWrites, type ContentKind, type ContentLocale, type KindSpec } from './kinds';

type AnyRow = Record<string, unknown>;

/** One field of a row, as the console renders it: the draft plus its published twin. */
export interface FieldView {
  kind: 'bi' | 'json' | 'text' | 'number' | 'flag';
  draft?: Record<ContentLocale, string>;
  pub?: Record<ContentLocale, string | null>;
  value?: string | number | boolean | null;
  draftJson?: unknown;
  pubJson?: unknown;
  /** the draft differs from what the site currently serves */
  pending: boolean;
  /** no published twin, so a save reaches a visitor immediately */
  immediate: boolean;
  multiline: boolean;
  max: number;
}

export interface ContentRow {
  id: string;
  kind: ContentKind;
  key: string;
  status: string;
  version: number;
  trashed: boolean;
  updatedAt: string;
  publishedAt: string | null;
  /** the locales whose draft differs from the published copy */
  pendingLocales: ContentLocale[];
  fields: Record<string, FieldView>;
}

export interface ListOptions {
  /** list items only: the `lists.list_key` they belong to */
  listKey?: string;
  /** read the Trash instead of the live rows */
  trash?: boolean;
  limit?: number;
}

export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; issues?: { path: string; message: string }[] };

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

/** MariaDB keeps JSON as LONGTEXT; the driver parses it back, but not on every path. */
function asJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function mapRow(spec: KindSpec, row: AnyRow): ContentRow {
  const fields: Record<string, FieldView> = {};
  const pendingLocales: ContentLocale[] = [];

  /** A JSON document is one value for both languages, so its draft outruns both twins. */
  const markAllLocales = (): void => {
    for (const locale of CONTENT_LOCALES) {
      if (!pendingLocales.includes(locale)) pendingLocales.push(locale);
    }
  };

  for (const field of spec.bi) {
    const draft = { ar: asText(row[field.draft.ar]), en: asText(row[field.draft.en]) };
    const pub = field.pub ? { ar: asText(row[field.pub.ar]), en: asText(row[field.pub.en]) } : null;
    // Only the locale whose pair actually differs is pending: an editor reading the
    // English tab of an article whose Arabic was just rewritten must not be told
    // their language has unpublished changes.
    const differs = (locale: ContentLocale): boolean => pub !== null && draft[locale] !== pub[locale];
    for (const locale of CONTENT_LOCALES) if (differs(locale) && !pendingLocales.includes(locale)) pendingLocales.push(locale);
    fields[field.name] = {
      kind: 'bi',
      draft,
      pub: pub ?? { ar: null, en: null },
      pending: CONTENT_LOCALES.some(differs),
      immediate: field.pub === null,
      multiline: field.multiline,
      max: field.max,
    };
  }

  for (const field of spec.json) {
    const draftJson = asJsonValue(row[field.draft]);
    const pubJson = field.pub ? asJsonValue(row[field.pub]) : null;
    const pending = field.pub !== null && JSON.stringify(draftJson) !== JSON.stringify(pubJson ?? null);
    if (pending) markAllLocales();
    fields[field.name] = {
      kind: 'json',
      draftJson,
      pubJson,
      pending,
      immediate: field.pub === null,
      multiline: true,
      max: 1_000_000,
    };
  }

  for (const field of spec.text) {
    const raw = row[field.column];
    fields[field.name] = {
      kind: 'text',
      value: raw === null || raw === undefined || raw === '' ? null : String(raw),
      pending: false,
      immediate: true,
      multiline: false,
      max: field.max,
    };
  }
  for (const field of spec.number) {
    const raw = row[field.column];
    fields[field.name] = {
      kind: 'number',
      value: raw === null || raw === undefined ? null : Number(raw),
      pending: false,
      immediate: true,
      multiline: false,
      max: 0,
    };
  }
  for (const field of spec.flag) {
    fields[field.name] = {
      kind: 'flag',
      value: Number(row[field.column] ?? 0) === 1,
      pending: false,
      immediate: true,
      multiline: false,
      max: 0,
    };
  }

  return {
    id: String(row.id),
    kind: spec.kind,
    key: asText(row[spec.keyColumn]),
    status: asText(row.status),
    version: Number(row.version ?? 1),
    trashed: row.deleted_at !== null && row.deleted_at !== undefined,
    updatedAt: toIso(row.updated_at),
    publishedAt: row.published_at === null || row.published_at === undefined ? null : toIso(row.published_at),
    pendingLocales,
    fields,
  };
}

async function listIdForKey(listKey: string): Promise<string | null> {
  if (!listKey) return null;
  const row = await db.selectFrom('lists').select(['id']).where('list_key', '=', listKey).executeTakeFirst();
  return row?.id ?? null;
}

/** The rows a kind holds; list items come back in their authored order. */
export async function listRows(kind: ContentKind, options: ListOptions = {}): Promise<ContentRow[]> {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdForKey(options.listKey ?? '') : null;
  if (spec.table === 'list_items' && !listId) return [];

  let query: QueryShape = db.selectFrom(spec.table).selectAll() as unknown as QueryShape;
  if (listId) query = query.where('list_id', '=', listId);
  query = query.where('deleted_at', options.trash ? 'is not' : 'is', null);
  query =
    spec.table === 'list_items'
      ? query.orderBy('position', 'asc').orderBy('uid', 'asc')
      : query.orderBy('updated_at', 'desc');
  if (options.limit) query = query.limit(options.limit);

  return (await query.execute()).map((row) => mapRow(spec, row as AnyRow));
}

export async function getRow(kind: ContentKind, id: string): Promise<ContentRow | null> {
  const spec = kindSpec(kind);
  const row = await (db.selectFrom(spec.table).selectAll().where('id', '=', id) as unknown as QueryShape).executeTakeFirst();
  return row ? mapRow(spec, row as AnyRow) : null;
}

export async function createRow(
  kind: ContentKind,
  input: { key: string; listKey?: string; actorId: string },
): Promise<StoreResult<ContentRow>> {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdForKey(input.listKey ?? '') : null;
  if (spec.table === 'list_items' && !listId) {
    return { ok: false, status: 400, code: 'unknown_list', issues: [{ path: 'list', message: `no list registered as "${input.listKey}"` }] };
  }

  // The identity column is unique; say so with a 409 instead of letting the
  // driver's duplicate-key error surface as a 500.
  let taken: FilterShape = db.selectFrom(spec.table).select(['id']) as unknown as FilterShape;
  taken = taken.where(spec.keyColumn, '=', input.key).where('deleted_at', 'is', null);
  if (listId) taken = taken.where('list_id', '=', listId);
  if (await taken.executeTakeFirst()) return { ok: false, status: 409, code: 'key_taken' };

  const id = randomUUID();
  const values: Record<string, unknown> = {
    id,
    [spec.keyColumn]: input.key,
    status: 'draft',
    created_by: input.actorId,
    updated_by: input.actorId,
    version: 1,
  };
  if (listId) {
    values.list_id = listId;
    values.draft = JSON.stringify({});
  }

  await (db.insertInto(spec.table).values(values as never) as unknown as ExecuteShape).execute();
  const row = await getRow(kind, id);
  return row ? { ok: true, value: row } : { ok: false, status: 500, code: 'insert_failed' };
}

/**
 * Save one locale's draft. The row's `version` is the optimistic lock: if another
 * editor wrote first, this update matches no row and the caller is told to reload
 * rather than having their colleague's change silently overwritten.
 *
 * Saving never touches the published copy — that is publish's job (./publish.ts).
 */
export async function saveDraft(
  kind: ContentKind,
  input: { id: string; locale: ContentLocale; fields: Record<string, unknown>; expectedVersion?: number; actorId: string },
): Promise<StoreResult<ContentRow>> {
  const spec = kindSpec(kind);
  const current = await getRow(kind, input.id);
  if (!current) return { ok: false, status: 404, code: 'not_found' };
  if (current.trashed) return { ok: false, status: 409, code: 'in_trash' };

  const parsed = parseWrites(spec, { key: current.key, fields: input.fields }, input.locale);
  if (parsed.issues.length > 0) return { ok: false, status: 400, code: 'invalid_input', issues: parsed.issues };

  const patch: Record<string, unknown> = { ...parsed.columns, updated_by: input.actorId, version: current.version + 1 };

  // `list_items` has a 'changed' status in its enum; the other kinds keep
  // draft/published and read "unpublished changes" off the draft/pub pair.
  if (spec.table === 'list_items' && current.status !== 'draft') {
    const merged = mapRow(spec, { ...(await rawRow(spec, input.id)), ...patch });
    patch.status = merged.pendingLocales.length > 0 ? 'changed' : 'published';
  }

  const lock = input.expectedVersion ?? current.version;
  const result = await (
    db.updateTable(spec.table).set(patch as never).where('id', '=', input.id).where('version', '=', lock) as unknown as TakeFirstShape
  ).executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0) === 0) {
    return { ok: false, status: 409, code: 'stale_row', issues: [{ path: 'version', message: `the row is at version ${current.version}; reload it` }] };
  }
  const row = await getRow(kind, input.id);
  return row ? { ok: true, value: row } : { ok: false, status: 500, code: 'update_failed' };
}

async function rawRow(spec: KindSpec, id: string): Promise<AnyRow> {
  const row = await (db.selectFrom(spec.table).selectAll().where('id', '=', id) as unknown as QueryShape).executeTakeFirst();
  return (row ?? {}) as AnyRow;
}

/** Move a row into Trash or back out of it. Both keep the id, version and revisions. */
export async function setTrashed(
  kind: ContentKind,
  input: { id: string; trashed: boolean; actorId: string },
): Promise<StoreResult<ContentRow>> {
  const spec = kindSpec(kind);
  const current = await getRow(kind, input.id);
  if (!current) return { ok: false, status: 404, code: 'not_found' };
  if (current.trashed === input.trashed) return { ok: true, value: current };

  const patch: Record<string, unknown> = {
    deleted_at: input.trashed ? new Date() : null,
    updated_by: input.actorId,
    version: current.version + 1,
  };
  // Only articles/offers/pages have 'trash' in their status enum.
  if (spec.table !== 'list_items') patch.status = input.trashed ? 'trash' : current.publishedAt ? 'published' : 'draft';

  await (db.updateTable(spec.table).set(patch as never).where('id', '=', input.id) as unknown as TakeFirstShape).executeTakeFirst();
  const row = await getRow(kind, input.id);
  return row ? { ok: true, value: row } : { ok: false, status: 500, code: 'update_failed' };
}

/** The list keys already registered in `lists` — seeded from `LIST_KEYS`. */
export async function knownListKeys(): Promise<string[]> {
  const rows = await db.selectFrom('lists').select(['list_key']).where('deleted_at', 'is', null).orderBy('list_key', 'asc').execute();
  return rows.map((row) => row.list_key);
}

// --- the narrow query shapes -------------------------------------------------
// Kysely types each column name against one table at a time and this store runs one
// query over four of them, so the builder is reached through the handful of methods
// actually used. Every column name it receives comes from ./kinds.ts, which is the
// single place those names are declared.

interface QueryShape {
  where(column: string, operator: string, value: unknown): QueryShape;
  orderBy(column: string, direction?: 'asc' | 'desc'): QueryShape;
  limit(count: number): QueryShape;
  execute(): Promise<unknown[]>;
  executeTakeFirst(): Promise<unknown | undefined>;
}
interface FilterShape {
  where(column: string, operator: string, value: unknown): FilterShape;
  executeTakeFirst(): Promise<unknown | undefined>;
}
interface ExecuteShape {
  execute(): Promise<unknown>;
}
interface TakeFirstShape {
  executeTakeFirst(): Promise<{ numUpdatedRows?: bigint | number } | undefined>;
}
