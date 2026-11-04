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
import { readStored, type FieldFormat } from './format';
import { sanitizeRichHtml } from './rich';
import { htmlStems, listSchemaOf, pageDocSchema, parseListDoc } from './list-schema';
import { positionForNewItem } from './order';
import { canonicalizeOfferServices } from './offer-services';
import {
  calendarDay,
  CONTENT_LOCALES,
  kindSpec,
  parseWrites,
  positionColumn,
  type ContentKind,
  type ContentLocale,
  type KindSpec,
  type ParseResult,
} from './kinds';

type AnyRow = Record<string, unknown>;

/** One field of a row, as the console renders it: the draft plus its published twin. */
export interface FieldView {
  kind: 'bi' | 'json' | 'text' | 'date' | 'number' | 'flag';
  draft?: Record<ContentLocale, string>;
  pub?: Record<ContentLocale, string | null>;
  /** for a `date` field this is the day as `YYYY-MM-DD`, which is what its input box writes back */
  value?: string | number | boolean | null;
  draftJson?: unknown;
  pubJson?: unknown;
  /** the draft differs from what the site currently serves */
  pending: boolean;
  /** no published twin, so a save reaches a visitor immediately */
  immediate: boolean;
  multiline: boolean;
  max: number;
  /**
   * What the column holds, for the fields that hold text.
   *
   * The editor uses it to clean a `plain` box when the person leaves it — the same
   * `plainText()` the server runs, so the words in the box are the words in the database.
   * A `json`, `date`, `number` or `flag` field has no format to report and leaves it off.
   */
  format?: FieldFormat;
}

