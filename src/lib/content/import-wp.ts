/**
 * Bringing the WordPress content into the console's tables (BK-7.2, extended by 7.5).
 *
 * The source is the frozen snapshot in `data/wp/*.json` — the same files the site's
 * fallback rung reads — so an import is reproducible offline and never asks the
 * client's production WordPress for anything. English rows are authoritative for
 * the list, the slugs and the prices; Arabic rows carrying the same WordPress id
 * supply the other locale, which is how TranslatePress keeps one article across the
 * two subsites.
 *
 * Four plans, not three: the articles, offers and pages 7.2 imported, plus the result
 * stories' membership. A story *is* an article, so its row copies no text — it is a
 * `results` list item naming the post id, which is how `/results` stops deciding what
 * to show from a file the console cannot edit.
 *
 * Three rules make the result editable rather than merely stored:
 *   - the row keeps its WordPress id in `legacy_id`, because the site's cards key on
 *     it and an API consumer must not mistake a locally written article for one;
 *   - a publish is stamped with the article's own date (`publishRow`'s `at`), so
 *     the journal keeps the order its readers saw instead of re-dating 92 posts to
 *     the day the import ran;
 *   - every value goes through the console's own store, so an imported row is a
 *     normal draft-plus-published row with a revision, and an editor can open it and
 *     save it like any other.
 *
 * Re-running is safe: a row whose draft already matches the snapshot is reported
 * `unchanged` and nothing is written, so a second pass adds no revisions.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { minorToDecimal } from '../wp/mappers';
import { mirrorSrc } from '../wp/mirror';
import { readSnapshot, snapshotMedia, snapshotMeta, snapshotResultStories } from '../wp/snapshot';
import { bestImageSrc } from '../wp/sanitize';
import type { WCStoreProduct, WPTerm } from '../wp/types';
import { kindSpec, parseWrites, type ColumnWrites, type ContentKind, type ContentLocale, type KindSpec } from './kinds';
import { publishRow } from './publish';
import { createRow, getRow, listIdForKey, planWrites, saveDraft, type ContentRow } from './store';

/** Every kind the snapshot can speak for, list items included since 7.5. */
export type ImportKind = ContentKind;

export interface ImportDoc {
  kind: ImportKind;
  /** the row's public identity: an article slug, an offer slug, a page route, a list item uid */
  key: string;
  legacyId: string;
  /** when WordPress published it, so the site keeps showing the same date */
  at: Date;
  /** a list item belongs to one of the seeded lists; no other kind carries it */
  listKey?: string;
  /** one article's category, as the snapshot's term slug; resolved to a row id on write */
  categorySlug?: string;
  fields: Partial<Record<ContentLocale, Record<string, unknown>>>;
}

export interface CategoryDoc {
  slug: string;
  nameAr: string;
  nameEn: string;
  position: number;
}

export interface ImportReport {
  dryRun: boolean;
  database: string;
  categories: { created: number; existed: number };
  rows: { created: number; updated: number; unchanged: number };
  skipped: { kind: string; key: string; why: string }[];
}

/**
 * The account every imported revision is attributed to. It is not a login — no
 * password, no row in `users` — but the console's history shows its email, so an
 * operator can tell the WordPress import apart from a colleague's edit.
 */
export const IMPORT_ACTOR = { id: '00000000-0000-4000-8000-000000000007', email: 'wp-import@shamah.local' };

/** The day the snapshot was taken: the only publish date a WooCommerce product has. */
function snapshotPublishedAt(): Date {
  return asUtc(snapshotMeta()?.generatedAt ?? new Date().toISOString());
}

interface SnapshotPost {
  id: number;
  slug: string;
  date: string;
  modified?: string;
  title: { rendered: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
  featured_media?: number;
}

function rows<T>(name: Parameters<typeof readSnapshot>[0], lang: ContentLocale): T[] {
  return readSnapshot<T[]>(name, lang) ?? [];
}

function byId<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((row) => [row.id, row]));
}

/** Nothing in a string is invented here; an absent value becomes empty text. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * WordPress prints naive site-local timestamps. Reading them as UTC keeps the
 * clock reading the site displayed — 14:00 stays 14:00 — instead of sliding every
 * article by whatever offset the importing machine happens to have.
 */
