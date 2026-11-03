/**
 * The console's list read: one page of rows, already filtered, searched and ordered.
 *
 * `getRow` in ./store.ts returns a whole document, which is right for an editor and
 * wrong for a list — the articles screen used to pull all 92 `content_ar` bodies to
 * draw 92 rows of titles. This reads the columns a row is *named* by, lets the server
 * decide which rows survive the filter, and hands back the one bit per locale that
 * says whether a draft outran its published copy. The `pending` comparison still reads
 * the body columns, but it does that inside MariaDB and returns a boolean instead of
 * the text, which is the trade this file exists to make.
 *
 * Three rules keep it honest:
 *   - every column name comes from `./kinds.ts`, never from the request;
 *   - every value from the request is a bind parameter, including a `LIKE` pattern and
 *     a JSON path;
 *   - a list item's columns are read off its own list (see `sampleListSchema`), because
 *     each list defines its keys in `lists.item_schema`-style JSON, and the site has to
 *     show what the list actually holds.
 */
import { sql, type AliasedRawBuilder, type RawBuilder, type SqlBool } from 'kysely';
import { db } from '../db';
import { likeOf } from '../db/like';
import { readStored, type FieldFormat } from './format';
import { CONTENT_LOCALES, kindSpec, type ContentKind, type ContentLocale, type KindSpec } from './kinds';
import { listDocTitle, listSchemaOf, needsOtherPhoto, type ListSchema as TypedList } from './list-schema';
import { resultStoryPointer } from './list-docs';
import { serviceWarningsOfDoc, type ServiceWarning } from './service-doc';
import { listIdForKey } from './store';
import type { ListFilter, ListSort, ListView } from './list-view';

/** One row as the list shows it: enough to name it, not enough to edit it. */
export interface ListSummary {
  id: string;
  kind: ContentKind;
  key: string;
  titleAr: string;
  titleEn: string;
  status: string;
  version: number;
  trashed: boolean;
  /** the draft differs from the published copy in that language */
  pendingAr: boolean;
  pendingEn: boolean;
  updatedAt: string;
  publishedAt: string | null;
  /** the first authored image, so a list can show what the card will show */
  image: string | null;
  /** a before/after case holding one picture and not the other, so the list can name what is owed */
  needsPhoto: boolean;
  /** a service row whose page a visitor would find thin, named by what it is missing */
  warnings: ServiceWarning[];
  /** the kind's own columns, keyed by field name: a price, a flag, a list item's key */
  cells: Record<string, string | number | boolean | null>;
}

export interface ListPage {
  rows: ListSummary[];
  total: number;
  /** the page actually shown, after clamping a page past the end back to the last one */
  page: number;
  pages: number;
  per: number;
  /** the column keys `cells` carries, in the order the table should print them */
  columns: string[];
  /** whether this kind's rows carry an image worth a thumbnail column */
  hasImages: boolean;
}

/** What a list read is asked for: the view, plus the scope the guard already checked. */
export interface ListQuery {
  view: ListView;
  /** the list whose items to read; required for `list_item`, ignored for the rest */
  listKey?: string | null;
  trash: boolean;
  /** the language the console is drawn in, which decides what a title sorts by */
  locale: ContentLocale;
}

const SAMPLE_LIMIT = 200;
const CELL_KEYS = 8;

/** The keys a list's items carry, and which of them names an item in each language. */
export interface SampledList {
  columns: string[];
  labelKeys: Partial<Record<ContentLocale, string>>;
  /** a sampled item holds something that reads as an image */
  hasImages: boolean;
}

function looksLikeImage(value: string): boolean {
  const text = value.trim();
  return /^(https?:\/\/|\/|data:image\/)/i.test(text) || /\.(avif|webp|jpe?g|png|gif|svg)(\?|#|$)/i.test(text);
}

/**
 * The first image a value carries.
 *
 * Offers store `images` as an array of `{src, alt}` (or, after an editor's edit, as an
 * object with an `ar` and an `en` array); a service or a result story stores one `image`
 * string. The console needs one URL to draw a thumbnail, and it must not print a title
 * where a picture belongs — so an unknown string only counts when it looks like a path.
 */
export function firstImage(value: unknown): string | null {
  if (typeof value === 'string') return looksLikeImage(value) ? value.trim() : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item);
      if (found) return found;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['src', 'url', 'image', 'images', 'photo', 'before', 'after', 'logo']) {
    const found = firstImage(record[key]);
    if (found) return found;
  }
  return null;
}

