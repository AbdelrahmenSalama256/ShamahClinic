/**
 * Bringing the WordPress content into the console's tables (BK-7.2).
 *
 * The source is the frozen snapshot in `data/wp/*.json` — the same files the site's
 * fallback rung reads — so an import is reproducible offline and never asks the
 * client's production WordPress for anything. English rows are authoritative for
 * the list, the slugs and the prices; Arabic rows carrying the same WordPress id
 * supply the other locale, which is how TranslatePress keeps one article across the
 * two subsites.
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
import { readSnapshot, snapshotMedia, snapshotMeta } from '../wp/snapshot';
import { bestImageSrc } from '../wp/sanitize';
import type { WCStoreProduct, WPTerm } from '../wp/types';
import { kindSpec, parseWrites, type ContentKind, type ContentLocale } from './kinds';
import { publishRow } from './publish';
import { createRow, getRow, saveDraft, type ContentRow } from './store';

/** Kinds this import knows: a list item has no WordPress equivalent to map from. */
export type ImportKind = Exclude<ContentKind, 'list_item'>;

export interface ImportDoc {
  kind: ImportKind;
  /** the row's public identity: an article slug, an offer slug or a page route */
  key: string;
  legacyId: string;
  /** when WordPress published it, so the site keeps showing the same date */
  at: Date;
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

export function planDocs(): ImportDoc[] {
  return [...planArticles(), ...planOffers(), ...planPages()];
}

// --- writing -------------------------------------------------------------------

function draftMatches(row: ContentRow, name: string, value: unknown, locale: ContentLocale): boolean {
  const field = row.fields[name];
  if (!field) return false;
  if (field.kind === 'bi') return (field.draft?.[locale] ?? '') === text(value);
  if (field.kind === 'json') return JSON.stringify(field.draftJson ?? null) === JSON.stringify(value ?? null);
  if (field.kind === 'text') return (field.value ?? '') === text(value);
  if (field.kind === 'number') return (field.value ?? null) === (value === null || value === undefined ? null : Number(value));
  if (field.kind === 'flag') return field.value === Boolean(value);
  return false;
}

function needsWrite(row: ContentRow, fields: Partial<Record<ContentLocale, Record<string, unknown>>>): boolean {
  for (const locale of ['ar', 'en'] as const) {
    const values = fields[locale];
    if (!values) continue;
    if (!Object.entries(values).every(([name, value]) => draftMatches(row, name, value, locale))) return true;
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

async function findExisting(kind: ImportKind, key: string): Promise<ExistingRow | null> {
  const spec = kindSpec(kind);
  // One query builder over three tables, so the column name the spec supplies is
  // handed to the narrow shape `./store.ts` uses for the same reason.
  const row = await (db.selectFrom(spec.table) as unknown as SelectShape)
    .select('id')
    .select('status')
    .select('legacy_id')
    .where(spec.keyColumn, '=', key)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
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

async function importDoc(doc: ImportDoc, ids: Map<string, string>, apply: boolean): Promise<'created' | 'updated' | 'unchanged' | { why: string }> {
  const fields = fieldsWithCategory(doc, ids);
  const spec = kindSpec(doc.kind);
  for (const [locale, values] of Object.entries(fields) as [ContentLocale, Record<string, unknown>][]) {
    const parsed = parseWrites(spec, { key: doc.key, fields: values }, locale);
    if (parsed.issues.length > 0) {
      return { why: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') };
    }
  }

  const existing = await findExisting(doc.kind, doc.key);
  if (!existing) {
    if (!apply) return 'created';
    const created = await createRow(doc.kind, { key: doc.key, actorId: IMPORT_ACTOR.id, legacyId: doc.legacyId });
    if (!created.ok) return { why: `${created.status} ${created.code}` };
    const written = await publish(doc, created.value.id, fields, apply);
    return typeof written === 'string' ? 'created' : written;
  }

  if (existing.legacy_id && existing.legacy_id !== doc.legacyId) {
    return { why: `row is already bound to WordPress id ${existing.legacy_id}` };
  }
  const current = await getRow(doc.kind, existing.id);
  if (!current) return { why: 'row disappeared' };
  const changed = needsWrite(current, fields) || !existing.legacy_id;
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
  const categoryDocs = planCategories();
  const { map, created, existed } = await categoryIds(categoryDocs, apply, IMPORT_ACTOR.id);
  const report: ImportReport = {
    dryRun: !apply,
    database: options.database,
    categories: { created, existed },
    rows: { created: 0, updated: 0, unchanged: 0 },
    skipped: [],
  };

  for (const doc of planDocs()) {
    const outcome = await importDoc(doc, map, apply);
    if (typeof outcome === 'string') report.rows[outcome] += 1;
    else report.skipped.push({ kind: doc.kind, key: doc.key, why: outcome.why });
  }
  return report;
}
