/**
 * The published copy — what a visitor reads.
 *
 * `./store.ts` answers the console's question ("what is the draft, and how does it
 * differ from what is live?"). This answers the site's: only rows whose status is
 * `published` and that are not in the Trash, and only the value a visitor is
 * allowed to see — the `pub_*` twin when the field has one, the column itself when
 * publishing never gated it (an offer's price, an article's image, a list item's
 * enabled flag).
 *
 * Working from the column map in `./kinds.ts` is the point: the site, the console
 * and the publish step read the same definition of "published", so a kind that
 * gains a field is visible here without a fourth copy of the column list.
 */
import { cache } from 'react';
import { db } from '../db';
import { readStored } from './format';
import { kindSpec, type ContentKind, type ContentLocale, type KindSpec } from './kinds';

/** A bilingual field's public copy, or `null` when neither locale was ever published. */
export type PublicValue =
  | { kind: 'bi'; ar: string; en: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'text'; value: string | null }
  | { kind: 'number'; value: number | null }
  | { kind: 'flag'; value: boolean };

export interface PublicRow {
  id: string;
  kind: ContentKind;
  /** the public identity: `slug`, `route` or the list item's `uid` */
  key: string;
  /** the WordPress id, once BK-7 imports — the site's cards key on it */
  legacyId: string | null;
  publishedAt: string | null;
  updatedAt: string;
  listKey: string | null;
  values: Record<string, PublicValue>;
}