/** The document fields that may hold a picture, in the order a thumbnail should follow. */
const IMAGE_KEYS = ['image', 'images', 'photo', 'thumbnail', 'logo', 'before', 'after'];

function imageOfDocument(spec: KindSpec, row: Record<string, unknown>): string | null {
  const text = spec.text.find((field) => field.name === 'image');
  const json = spec.json.find((field) => field.name === 'images');
  if (text) return firstImage(row[`image_${text.name}`]);
  if (json) return firstImage(row[`image_${json.name}`]);
  return null;
}

function imageOfItem(doc: Record<string, unknown>): string | null {
  for (const key of IMAGE_KEYS) {
    const found = firstImage(doc[key]);
    if (found) return found;
  }
  for (const [key, value] of Object.entries(doc)) {
    if (/image|photo|thumb|logo|before|after/i.test(key)) {
      const found = firstImage(value);
      if (found) return found;
    }
  }
  return null;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The bilingual field a row is titled by — the same one the palette searches. */
function titleField(spec: KindSpec) {
  return spec.bi.find((field) => field.name === 'title' || field.name === 'name');
}

function flagColumn(spec: KindSpec, name: string): string | null {
  return spec.flag.find((field) => field.name === name)?.column ?? null;
}

function positionColumn(spec: KindSpec): string | null {
  const authored = spec.number.find((field) => field.name === 'position');
  return authored ? authored.column : spec.table === 'list_items' ? 'position' : null;
}

/**
 * The path a list item's key is read at.
 *
 * A key that is not a bare word goes in quotes, because MariaDB rejects `$.name ar`
 * and accepts `$."name ar"` — and the keys come from imported documents, so a space is
 * a real possibility rather than a hypothesis.
 */
export function jsonPathOf(key: string): string {
  return /^[\w-]+$/.test(key) ? `$.${key}` : `$."${key.replace(/"/g, '')}"`;
}

/** A draft that differs from its published twin, in one language. `NULL` counts as different. */
function pendingFor(spec: KindSpec, locale: ContentLocale): RawBuilder<SqlBool> {
  const parts: RawBuilder<SqlBool>[] = [];
  for (const field of spec.bi) {
    if (field.pub) parts.push(sql<SqlBool>`NOT (${sql.ref(field.draft[locale])} <=> ${sql.ref(field.pub[locale])})`);
  }
  for (const field of spec.json) {
    if (field.pub) parts.push(sql<SqlBool>`NOT (${sql.ref(field.draft)} <=> ${sql.ref(field.pub)})`);
  }
  return parts.length > 0 ? sql<SqlBool>`${sql.join(parts, sql` OR `)}` : sql<SqlBool>`0`;
}

function scalarValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value as string | number | boolean | null;
  if (typeof value === 'string') return value;
  return null;
}

/**
 * The keys one list's items actually carry.
 *
 * Sampled from the list's own rows rather than trusted from `lists.item_schema`, which
 * the seeder writes as `{}` and nothing else fills in yet — and bounded by the size of
 * that list (a list is branches, specialists, FAQ: dozens of rows, not the 92 articles).
 * A key joins the columns when any sampled item holds a scalar under it; the label per
 * language is the key that carries the most text, name/title/question/label first.
 */