function asUtc(stamp: string): Date {
  const naive = /(?:Z|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp}Z`;
  const at = new Date(naive);
  return Number.isNaN(at.getTime()) ? new Date() : at;
}

/**
 * A WooCommerce slug is percent-encoded Arabic; the site's route carries the decoded
 * form, and the snapshot reader matched either spelling. Keeping the decoded one is
 * what lets the database rung answer both, since the seam decodes what it is asked
 * for and then compares it to the row's key.
 */
function decodedKey(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export function planCategories(): CategoryDoc[] {
  const en = rows<WPTerm>('categories', 'en');
  const ar = byId(rows<WPTerm>('categories', 'ar'));
  return en.map((term, index) => ({
    slug: term.slug,
    nameAr: ar.get(term.id)?.name ?? term.name,
    nameEn: term.name,
    position: index,
  }));
}

export function planArticles(): ImportDoc[] {
  const en = rows<SnapshotPost>('posts-list', 'en');
  const ar = byId(rows<SnapshotPost>('posts-list', 'ar'));
  // The list rows carry no body; the detail dump holds the rendered content.
  const enBody = byId(rows<SnapshotPost>('posts', 'en'));
  const arBody = byId(rows<SnapshotPost>('posts', 'ar'));
  const termsEn = byId(rows<WPTerm>('categories', 'en'));
  const termsAr = byId(rows<WPTerm>('categories', 'ar'));
  const media = snapshotMedia();

  return en.map((post) => {
    const twin = ar.get(post.id);
    const term = (post.categories ?? []).map((id) => termsEn.get(id)).find(Boolean) ?? (post.categories ?? []).map((id) => termsAr.get(id)).find(Boolean);
    const photo = post.featured_media ? media.get(post.featured_media) : undefined;
    return {
      kind: 'article' as const,
      key: post.slug,
      legacyId: String(post.id),
      at: asUtc(post.date),
      categorySlug: term?.slug,
      fields: {
        en: {
          title: text(post.title.rendered),
          excerpt: text(post.excerpt?.rendered),
          content: text(enBody.get(post.id)?.content?.rendered ?? post.content?.rendered),
          image: photo ? bestImageSrc(photo.media_details?.sizes, photo.source_url) : null,
          imageAlt: photo ? text(photo.alt_text) : '',
        },
        ar: {
          title: text(twin?.title.rendered),
          excerpt: text(twin?.excerpt?.rendered),
          content: text(arBody.get(post.id)?.content?.rendered ?? twin?.content?.rendered),
          imageAlt: photo ? text(photo.alt_text) : '',
        },
      },
    };
  });
}

export function planOffers(): ImportDoc[] {
  const en = rows<WCStoreProduct>('products', 'en');
  const ar = byId(rows<WCStoreProduct>('products', 'ar'));
  const published = snapshotPublishedAt();

  return en.map((product, index) => {
    const twin = ar.get(product.id);
    const unit = product.prices?.currency_minor_unit ?? 2;
    const images = (product.images || [])
      .filter((image) => typeof image?.src === 'string' && image.src.trim())
      .map((image) => {
        const alt = (image.alt || '').trim();
        const src = mirrorSrc(image.src.trim());
        // An empty alt is what the reader's fallback turns into the product name, so
        // the stored document says nothing rather than storing the name twice.
        return alt ? { src, alt } : { src };
      });
    return {
      kind: 'offer' as const,
      key: decodedKey(product.slug),
      legacyId: String(product.id),
      at: published,
      fields: {
        en: {
          name: text(product.name),
          excerpt: text(product.short_description),
          body: text(product.description),
          images,
          currency: product.prices?.currency_code || 'EGP',
          price: minorToDecimal(product.prices?.price, unit),
          regularPrice: minorToDecimal(product.prices?.regular_price, unit),
          onSale: Boolean(product.on_sale),
          enabled: true,
          position: index,
        },
        ar: {
          name: text(twin?.name),
          excerpt: text(twin?.short_description),
          body: text(twin?.description),
        },
      },
    };
  });
}

export function planPages(): ImportDoc[] {
  const en = rows<SnapshotPost>('pages-list', 'en');
  const ar = byId(rows<SnapshotPost>('pages-list', 'ar'));
  const enBody = byId(rows<SnapshotPost>('pages', 'en'));
  const arBody = byId(rows<SnapshotPost>('pages', 'ar'));

  return en.map((page) => {
    const twin = ar.get(page.id);
    return {
      kind: 'page' as const,
      key: page.slug,
      legacyId: String(page.id),
      at: asUtc(page.date),
      fields: {
        en: {
          title: text(page.title.rendered),
          content: text(enBody.get(page.id)?.content?.rendered ?? page.content?.rendered),
        },
        ar: {
          title: text(twin?.title.rendered),
          content: text(arBody.get(page.id)?.content?.rendered ?? twin?.content?.rendered),
        },
      },
    };
  });
}

/**
 * `/results` membership, as the console's own list.
 *
 * The uid is the WordPress post id the article card already carries: a slug can be
 * renamed by an editor, an id cannot, and the row is a statement about the post rather
 * than about its URL. Its document holds only the phrases that made it a story — the
 * title, cover and excerpt belong to the article, so a reworded story is fresh without
 * touching this list.
 *
 * One locale is enough because a list item is a single JSON document: the columns it
 * fills are shared by both languages, which is what the console's own writes do.
 */
export function planResultStories(): ImportDoc[] {
  const dates = byId(rows<SnapshotPost>('posts-list', 'en'));
  const published = snapshotPublishedAt();
  return snapshotResultStories().map((story, index) => {
    const post = dates.get(story.id);
    return {
      kind: 'list_item' as const,
      listKey: 'results',
      key: String(story.id),
      legacyId: String(story.id),
      at: post ? asUtc(post.date) : published,
      fields: { ar: { data: { phrases: story.phrases }, enabled: true, position: index } },
    };
  });
}

export function planDocs(): ImportDoc[] {
  return [...planArticles(), ...planOffers(), ...planPages(), ...planResultStories()];
}

// --- writing -------------------------------------------------------------------

function asWritten(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Does the row's draft already say what this write would store?
 *
 * The question is asked of `planWrites()`, not of the snapshot's raw string. The import
 * is meant to be run again, and the write path now cleans a plain field and filters a
 * body: compared against the document, all 96 rows the first pass wrote looked new on
 * the second, because the column holds the cleaned sentence rather than the `<p>` that
 * used to wrap it. Asking the same function the save asks makes the second pass a
 * no-op, which is the property the `prove:no-wp` ledger depends on.
 */
function draftMatches(row: ContentRow, spec: KindSpec, columns: ColumnWrites, name: string, value: unknown, locale: ContentLocale): boolean {
  const field = row.fields[name];
  if (!field) return false;
  const bi = spec.bi.find((candidate) => candidate.name === name);
  if (bi) return (field.draft?.[locale] ?? '') === asWritten(columns[bi.draft[locale]]);
  const text = spec.text.find((candidate) => candidate.name === name);
  if (text) return asWritten(field.value) === asWritten(columns[text.column]);
  if (field.kind === 'json') return JSON.stringify(field.draftJson ?? null) === JSON.stringify(value ?? null);
  if (field.kind === 'number') return (field.value ?? null) === (value === null || value === undefined ? null : Number(value));
  if (field.kind === 'flag') return field.value === Boolean(value);
  return false;
}

function needsWrite(row: ContentRow, spec: KindSpec, fields: Partial<Record<ContentLocale, Record<string, unknown>>>): boolean {
  for (const locale of ['ar', 'en'] as const) {
    const values = fields[locale];
    if (!values) continue;
    const planned = planWrites(spec, values, locale);
    if (!Object.entries(values).every(([name, value]) => draftMatches(row, spec, planned.columns, name, value, locale))) return true;
  }
  return false;
}

interface ExistingRow {
  id: string;
  status: string;
  legacy_id: string | null;
}

interface SelectShape {
  select(column: string): SelectShape;
  where(column: string, op: string, value: unknown): SelectShape;
  executeTakeFirst(): Promise<Record<string, unknown> | undefined>;
}

async function findExisting(kind: ImportKind, key: string, listId?: string): Promise<ExistingRow | null> {
  const spec = kindSpec(kind);
  // One query builder over four tables, so the column name the spec supplies is
  // handed to the narrow shape `./store.ts` uses for the same reason.
  let query: SelectShape = (db.selectFrom(spec.table) as unknown as SelectShape)
    .select('id')
    .select('status')
    .select('legacy_id');
  query = query.where(spec.keyColumn, '=', key).where('deleted_at', 'is', null);
  // A list item's uid is unique inside its own list, so the same number can be a
  // result story and a branch — only the list says which row this document means.
  if (listId) query = query.where('list_id', '=', listId);
  const row = await query.executeTakeFirst();
  if (!row) return null;
  const legacy = row.legacy_id;
  return { id: String(row.id), status: String(row.status ?? ''), legacy_id: legacy === null || legacy === undefined ? null : String(legacy) };
}

/** The ids of the `categories` rows, keyed by slug; created ones only when `apply`. */
async function categoryIds(docs: CategoryDoc[], apply: boolean, actorId: string): Promise<{ map: Map<string, string>; created: number; existed: number }> {
  const stored = await db.selectFrom('categories').select(['id', 'slug']).where('deleted_at', 'is', null).execute();
  const map = new Map(stored.map((row) => [row.slug, row.id]));
  let created = 0;
  for (const doc of docs) {
    if (map.has(doc.slug)) continue;
    const id = randomUUID();
    if (apply) {
      await db
        .insertInto('categories')
        .values({ id, slug: doc.slug, name_ar: doc.nameAr, name_en: doc.nameEn, position: doc.position, created_by: actorId, updated_by: actorId })
        .execute();
    }
    map.set(doc.slug, id);
    created += 1;
  }
  return { map, created, existed: docs.length - created };
}

function fieldsWithCategory(doc: ImportDoc, ids: Map<string, string>): ImportDoc['fields'] {
  if (!doc.categorySlug) return doc.fields;
  const id = ids.get(doc.categorySlug);
  if (!id) return doc.fields;
  // The category is one column, not a per-locale value, so it rides with the English write.
  return { ...doc.fields, en: { ...doc.fields.en, categoryId: id } };
}

/**
 * The lists the snapshot writes into, resolved once. `npm run db:seed` creates them;
 * a missing row is a setup gap rather than bad data, so it is reported once for the
 * list instead of once per row.
 */
async function resolveLists(docs: ImportDoc[]): Promise<{ ids: Map<string, string>; missing: string[] }> {
  const keys = [...new Set(docs.map((doc) => doc.listKey).filter((key): key is string => Boolean(key)))];
  const ids = new Map<string, string>();
  const missing: string[] = [];
  for (const key of keys) {
    const id = await listIdForKey(key);
    if (id) ids.set(key, id);
    else missing.push(key);
  }
  return { ids, missing };
}

async function importDoc(doc: ImportDoc, ids: Map<string, string>, lists: Map<string, string>, apply: boolean): Promise<'created' | 'updated' | 'unchanged' | { why: string }> {
  const fields = fieldsWithCategory(doc, ids);
  const spec = kindSpec(doc.kind);
  for (const [locale, values] of Object.entries(fields) as [ContentLocale, Record<string, unknown>][]) {
    const parsed = parseWrites(spec, { key: doc.key, fields: values }, locale);
    if (parsed.issues.length > 0) {
      return { why: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') };
    }
  }

  const listId = doc.listKey ? lists.get(doc.listKey) : undefined;
  const existing = await findExisting(doc.kind, doc.key, listId);
  if (!existing) {
    if (!apply) return 'created';
    const created = await createRow(doc.kind, { key: doc.key, listKey: doc.listKey, actorId: IMPORT_ACTOR.id, legacyId: doc.legacyId });
    if (!created.ok) return { why: `${created.status} ${created.code}` };
    const written = await publish(doc, created.value.id, fields, apply);
    return typeof written === 'string' ? 'created' : written;
  }

  if (existing.legacy_id && existing.legacy_id !== doc.legacyId) {
    return { why: `row is already bound to WordPress id ${existing.legacy_id}` };
  }
  const current = await getRow(doc.kind, existing.id);
  if (!current) return { why: 'row disappeared' };
  const changed = needsWrite(current, spec, fields) || !existing.legacy_id;
  const unpublished = current.status !== 'published';
  if (!changed && !unpublished) return 'unchanged';
  if (!apply) return 'updated';

  if (!existing.legacy_id) {
    await (
      db.updateTable(spec.table).set({ legacy_id: doc.legacyId } as never).where('id', '=', existing.id) as unknown as { execute(): Promise<unknown> }
    ).execute();
  }
  return publish(doc, existing.id, fields, apply);
}

async function publish(doc: ImportDoc, id: string, fields: ImportDoc['fields'], apply: boolean): Promise<'created' | 'updated' | { why: string }> {
  if (!apply) return 'updated';
  for (const [locale, values] of Object.entries(fields) as [ContentLocale, Record<string, unknown>][]) {
    const saved = await saveDraft(doc.kind, { id, locale, fields: values, actorId: IMPORT_ACTOR.id });
    if (!saved.ok) return { why: `save ${locale}: ${saved.status} ${saved.code}` };
  }
  const locales = (['ar', 'en'] as const).filter((locale) => fields[locale]);
  const done = await publishRow(doc.kind, {
    id,
    locales,
    actor: IMPORT_ACTOR,
    note: `wordpress import (post ${doc.legacyId})`,
    at: doc.at,
  });
  return done.ok ? 'updated' : { why: `publish: ${done.status} ${done.code}` };
}

/**
 * Write the snapshot as console rows. Nothing is written unless `apply`, and a row
 * that already says what the snapshot says is left alone.
 */
export async function importSnapshot(options: { apply: boolean; database: string }): Promise<ImportReport> {
  const apply = options.apply;
  const docs = planDocs();
  const categoryDocs = planCategories();
  const { map, created, existed } = await categoryIds(categoryDocs, apply, IMPORT_ACTOR.id);
  const lists = await resolveLists(docs);
  const report: ImportReport = {
    dryRun: !apply,
    database: options.database,
    categories: { created, existed },
    rows: { created: 0, updated: 0, unchanged: 0 },
    skipped: lists.missing.map((listKey) => ({ kind: 'list_item', key: listKey, why: 'no `lists` row — run `npm run db:seed`' })),
  };

  for (const doc of docs) {
    if (doc.listKey && !lists.ids.has(doc.listKey)) continue;
    const outcome = await importDoc(doc, map, lists.ids, apply);
    if (typeof outcome === 'string') report.rows[outcome] += 1;
    else report.skipped.push({ kind: doc.kind, key: doc.key, why: outcome.why });
  }
  return report;
}