type AnyRow = Record<string, unknown>;
interface QueryShape {
  selectAll(): QueryShape;
  select(column: string): QueryShape;
  where(column: string, op: string, value: unknown): QueryShape;
  orderBy(column: string, order?: 'asc' | 'desc'): QueryShape;
  limit(count: number): QueryShape;
  execute(): Promise<AnyRow[]>;
  executeTakeFirst(): Promise<AnyRow | undefined>;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
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

/**
 * The one value of a field a visitor sees, read off the row by the spec's column names.
 *
 * Every string goes through `readStored()`: a `plain` column is cleaned on the way out as
 * well as on the way in, because the WordPress import wrote 92 excerpts that begin `<p>`
 * and a row is only rewritten when someone edits it — the site must not wait for that to
 * stop printing markup. `html` and `source` keep theirs; a body is the one thing printed
 * as markup, and it is filtered by `sanitizeHtmlBody()` at render.
 */
function publicValue(spec: KindSpec, row: AnyRow, name: string): PublicValue | null {
  const bi = spec.bi.find((field) => field.name === name);
  if (bi) {
    // With a published twin the draft is invisible; without one the column is the
    // live value, because saving it was never gated by publishing.
    const [ar, en] = bi.pub ? [row[bi.pub.ar], row[bi.pub.en]] : [row[bi.draft.ar], row[bi.draft.en]];
    return { kind: 'bi', ar: readStored(bi.format, ar), en: readStored(bi.format, en) };
  }

  const json = spec.json.find((field) => field.name === name);
  if (json) return { kind: 'json', value: asJsonValue(row[json.pub ?? json.draft]) };

  const text = spec.text.find((field) => field.name === name);
  if (text) {
    const value = readStored(text.format, row[text.column]);
    return { kind: 'text', value: value === '' ? null : value };
  }

  const number = spec.number.find((field) => field.name === name);
  if (number) {
    const raw = row[number.column];
    return { kind: 'number', value: raw === null || raw === undefined ? null : Number(raw) };
  }

  const flag = spec.flag.find((field) => field.name === name);
  if (flag) return { kind: 'flag', value: Number(row[flag.column] ?? 0) === 1 };

  return null;
}

function fieldNames(spec: KindSpec): string[] {
  return [...spec.bi, ...spec.json, ...spec.text, ...spec.number, ...spec.flag].map((field) => field.name);
}

function toPublicRow(spec: KindSpec, row: AnyRow, listKey: string | null): PublicRow {
  const values: Record<string, PublicValue> = {};
  for (const name of fieldNames(spec)) {
    const value = publicValue(spec, row, name);
    if (value) values[name] = value;
  }
  return {
    id: asText(row.id),
    kind: spec.kind,
    key: asText(row[spec.keyColumn]),
    legacyId: row.legacy_id === null || row.legacy_id === undefined ? null : asText(row.legacy_id),
    publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : null,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : asText(row.updated_at),
    listKey,
    values,
  };
}

interface Options {
  /** the list an item kind is read from */
  listKey?: string;
}

/**
 * The `lists` row an item kind reads from; `null` when that list does not exist.
 *
 * Memoised per render: one page asks for the same list through several readers
 * (the layout reads the nav, the page reads the same list, a card asks again), and
 * before this each caller spent its own query on a column that cannot change
 * mid-render. React's `cache()` is a no-op outside a server render — tests and CLI
 * scripts still get a real read every call.
 */
const listIdOf = cache(async (listKey: string): Promise<string | null> => {
  const row = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  return row?.id ?? null;
});

/** Published and not in the Trash — the two conditions every site read shares. */
function live(query: QueryShape, listId: string | null): QueryShape {
  const scoped = listId === null ? query : query.where('list_id', '=', listId);
  return scoped.where('status', '=', 'published').where('deleted_at', 'is', null);
}

/**
 * The starting point for a kind: published, not in the Trash, scoped to its list
 * when it lives in one, ordered the way the site renders it. `null` means the list
 * does not exist, which is the same as "this kind has nothing published".
 */
async function base(kind: ContentKind, listKey: string | undefined): Promise<{ spec: KindSpec; query: QueryShape } | null> {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdOf(listKey ?? '') : null;
  if (spec.table === 'list_items' && !listId) return null;
  const query = live(db.selectFrom(spec.table).selectAll() as unknown as QueryShape, listId);
  return {
    spec,
    query:
      spec.table === 'list_items'
        ? query.orderBy('position', 'asc').orderBy('uid', 'asc')
        : spec.table === 'offers'
          ? query.orderBy('position', 'asc').orderBy('slug', 'asc')
          : spec.table === 'pages'
            ? query.orderBy('route', 'asc')
            // Both directions agree so `articles_public` can be walked backwards:
            // a mixed `published_at DESC, slug ASC` cannot use the index and sorts.
            : query.orderBy('published_at', 'desc').orderBy('slug', 'desc'),
  };
}

/**
 * The queries below take strings, not the `Options` object, because `cache()` keys on
 * argument identity: `{ listKey: 'nav' }` is a new object at every call site and would
 * miss on every call. The exported functions keep their shape and normalise first.
 */
const rowsOf = cache(async (kind: ContentKind, listKey: string): Promise<PublicRow[]> => {
  const started = await base(kind, listKey || undefined);
  if (!started) return [];
  const rows = (await started.query.execute()) as AnyRow[];
  return rows.map((row) => toPublicRow(started.spec, row, listKey || null));
});

/** Every published, non-trashed row of a kind, in the order the site renders them. */
export async function publicRows(kind: ContentKind, options: Options = {}): Promise<PublicRow[]> {
  return rowsOf(kind, options.listKey ?? '');
}

const rowOf = cache(async (kind: ContentKind, listKey: string, key: string): Promise<PublicRow | null> => {
  const started = await base(kind, listKey || undefined);
  if (!started) return null;
  const bare = key.replace(/^\/+/, '');
  const candidates = [...new Set([key, bare, `/${bare}`])];
  const rows = (await started.query.where(started.spec.keyColumn, 'in', candidates).execute()) as AnyRow[];
  const row = rows.find((r) => String(r[started.spec.keyColumn]) === key) ?? rows[0];
  return row ? toPublicRow(started.spec, row, listKey || null) : null;
});

/**
 * One published row by its public key. A page's `route` is stored with or without
 * its leading slash depending on who wrote it, so both spellings are candidates and
 * the exact one wins.
 */
export async function publicRow(kind: ContentKind, key: string, options: Options = {}): Promise<PublicRow | null> {
  return rowOf(kind, options.listKey ?? '', key);
}

const anyPublished = cache(async (kind: ContentKind, listKey: string): Promise<boolean> => {
  const spec = kindSpec(kind);
  const listId = spec.table === 'list_items' ? await listIdOf(listKey) : null;
  if (spec.table === 'list_items' && !listId) return false;
  const query = live(db.selectFrom(spec.table).select('id') as unknown as QueryShape, listId);
  return Boolean(await query.limit(1).executeTakeFirst());
});

/**
 * Whether the database holds anything published of this kind. The site's read path
 * asks this once per kind, so a kind is served wholly from the database or wholly
 * from the fallback — never a merge, and never a stale fallback for a row that
 * genuinely does not exist.
 */
export async function hasPublished(kind: ContentKind, options: Options = {}): Promise<boolean> {
  return anyPublished(kind, options.listKey ?? '');
}

/** The two locales a published row actually carries text in. */
export function localesOf(row: PublicRow, name: string): ContentLocale[] {
  const value = row.values[name];
  if (!value || value.kind !== 'bi') return [];
  return (['ar', 'en'] as const).filter((locale) => value[locale].trim().length > 0);
}
