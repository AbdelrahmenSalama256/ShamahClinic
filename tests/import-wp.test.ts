/**
 * BK-7.2 the WordPress import, against the disposable `shamah_cms_test` database.
 *
 * What is worth proving is that the import produces the site, not merely rows:
 *   - every snapshot value survives the console's own field validation, so nothing
 *     is silently dropped or truncated to fit a column;
 *   - the dry run writes nothing and the applied run leaves each kind published,
 *     which is what hands those kinds to the database in the site's read path;
 *   - the cards the site renders from the database match the cards it rendered from
 *     the snapshot — same titles, excerpts, images, categories, prices and post ids;
 *   - an article keeps the date its readers saw instead of the day the import ran;
 *   - re-running the import is a no-op: a row that already says what the snapshot
 *     says gets no new draft, no new revision and no new publish.
 *
 * Cleanup deletes exactly the rows the import wrote (matched by their snapshot keys),
 * so the database is left holding nothing published and the other suites' rungs are
 * untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { readDbConfig } from '../src/lib/db/index';
import { kindSpec, parseWrites, type ContentLocale } from '../src/lib/content/kinds';
import { importSnapshot, planArticles, planCategories, planDocs, planOffers, planPages, type ImportReport } from '../src/lib/content/import-wp';
import { hasPublished } from '../src/lib/content/published';
import { getAllArticles, getAllOffers, getAllPages, getOffer } from '../src/lib/content/site';
import { readSnapshot } from '../src/lib/wp/snapshot';
import * as wp from '../src/lib/wp';

let dryRun: ImportReport;
let applied: ImportReport;
let rerun: ImportReport;
let beforeDry: Awaited<ReturnType<typeof counts>>;
let afterDry: Awaited<ReturnType<typeof counts>>;

async function counts(): Promise<{ article: number; offer: number; page: number; category: number }> {
  const [article, offer, page, category] = await Promise.all([
    db.selectFrom('articles').select('id').execute(),
    db.selectFrom('offers').select('id').execute(),
    db.selectFrom('pages').select('id').execute(),
    db.selectFrom('categories').select('id').execute(),
  ]);
  return { article: article.length, offer: offer.length, page: page.length, category: category.length };
}

/** Exactly what the import can write — the same keys, so no fixture is ever touched. */
async function purge(): Promise<void> {
  const docs = planDocs();
  const slugs = docs.filter((doc) => doc.kind !== 'page').map((doc) => doc.key);
  const routes = docs.filter((doc) => doc.kind === 'page').map((doc) => doc.key);
  const ids = [
    ...(await db.selectFrom('articles').select('id').where('slug', 'in', slugs).execute()),
    ...(await db.selectFrom('offers').select('id').where('slug', 'in', slugs).execute()),
    ...(await db.selectFrom('pages').select('id').where('route', 'in', routes).execute()),
  ].map((row) => row.id);

  await db.deleteFrom('articles').where('slug', 'in', slugs).execute();
  await db.deleteFrom('offers').where('slug', 'in', slugs).execute();
  await db.deleteFrom('pages').where('route', 'in', routes).execute();
  await db
    .deleteFrom('categories')
    .where('slug', 'in', planCategories().map((doc) => doc.slug))
    .execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
  const database = readDbConfig().database;
  beforeDry = await counts();
  dryRun = await importSnapshot({ apply: false, database });
  afterDry = await counts();
  applied = await importSnapshot({ apply: true, database });
  rerun = await importSnapshot({ apply: true, database });
}, 600_000);

afterAll(async () => {
  await purge();
  // destroyDb(), not db.destroy(): the suites share one process, and the lazy
  // handle must forget the pool so a later file can open its own.
  await destroyDb();
});