export async function sampleListSchema(listKey: string): Promise<SampledList> {
  const listId = await listIdForKey(listKey);
  if (!listId) return { columns: [], labelKeys: {}, hasImages: false };

  const docs = await sql<{ draft: unknown }>`
    SELECT ${sql.ref('draft')} AS draft
    FROM ${sql.ref('list_items')}
    WHERE ${sql.ref('list_id')} = ${listId} AND ${sql.ref('deleted_at')} IS NULL
    ORDER BY ${sql.ref('position')} ASC
    LIMIT ${SAMPLE_LIMIT}
  `.execute(db);

  const seen: string[] = [];
  let hasImages = false;
  const labelCounts: Record<ContentLocale, Map<string, number>> = { ar: new Map(), en: new Map() };
  for (const row of docs.rows) {
    const doc = typeof row.draft === 'string' ? (JSON.parse(row.draft) as unknown) : row.draft;
    if (doc === null || typeof doc !== 'object') continue;
    if (!hasImages && imageOfItem(doc as Record<string, unknown>)) hasImages = true;
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      const scalar = scalarValue(value);
      if (scalar === null || (typeof scalar === 'string' && !scalar.trim())) continue;
      if (!seen.includes(key)) seen.push(key);
      if (typeof scalar === 'string') {
        for (const locale of CONTENT_LOCALES) {
          if (key === `name_${locale}` || key === `title_${locale}` || key === `question_${locale}` || key === `label_${locale}` || key.endsWith(`_${locale}`)) {
            labelCounts[locale].set(key, (labelCounts[locale].get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  /**
   * `name`/`title`/`question`/`label` win, and anything else is last — not first.
   * A `findIndex` that answers `-1` for "not one of those" sorts ahead of the whole list,
   * which is how a branch document holding both `name_ar` and `city_ar` got titled by its
   * city and printed its real name in an extra column.
   */
  const NAMED = ['name', 'title', 'question', 'label'];
  const rankOf = (key: string): number => {
    const index = NAMED.findIndex((stem) => key.startsWith(stem));
    return index === -1 ? NAMED.length : index;
  };

  const preferred = (locale: ContentLocale): string | undefined => {
    const ranked = [...labelCounts[locale].entries()].sort((a, b) => {
      const byName = rankOf(a[0]) - rankOf(b[0]);
      return byName !== 0 ? byName : b[1] - a[1];
    });
    return ranked[0]?.[0];
  };

  const labelKeys: Partial<Record<ContentLocale, string>> = {};
  for (const locale of CONTENT_LOCALES) {
    const key = preferred(locale);
    if (key) labelKeys[locale] = key;
  }
  const labels = Object.values(labelKeys);
  return { columns: seen.filter((key) => !labels.includes(key)).slice(0, CELL_KEYS), labelKeys, hasImages };
}

/** The number and flag columns a document kind prints beside its title. */
function documentColumns(spec: KindSpec): string[] {
  return [...spec.number.map((field) => field.name), ...spec.flag.map((field) => field.name)];
}

const FILTER_STATUS: Partial<Record<ListFilter, string>> = { draft: 'draft', published: 'published', changed: 'changed' };

interface Shape {
  select(expression: Selectable): Shape;
  where(condition: RawBuilder<SqlBool>): Shape;
  orderBy(expression: RawBuilder<unknown>, direction?: 'asc' | 'desc'): Shape;
  limit(count: number): Shape;
  offset(count: number): Shape;
  execute(): Promise<Record<string, unknown>[]>;
  executeTakeFirst(): Promise<Record<string, unknown> | undefined>;
}

/** A column to read, aliased or not — Kysely types the alias, and this shape keeps both. */
type Selectable = RawBuilder<unknown> | AliasedRawBuilder<unknown, string>;

function from(table: KindSpec['table']): Shape {
  return db.selectFrom(table) as unknown as Shape;
}

/** The row's own title in each language, for a list item read out of its JSON document. */
function labelsOf(doc: Record<string, unknown>, schema: SampledList): Record<ContentLocale, string> {
  const out: Record<ContentLocale, string> = { ar: '', en: '' };
  for (const locale of CONTENT_LOCALES) {
    const key = schema.labelKeys[locale];
    const value = key ? scalarValue(doc[key]) : null;
    out[locale] = typeof value === 'string' ? value.trim() : value === null ? '' : String(value);
  }
  return out;
}

/** A list item's name in each language: the typed form's title first, the sampled key after. */
function docTitles(typed: TypedList | null, sampled: SampledList, doc: Record<string, unknown>): Record<ContentLocale, string> {
  if (!typed) return labelsOf(doc, sampled);
  return { ar: listDocTitle(typed, doc, 'ar'), en: listDocTitle(typed, doc, 'en') };
}

function cellsOf(spec: KindSpec, row: Record<string, unknown>, columns: string[]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (spec.table === 'list_items') {
    const doc = typeof row.doc === 'string' ? (JSON.parse(row.doc as string) as unknown) : row.doc;
    if (doc !== null && typeof doc === 'object') {
      const record = doc as Record<string, unknown>;
      for (const key of columns) out[key] = scalarValue(record[key]);
    }
  }
  // A list item's printed columns are sampled from its own documents, but its number and flag
  // columns are read the way a document kind reads them: an item's order is a column, not a key
  // inside the JSON, and the Order cell has to print the number the move just wrote.
  for (const field of spec.number) out[field.name] = row[`cell_${field.name}`] === null || row[`cell_${field.name}`] === undefined ? null : asText(row[`cell_${field.name}`]);
  for (const field of spec.flag) out[field.name] = Number(row[`cell_${field.name}`] ?? 0) === 1;
  return out;
}

/**
 * One page of a kind's rows, filtered, searched, ordered and counted on the server.
 *
 * The `q` term matches the identity column and the title in both languages for a
 * document kind; for a list item it matches the JSON paths the list's own keys name —
 * which is what the palette deliberately refused to do across every list at once.
 */
export async function listSummaries(kind: ContentKind, query: ListQuery): Promise<ListPage> {
  const spec = kindSpec(kind);
  const { view } = query;
  const needle = view.q ? likeOf(view.q) : null;

  const titled = spec.table !== 'list_items' ? titleField(spec) : undefined;
  // Two schemas answer two different questions. The typed one (./list-schema.ts) names
  // the row the way the editor does, and the sampled one lists whatever extra keys a
  // list's documents happen to carry — an imported list the console has no form for
  // still needs a title and a few columns. The typed one wins when both exist.
  const typed = spec.table === 'list_items' ? listSchemaOf(query.listKey ?? '') : null;
  const sampled = spec.table === 'list_items' ? await sampleListSchema(query.listKey ?? '') : null;
  const columns = spec.table === 'list_items' ? (sampled?.columns ?? []) : documentColumns(spec);
  const imageText = spec.text.find((field) => field.name === 'image');
  const imageJson = spec.json.find((field) => field.name === 'images');
  const hasImages = spec.table === 'list_items' ? (sampled?.hasImages ?? false) : Boolean(imageText || imageJson);

  let listId: string | null = null;
  if (spec.table === 'list_items') {
    listId = await listIdForKey(query.listKey ?? '');
    if (!listId) return { rows: [], total: 0, page: 1, pages: 1, per: view.per, columns, hasImages };
  }

  const where: RawBuilder<SqlBool>[] = [
    sql<SqlBool>`${sql.ref('deleted_at')} IS ${query.trash ? sql`NOT NULL` : sql`NULL`}`,
  ];
  if (listId) where.push(sql<SqlBool>`${sql.ref('list_id')} = ${listId}`);

  const status = FILTER_STATUS[view.filter];
  if (status) where.push(sql<SqlBool>`${sql.ref('status')} = ${status}`);
  if (view.filter === 'pending') {
    where.push(
      spec.table === 'list_items'
        ? pendingFor(spec, 'ar')
        : sql<SqlBool>`(${sql.join([pendingFor(spec, 'ar'), pendingFor(spec, 'en')], sql` OR `)})`,
    );
  }
  if (view.filter === 'off') {
    const enabled = flagColumn(spec, 'enabled');
    if (enabled) where.push(sql<SqlBool>`${sql.ref(enabled)} = ${0}`);
  }

  if (needle && spec.table === 'list_items') {
    const paths = [...new Set([...(sampled?.columns ?? []), ...Object.values(sampled?.labelKeys ?? {})])].filter(Boolean) as string[];
    const parts: RawBuilder<SqlBool>[] = [sql<SqlBool>`${sql.ref(spec.keyColumn)} LIKE ${needle}`];
    for (const path of paths) {
      parts.push(sql<SqlBool>`JSON_UNQUOTE(JSON_EXTRACT(${sql.ref('draft')}, ${jsonPathOf(path)})) LIKE ${needle}`);
    }
    where.push(sql<SqlBool>`(${sql.join(parts, sql` OR `)})`);
  } else if (needle && titled) {
    where.push(
      sql<SqlBool>`(${sql.ref(spec.keyColumn)} LIKE ${needle} OR ${sql.ref(titled.draft.ar)} LIKE ${needle} OR ${sql.ref(titled.draft.en)} LIKE ${needle})`,
    );
  }

  const sortOf = (sort: ListSort): RawBuilder<unknown> => {
    if (sort === 'position') return sql.ref(positionColumn(spec) ?? spec.keyColumn);
    if (sort === 'key') return sql.ref(spec.keyColumn);
    if (sort === 'status') return sql.ref('status');
    if (sort === 'updated') return sql.ref('updated_at');
    if (sort === 'published') return sql.ref('published_at');
    if (spec.table === 'list_items') {
      const key = sampled?.labelKeys[query.locale] ?? sampled?.labelKeys.ar ?? sampled?.labelKeys.en;
      return key ? sql`JSON_UNQUOTE(JSON_EXTRACT(${sql.ref('draft')}, ${jsonPathOf(key)}))` : sql.ref(spec.keyColumn);
    }
    return sql.ref(titled ? titled.draft[query.locale] : spec.keyColumn);
  };
  // Every order needs a stable tie: two rows updated in the same second must not swap
  // between page one and page two. When the sort *is* the order column the tie has to be
  // something else — the lists the WordPress import left all at `0` otherwise read in an
  // order MariaDB picks for itself, and the same two rows trade places between two loads.
  const tie = sql.ref(view.sort === 'position' ? spec.keyColumn : spec.table === 'list_items' ? 'position' : spec.keyColumn);

  const selects: Selectable[] = [
    sql<string>`${sql.ref('id')}`.as('id'),
    sql<string>`${sql.ref(spec.keyColumn)}`.as('row_key'),
    sql<string>`${sql.ref('status')}`.as('status'),
    sql<number>`${sql.ref('version')}`.as('version'),
    sql<string>`${sql.ref('updated_at')}`.as('updated_at'),
    sql<string | null>`${sql.ref('published_at')}`.as('published_at'),
    sql<SqlBool>`${pendingFor(spec, 'ar')}`.as('pending_ar'),
    sql<SqlBool>`${pendingFor(spec, 'en')}`.as('pending_en'),
  ];
  if (spec.table === 'list_items') {
    selects.push(sql<unknown>`${sql.ref('draft')}`.as('doc'));
  } else if (titled) {
    selects.push(sql<string>`${sql.ref(titled.draft.ar)}`.as('title_ar'), sql<string>`${sql.ref(titled.draft.en)}`.as('title_en'));
  } else {
    selects.push(sql<string>`''`.as('title_ar'), sql<string>`''`.as('title_en'));
  }
  for (const field of spec.number) selects.push(sql<unknown>`${sql.ref(field.column)}`.as(`cell_${field.name}`));
  for (const field of spec.flag) selects.push(sql<unknown>`${sql.ref(field.column)}`.as(`cell_${field.name}`));
  if (imageText) selects.push(sql<unknown>`${sql.ref(imageText.column)}`.as(`image_${imageText.name}`));
  if (imageJson) selects.push(sql<unknown>`${sql.ref(imageJson.draft)}`.as(`image_${imageJson.name}`));

  const counted = await from(spec.table)
    .select(sql<number>`COUNT(*)`.as('total'))
    .where(sql<SqlBool>`(${sql.join(where, sql` AND `)})`)
    .executeTakeFirst();
  const total = Number(counted?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / view.per));
  const page = Math.min(Math.max(1, view.page), pages);

  let rowsQuery = from(spec.table)
    .where(sql<SqlBool>`(${sql.join(where, sql` AND `)})`)
    .orderBy(sortOf(view.sort), view.dir)
    .orderBy(tie, 'asc')
    .limit(view.per)
    .offset((page - 1) * view.per);
  for (const expression of selects) rowsQuery = rowsQuery.select(expression);

  const raw = await rowsQuery.execute();
  const titleFormat: FieldFormat = titled?.format ?? 'plain';
  const rows: ListSummary[] = raw.map((row) => {
    const doc = spec.table === 'list_items' ? parseDoc(row.doc) : null;
    // The title column is read through its format, so the list shows the same sentence
    // the editor will load: an imported `<p>` in front of a headline is noise twice over.
    const titles = doc
      ? docTitles(typed, sampled as SampledList, doc)
      : { ar: readStored(titleFormat, row.title_ar), en: readStored(titleFormat, row.title_en) };
    return {
      id: asText(row.id),
      kind,
      key: asText(row.row_key),
      titleAr: titles.ar,
      titleEn: titles.en,
      status: asText(row.status),
      version: Number(row.version ?? 1),
      trashed: query.trash,
      pendingAr: truthy(row.pending_ar),
      pendingEn: truthy(row.pending_en),
      updatedAt: toIso(row.updated_at),
      publishedAt: row.published_at === null || row.published_at === undefined ? null : toIso(row.published_at),
      image: doc ? imageOfItem(doc) : imageOfDocument(spec, row),
      // A row that uploaded one half owes the other, and the list says so: the site will not
      // draw a comparison out of one picture, and an owner staring at a card with no pair has
      // no way to know which of the two slots is the empty one.
      needsPhoto: doc ? needsOtherPhoto(asText(doc.before), asText(doc.after)) : false,
      // A service row is a whole page, so the list names the four gaps a visitor would feel
      // — the sentence under the name, the picture the card is cut from, the questions, the
      // button that books. They are marks, not gates: a flagged row saves and publishes, and
      // an old row imported before these fields existed is editable exactly like a new one.
      warnings: doc && query.listKey === 'services' ? serviceWarningsOfDoc(doc, asText(row.row_key)) : [],
      cells: cellsOf(spec, row, columns),
    };
  });

  // A result story has no name of its own on the site: it *is* an article. When nobody typed
  // a headline, that article's title is the real name — printing the raw uid ("1182") in the
  // list was the defect this fixes. A row the console created names its article by slug, so
  // the pointer, not the key, is what the lookup is asked for.
  if (query.listKey === 'results') {
    const pointerOf = new Map(raw.map((row) => {
      const key = asText(row.row_key);
      return [key, resultStoryPointer(parseDoc(row.doc) ?? {}, key) || key] as [string, string];
    }));
    const unnamed = rows.filter((row) => !row.titleAr || !row.titleEn);
    if (unnamed.length > 0) {
      const wanted = unnamed.map((row) => pointerOf.get(row.key) ?? row.key);
      const linked = await articleTitles(wanted);
      for (const row of unnamed) {
        const title = linked.get(pointerOf.get(row.key) ?? row.key);
        if (!title) continue;
        if (!row.titleAr) row.titleAr = title.ar;
        if (!row.titleEn) row.titleEn = title.en;
      }
    }
  }

  return { rows, total, page, pages, per: view.per, columns, hasImages };
}

/**
 * The articles a result pointer names, keyed by that pointer.
 *
 * One query answers both spellings because a slug is never all digits: the imported rows are
 * keyed by the WordPress post id and the console's rows by the `story` field's slug.
 */
async function articleTitles(pointers: readonly string[]): Promise<Map<string, Record<ContentLocale, string>>> {
  const keys = [...new Set(pointers.filter(Boolean))];
  if (keys.length === 0) return new Map();
  const wanted = new Set(keys);
  const ids = keys.filter((key) => /^\d+$/.test(key));
  const slugs = keys.filter((key) => !/^\d+$/.test(key));
  const where: RawBuilder<SqlBool>[] = [];
  if (ids.length > 0) where.push(sql<SqlBool>`${sql.ref('legacy_id')} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  if (slugs.length > 0) where.push(sql<SqlBool>`${sql.ref('slug')} IN (${sql.join(slugs.map((name) => sql`${name}`), sql`, `)})`);
  const found = await sql<{ slug: string; legacy_id: string | null; title_ar: string | null; title_en: string | null }>`
    SELECT ${sql.ref('slug')} AS slug, ${sql.ref('legacy_id')} AS legacy_id,
      ${sql.ref('title_ar')} AS title_ar, ${sql.ref('title_en')} AS title_en
    FROM ${sql.ref('articles')}
    WHERE ${sql.ref('deleted_at')} IS NULL AND (${sql.join(where, sql` OR `)})
  `.execute(db);
  const titles = new Map<string, Record<ContentLocale, string>>();
  for (const row of found.rows) {
    const title = { ar: readStored('plain', row.title_ar), en: readStored('plain', row.title_en) };
    const legacy = row.legacy_id === null || row.legacy_id === undefined ? '' : asText(row.legacy_id);
    if (wanted.has(legacy)) titles.set(legacy, title);
    if (wanted.has(asText(row.slug))) titles.set(asText(row.slug), title);
  }
  return titles;
}

/** The title of the article a result story points at, for a heading with no typed title. */
export async function linkedArticleTitle(pointer: string, locale: ContentLocale): Promise<string> {
  const title = (await articleTitles([pointer])).get(pointer);
  return title ? title[locale] || title[locale === 'ar' ? 'en' : 'ar'] : '';
}

/** One row a `refs` field may point at: the item key the site stores, and its name. */
export interface ListChoice {
  key: string;
  label: string;
}

/**
 * A list's items as selectable names, in document order.
 *
 * The editor's `refs` control used to ask for raw keys — a person had to know that the
 * New Cairo clinic is `new-cairo`. Here every item arrives with the title the list screen
 * shows, and the key rides along so the site still reads the same document shape.
 */
export async function listChoices(listKey: string, locale: ContentLocale): Promise<ListChoice[]> {
  const listId = await listIdForKey(listKey);
  if (!listId) return [];
  const typed = listSchemaOf(listKey);
  const sampled = typed ? null : await sampleListSchema(listKey);
  const found = await sql<{ uid: string; draft: unknown }>`
    SELECT ${sql.ref('uid')} AS uid, ${sql.ref('draft')} AS draft
    FROM ${sql.ref('list_items')}
    WHERE ${sql.ref('list_id')} = ${listId} AND ${sql.ref('deleted_at')} IS NULL
    ORDER BY ${sql.ref('position')} ASC, ${sql.ref('uid')} ASC
  `.execute(db);
  return found.rows.map((row) => {
    const doc = parseDoc(row.draft) ?? {};
    const key = asText(row.uid);
    const label = typed ? listDocTitle(typed, doc, locale) : sampled ? labelsOf(doc, sampled)[locale] : '';
    return { key, label: label || key };
  });
}

/**
 * The published offers a service may point at, named by the slug the site resolves.
 *
 * The relation stores the offer's slug, not a copy of its price or title: an owner
 * changes the offer once and every service showing it changes too. Only published,
 * enabled offers are offered, because a service page cannot show what the offers page
 * itself hides.
 */
export async function offerChoices(locale: ContentLocale): Promise<ListChoice[]> {
  const found = await sql<{ slug: string; name_ar: string | null; name_en: string | null }>`
    SELECT ${sql.ref('slug')} AS slug, ${sql.ref('name_ar')} AS name_ar, ${sql.ref('name_en')} AS name_en
    FROM ${sql.ref('offers')}
    WHERE ${sql.ref('deleted_at')} IS NULL AND ${sql.ref('status')} = 'published' AND ${sql.ref('enabled')} = 1
    ORDER BY ${sql.ref('position')} ASC, ${sql.ref('slug')} ASC
  `.execute(db);
  return found.rows.map((row) => {
    const slug = asText(row.slug);
    const ar = readStored('plain', row.name_ar);
    const en = readStored('plain', row.name_en);
    const title = locale === 'ar' ? ar || en : en || ar;
    return { key: slug, label: title || slug };
  });
}

/**
 * The journal's articles as one-value choices, for a result story that has to name one.
 *
 * A result card *is* an article on the site, so the console cannot ask for an identifier —
 * the WordPress post id is what the imported rows carry, and a row added in the console has
 * no number at all. The slug is the one value that names the same story in both cases, and
 * the title is the only thing a business owner can recognise.
 */
export async function articleChoices(locale: ContentLocale): Promise<ListChoice[]> {
  const found = await sql<{ slug: string; title_ar: string | null; title_en: string | null }>`
    SELECT ${sql.ref('slug')} AS slug, ${sql.ref('title_ar')} AS title_ar, ${sql.ref('title_en')} AS title_en
    FROM ${sql.ref('articles')}
    WHERE ${sql.ref('deleted_at')} IS NULL
    ORDER BY ${sql.ref('published_at')} DESC, ${sql.ref('slug')} ASC
  `.execute(db);
  return found.rows.map((row) => {
    const slug = asText(row.slug);
    const ar = readStored('plain', row.title_ar);
    const en = readStored('plain', row.title_en);
    const title = locale === 'ar' ? ar || en : en || ar;
    return { key: slug, label: title || slug };
  });
}

function parseDoc(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    if (typeof value !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return value as Record<string, unknown>;
}

/** MariaDB answers a boolean expression as 0/1; a driver on another path gives true. */
function truthy(value: unknown): boolean {
  return value === true || Number(value ?? 0) === 1;
}