export interface ContentRow {
  id: string;
  kind: ContentKind;
  key: string;
  /** the list a `list_item` belongs to; null for the bilingual kinds */
  listKey: string | null;
  status: string;
  version: number;
  trashed: boolean;
  updatedAt: string;
  publishedAt: string | null;
  /** the locales whose draft differs from the published copy */
  pendingLocales: ContentLocale[];
  fields: Record<string, FieldView>;
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

function mapRow(spec: KindSpec, row: AnyRow, listKey: string | null = null): ContentRow {
  const fields: Record<string, FieldView> = {};
  const pendingLocales: ContentLocale[] = [];

  /** A JSON document is one value for both languages, so its draft outruns both twins. */
  const markAllLocales = (): void => {
    for (const locale of CONTENT_LOCALES) {
      if (!pendingLocales.includes(locale)) pendingLocales.push(locale);
    }
  };

  for (const field of spec.bi) {
    // Read through the field's format, so a WordPress `<p>` left in a plain column never
    // reaches the editor that is about to re-save it. The published twin is cleaned the
    // same way, otherwise the two sides of a pending diff differ only by markup noise.
    const draft = { ar: readStored(field.format, row[field.draft.ar]), en: readStored(field.format, row[field.draft.en]) };
    const pub = field.pub ? { ar: readStored(field.format, row[field.pub.ar]), en: readStored(field.format, row[field.pub.en]) } : null;
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
      format: field.format,
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
    const value = readStored(field.format, row[field.column]);
    fields[field.name] = {
      kind: 'text',
      value: value === '' ? null : value,
      pending: false,
      immediate: true,
      multiline: false,
      max: field.max,
      format: field.format,
    };
  }
  for (const field of spec.date) {
    fields[field.name] = {
      kind: 'date',
      value: calendarDay(row[field.column]),
      pending: false,
      immediate: true,
      multiline: false,
      max: 10,
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
    listKey,
    status: asText(row.status),
    version: Number(row.version ?? 1),
    trashed: row.deleted_at !== null && row.deleted_at !== undefined,
    updatedAt: toIso(row.updated_at),
    publishedAt: row.published_at === null || row.published_at === undefined ? null : toIso(row.published_at),
    pendingLocales,
    fields,
  };
}

export async function listIdForKey(listKey: string): Promise<string | null> {
  if (!listKey) return null;
  const row = await db.selectFrom('lists').select(['id']).where('list_key', '=', listKey).executeTakeFirst();
  return row?.id ?? null;
}

/**
 * The list a `list_item` row belongs to, by key.
 *
 * A bulk write names rows by id and the permission scope by `?list=`, so the two have
 * to be compared before anything moves — otherwise a caller granted one list could
 * publish another one's rows by pasting their ids.
 */
export async function listKeyOfItem(id: string): Promise<string | null> {
  const row = await db
    .selectFrom('list_items')
    .innerJoin('lists', 'lists.id', 'list_items.list_id')
    .select('lists.list_key')
    .where('list_items.id', '=', id)
    .executeTakeFirst();
  return row?.list_key ?? null;
}

/**
 * The row a `?key=` names, as the id the editor loads it by.
 *
 * A link can point at a row that is not on the page the list just fetched — the screen
 * has 92 articles and shows 25 — so the server resolves the identity before rendering
 * and the browser only ever fetches by id.
 */
export async function idForRowKey(kind: ContentKind, key: string, listKey?: string): Promise<string | null> {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdForKey(listKey ?? '') : null;
  if (spec.table === 'list_items' && !listId) return null;
  let query: FilterShape = db.selectFrom(spec.table).select(['id']) as unknown as FilterShape;
  query = query.where(spec.keyColumn, '=', key);
  if (listId) query = query.where('list_id', '=', listId);
  const row = await query.executeTakeFirst();
  return (row as { id?: string } | undefined)?.id ?? null;
}

export async function getRow(kind: ContentKind, id: string): Promise<ContentRow | null> {
  const spec = kindSpec(kind);
  const found = await (db.selectFrom(spec.table).selectAll().where('id', '=', id) as unknown as QueryShape).executeTakeFirst();
  if (!found) return null;
  const row = found as AnyRow;
  // Which list a row belongs to is part of what the console needs: it selects the typed
  // form for the document, and without it the editor would have to render the raw JSON.
  let listKey: string | null = null;
  if (spec.table === 'list_items' && row.list_id) {
    const list = await db.selectFrom('lists').select(['list_key']).where('id', '=', String(row.list_id)).executeTakeFirst();
    listKey = list?.list_key ?? null;
  }
  return mapRow(spec, row, listKey);
}

export async function createRow(
  kind: ContentKind,
  input: { key: string; listKey?: string; actorId: string; legacyId?: string },
): Promise<StoreResult<ContentRow>> {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdForKey(input.listKey ?? '') : null;
  if (spec.table === 'list_items' && !listId) {
    return { ok: false, status: 400, code: 'unknown_list', issues: [{ path: 'list', message: `no list registered as "${input.listKey}"` }] };
  }

  // The identity column is unique across the whole table, including rows in the
  // Trash: their unique index does not disappear with their `deleted_at`. Checking
  // only the live rows let a new row "take" a key the database still held, and the
  // driver answered a 500 instead of the 409 this check exists to produce.
  let taken: FilterShape = db.selectFrom(spec.table).select(['id']) as unknown as FilterShape;
  taken = taken.where(spec.keyColumn, '=', input.key);
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
  // Only the WordPress import supplies one: it is how an imported row keeps the
  // post id the site's cards were built on. Nothing in the console's own request
  // shape carries it, so an editor cannot claim a WordPress post id for a new row.
  if (input.legacyId) values.legacy_id = input.legacyId;
  if (listId) {
    values.list_id = listId;
    values.draft = JSON.stringify({});
  }
  // A row joining an ordered list lands at the end of it. The column's SQL default is 0, and
  // the lists imported from WordPress were numbered from 0 too, so a result added through *Add
  // new* arrived sharing a number with the whole list — and the order the site then rendered
  // came down to whichever tie MariaDB felt like. The console never sends this field, so the
  // only writer of it inside the app is `./order.ts`; an importer that knows the order it read
  // may still PATCH a number, because then it is not a guess.
  if (positionColumn(spec)) values.position = await positionForNewItem(kind, input.listKey ?? null);

  await (db.insertInto(spec.table).values(values as never) as unknown as ExecuteShape).execute();
  const row = await getRow(kind, id);
  return row ? { ok: true, value: row } : { ok: false, status: 500, code: 'insert_failed' };
}

/**
 * One locale's field values as the columns they would be written to.
 *
 * `parseWrites()` cleans the plain fields and names the body columns; the allowlist runs
 * here, because `sanitize-html` is Node-only and `./kinds.ts` is imported by the console's
 * client bundle. Both callers go through this — the save, and the WordPress import's "does
 * this row already say that?" check — so a re-run of the import recognises the rows its
 * first pass wrote instead of rewriting all 96 of them on every run.
 */
export function planWrites(
  spec: KindSpec,
  fields: Record<string, unknown>,
  locale: ContentLocale,
  /** the list a `list_item` belongs to; it selects the typed schema the document must obey */
  listKey?: string | null,
  /** a `pages` row's route, which is how the console finds that page's document schema */
  rowKey?: string | null,
): ParseResult {
  // A row's JSON column is a *document* only when a schema describes it: a `list_items`
  // row by its list, a `pages` row by the route the site renders. Anything else keeps the
  // plain column path. The console draws the same schema (`listSchemaOfRow`), so what a
  // person edits and what the database stores are built from one definition.
  const docSchema = spec.table === 'list_items' ? listSchemaOf(listKey ?? '') : spec.table === 'pages' ? pageDocSchema(rowKey) : null;
  let written = fields;
  if (docSchema) {
    const doc = parseListDoc(docSchema, fields.data);
    if (doc.issues.length > 0) return { columns: {}, issues: doc.issues, htmlColumns: [] };
    // The one body a service can carry is authored markup, so it is filtered before it is
    // stored — the same allowlist the public render path uses. Every other list field is
    // plain text and was already cleaned by `parseListDoc()`.
    for (const stem of htmlStems(docSchema)) {
      for (const language of CONTENT_LOCALES) {
        const column = `${stem}_${language}`;
        const value = doc.doc[column];
        if (typeof value === 'string') doc.doc[column] = sanitizeRichHtml(value);
      }
    }
    written = { ...fields, data: doc.doc };
  } else if (spec.table === 'list_items' && 'data' in fields) {
    return { columns: {}, issues: [{ path: 'list', message: 'unknown field' }], htmlColumns: [] };
  }
  const parsed = parseWrites(spec, { key: '', fields: written }, locale);
  // A body is the only thing the site prints as markup, so the allowlist runs here: the
  // database ends up holding prose, never a `<script>` or an `onerror=` that a future
  // renderer, a dump or a restore could turn into an attack. `./rich.ts` is the same
  // allowlist the render path filters with, so what survives here is what reaches a visitor.
  for (const column of parsed.htmlColumns) {
    const written = parsed.columns[column];
    if (typeof written === 'string') parsed.columns[column] = sanitizeRichHtml(written);
  }
  return parsed;
}

/**
 * The uids the services list holds, trashed rows included.
 *
 * A trashed service still occupies its uid, and an offer linked to it before the row was
 * trashed is a link the owner made on purpose. Refusing that uid would make an unrelated
 * edit — fixing a price — unsaveable, so the check asks whether the row exists, not
 * whether it is live. The picker the console draws is filtered to live rows by
 * `listChoices()` in ./summary.ts, so the two do not have to agree.
 */
export async function serviceUids(): Promise<Set<string>> {
  const rows = await db
    .selectFrom('list_items')
    .innerJoin('lists', 'lists.id', 'list_items.list_id')
    .select(['list_items.uid'])
    .where('lists.list_key', '=', 'services')
    .execute();
  return new Set(rows.map((row) => row.uid));
}

/**
 * The offer's service list, checked against the services the database actually holds.
 *
 * This is the only place the relation can be verified, because only the server can ask
 * the database what exists: the console's browser bundle knows what it drew, not what a
 * colleague published a minute ago. It runs in `saveDraft()` — the one funnel every
 * console write and the WordPress import already passes through — and it canonicalises
 * before `parseWrites()` stringifies, so the column ends up holding the picked order with
 * its duplicates removed, never whatever the request happened to carry.
 */
async function validatedFields(
  spec: KindSpec,
  fields: Record<string, unknown>,
): Promise<{ fields: Record<string, unknown>; issues: { path: string; message: string }[] }> {
  if (spec.kind !== 'offer' || !('applicableServices' in fields)) return { fields, issues: [] };
  const known = await serviceUids();
  const result = canonicalizeOfferServices(fields.applicableServices, known);
  if (!result.ok) return { fields, issues: [{ path: 'applicableServices', message: result.message }] };
  return { fields: { ...fields, applicableServices: result.column }, issues: [] };
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

  const checked = await validatedFields(spec, input.fields);
  if (checked.issues.length > 0) return { ok: false, status: 400, code: 'invalid_input', issues: checked.issues };

  const parsed = planWrites(spec, checked.fields, input.locale, current.listKey, current.key);
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