describe('the snapshot mapped to console rows', () => {
  it('keeps every row the snapshot holds, once each', () => {
    const docs = planDocs();
    const keys = docs.map((doc) => `${doc.kind}:${doc.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(planArticles()).toHaveLength(readSnapshot<unknown[]>('posts-list', 'en')?.length ?? 0);
    expect(planOffers()).toHaveLength(readSnapshot<unknown[]>('products', 'en')?.length ?? 0);
    expect(planPages()).toHaveLength(readSnapshot<unknown[]>('pages-list', 'en')?.length ?? 0);
    expect(docs.every((doc) => doc.legacyId.length > 0)).toBe(true);
  });

  it('passes the validation an editor’s own save goes through', () => {
    const issues: string[] = [];
    for (const doc of planDocs()) {
      const spec = kindSpec(doc.kind);
      for (const [locale, values] of Object.entries(doc.fields) as [ContentLocale, Record<string, unknown>][]) {
        for (const issue of parseWrites(spec, { key: doc.key, fields: values }, locale).issues) {
          issues.push(`${doc.kind} ${doc.key} [${locale}] ${issue.path}: ${issue.message}`);
        }
      }
    }
    expect(issues).toEqual([]);
  });

  it('names the categories the articles point at', () => {
    const slugs = new Set(planCategories().map((doc) => doc.slug));
    const used = planArticles().map((doc) => doc.categorySlug).filter((slug): slug is string => Boolean(slug));
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((slug) => slugs.has(slug))).toBe(true);
  });
});

describe('a dry run', () => {
  it('plans every row and writes none', () => {
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.skipped).toEqual([]);
    expect(dryRun.rows.created).toBe(planDocs().length);
    expect(dryRun.rows.updated).toBe(0);
    expect(dryRun.rows.unchanged).toBe(0);
    expect(dryRun.categories.created).toBe(planCategories().length);
    expect(afterDry).toEqual(beforeDry);
  });
});

describe('the imported rows answer the site', () => {
  it('hands each kind to the database once the import publishes it', async () => {
    expect(applied.dryRun).toBe(false);
    expect(applied.rows.created).toBe(planDocs().length);
    expect(applied.skipped).toEqual([]);
    expect(await hasPublished('article')).toBe(true);
    expect(await hasPublished('offer')).toBe(true);
    expect(await hasPublished('page')).toBe(true);
    expect(applied.categories.created).toBe(planCategories().length);
  });

  it('renders the same journal the snapshot rendered, article for article', async () => {
    const fromDatabase = new Map((await getAllArticles()).map((card) => [card.slug, card]));
    const fromSnapshot = await wp.getAllArticles();
    expect(fromDatabase.size).toBe(fromSnapshot.length);

    for (const card of fromSnapshot) {
      const mine = fromDatabase.get(card.slug);
      if (!mine) throw new Error(`${card.slug} did not import`);
      // The numeric id is the WordPress post id, so an API consumer cannot tell an
      // imported article from one it served yesterday.
      expect(mine.id).toBe(card.id);
      expect(mine.title).toEqual(card.title);
      expect(mine.excerpt).toEqual(card.excerpt);
      expect(mine.image).toBe(card.image);
      expect(mine.imageAlt).toEqual(card.imageAlt);
      expect(mine.categorySlug).toBe(card.categorySlug);
      expect(mine.date.slice(0, 10)).toBe(card.date.slice(0, 10));
    }
  });

  it('keeps the journal in the order its readers saw', async () => {
    const dates = (await getAllArticles()).map((card) => card.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    expect(new Date(dates[0]).getTime()).toBeGreaterThan(new Date(dates[dates.length - 1]).getTime());
  });

  it('renders the same offers the snapshot rendered', async () => {
    const fromDatabase = await getAllOffers('en');
    const fromSnapshot = await wp.getAllOffers('en');
    expect(fromDatabase).toHaveLength(fromSnapshot.length);

    fromSnapshot.forEach((card, index) => {
      const mine = fromDatabase[index];
      expect(mine.id).toBe(card.id);
      expect(mine.name).toEqual(card.name);
      expect(mine.excerpt).toEqual(card.excerpt);
      expect(mine.price).toBe(card.price);
      expect(mine.regularPrice).toBe(card.regularPrice);
      expect(mine.currency).toBe(card.currency);
      expect(mine.onSale).toBe(card.onSale);
      expect(mine.discountPercent).toBe(card.discountPercent);
      expect(mine.image).toBe(card.image);
      expect(mine.imageAlt).toEqual(card.imageAlt);
      // The store prints an Arabic slug percent-encoded; the site's route carries the
      // decoded form, so the row keeps the decoded one and still resolves.
      expect(mine.slug).toBe(decodeURIComponent(card.slug));
    });
  });

  it('opens an offer by either spelling of its Arabic slug', async () => {
    const encoded = (readSnapshot<Array<{ slug: string }>>('products', 'en') ?? []).find((p) => /%[0-9a-f]{2}/i.test(p.slug));
    if (!encoded) throw new Error('the snapshot holds no encoded offer slug');
    const decoded = decodeURIComponent(encoded.slug);
    const byDecoded = await getOffer(decoded, 'en');
    expect(byDecoded?.item.slug).toBe(decoded);
    expect((await getOffer(encoded.slug, 'en'))?.item.id).toBe(byDecoded?.item.id);
  });

  it('renders the same pages the snapshot rendered', async () => {
    const fromDatabase = await getAllPages();
    const fromSnapshot = await wp.getAllPages();
    expect(fromDatabase.map((page) => page.slug).sort()).toEqual(fromSnapshot.map((page) => page.slug).sort());

    const about = fromSnapshot.find((page) => page.slug === 'about');
    const mine = fromDatabase.find((page) => page.slug === 'about');
    expect(mine?.title).toEqual(about?.title);
  });
});

describe('re-running the import', () => {
  it('writes nothing a previous pass already wrote', () => {
    expect(rerun.rows.created).toBe(0);
    expect(rerun.rows.updated).toBe(0);
    expect(rerun.rows.unchanged).toBe(planDocs().length);
    expect(rerun.skipped).toEqual([]);
    expect(rerun.categories.created).toBe(0);
  });

  it('leaves one revision per imported row', async () => {
    const rows = await db
      .selectFrom('articles')
      .select(['id', 'version', 'status'])
      .where('legacy_id', 'is not', null)
      .execute();
    expect(rows.length).toBe(planArticles().length);
    expect(rows.every((row) => row.status === 'published')).toBe(true);

    const revisions = await db
      .selectFrom('revisions')
      .select('entity_id')
      .where('entity_type', '=', 'article')
      .where('entity_id', 'in', rows.map((row) => row.id))
      .execute();
    expect(new Set(revisions.map((row) => row.entity_id)).size).toBe(rows.length);
  });

  it('counts what the whole pass left behind', async () => {
    const stored = await counts();
    expect(stored.article).toBe(planArticles().length);
    expect(stored.offer).toBe(planOffers().length);
    expect(stored.page).toBe(planPages().length);
    expect(stored.category).toBe(planCategories().length);
  });
});
