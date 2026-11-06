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
 * 7.5 added the 56 result stories, which are `list_item` rows in the console's own
 * `results` list: membership is then the list's to decide, so an editor who disables
 * a row hides it from `/results` even though the snapshot file still names it.
 *
 * Cleanup deletes exactly the rows the import wrote (matched by their snapshot keys),
 * so the database is left holding nothing published and the other suites' rungs are
 * untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { readDbConfig } from '../src/lib/db/index';
import { plainText } from '../src/lib/content/format';
import { kindSpec, parseWrites, type ContentLocale } from '../src/lib/content/kinds';
import { answersIn } from '../src/lib/content/language-fill';
import { htmlToText } from '../src/lib/wp/sanitize';
import { importSnapshot, planArticles, planCategories, planDocs, planOffers, planPages, planResultStories, type ImportReport } from '../src/lib/content/import-wp';
import { syncLists } from '../src/lib/content/lists';
import { hasPublished } from '../src/lib/content/published';
import { getAllArticles, getAllOffers, getAllPages, getOffer, getResultStories, type ResultStory } from '../src/lib/content/site';
import { readSnapshot, snapshotResultStories } from '../src/lib/wp/snapshot';
import * as wp from '../src/lib/wp';

let dryRun: ImportReport;
let applied: ImportReport;
let rerun: ImportReport;
let beforeDry: Awaited<ReturnType<typeof counts>>;
let afterDry: Awaited<ReturnType<typeof counts>>;

async function counts(): Promise<{ article: number; offer: number; page: number; category: number; results: number }> {
  const list = await db.selectFrom('lists').select('id').where('list_key', '=', 'results').executeTakeFirst();
  const [article, offer, page, category, results] = await Promise.all([
    db.selectFrom('articles').select('id').execute(),
    db.selectFrom('offers').select('id').execute(),
    db.selectFrom('pages').select('id').execute(),
    db.selectFrom('categories').select('id').execute(),
    list ? db.selectFrom('list_items').select('id').where('list_id', '=', list.id).execute() : Promise.resolve([]),
  ]);
  return { article: article.length, offer: offer.length, page: page.length, category: category.length, results: results.length };
}

/** The `results` list the import writes into — `npm run db:seed` normally creates it. */
async function resultsListId(): Promise<string | null> {
  const row = await db.selectFrom('lists').select('id').where('list_key', '=', 'results').executeTakeFirst();
  return row?.id ?? null;
}

/** The page clamp is 30, so the whole journal is read a page at a time. */
async function everyStory(): Promise<ResultStory[]> {
  const items: ResultStory[] = [];
  for (let page = 1; ; page += 1) {
    const paged = await getResultStories({ page, perPage: 30 });
    items.push(...paged.items);
    if (!paged.hasMore) return items;
  }
}

/** Exactly what the import can write — the same keys, so no fixture is ever touched. */
async function purge(): Promise<void> {
  const docs = planDocs();
  const slugs = docs.filter((doc) => doc.kind !== 'page' && doc.kind !== 'list_item').map((doc) => doc.key);
  const routes = docs.filter((doc) => doc.kind === 'page').map((doc) => doc.key);
  const stories = docs.filter((doc) => doc.kind === 'list_item').map((doc) => doc.key);
  const listId = await resultsListId();
  const items = listId && stories.length > 0
    ? await db.selectFrom('list_items').select('id').where('list_id', '=', listId).where('uid', 'in', stories).execute()
    : [];
  const ids = [
    ...(await db.selectFrom('articles').select('id').where('slug', 'in', slugs).execute()),
    ...(await db.selectFrom('offers').select('id').where('slug', 'in', slugs).execute()),
    ...(await db.selectFrom('pages').select('id').where('route', 'in', routes).execute()),
    ...items,
  ].map((row) => row.id);

  await db.deleteFrom('articles').where('slug', 'in', slugs).execute();
  await db.deleteFrom('offers').where('slug', 'in', slugs).execute();
  await db.deleteFrom('pages').where('route', 'in', routes).execute();
  await db
    .deleteFrom('categories')
    .where('slug', 'in', planCategories().map((doc) => doc.slug))
    .execute();
  if (items.length > 0) await db.deleteFrom('list_items').where('id', 'in', items.map((row) => row.id)).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
  const database = readDbConfig().database;
  // Idempotent, and the same call `npm run db:seed` makes: the import needs the list
  // row to exist, and says so with one skipped entry rather than 56 when it does not.
  await syncLists({ dryRun: false, database });
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
    expect(planResultStories()).toHaveLength(snapshotResultStories().length);
    // The story rows name a post id, which is what the article card carries.
    expect(planResultStories().every((doc) => doc.listKey === 'results' && /^\d+$/.test(doc.key))).toBe(true);
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
    expect(await hasPublished('list_item', { listKey: 'results' })).toBe(true);
    expect(applied.categories.created).toBe(planCategories().length);
  });

  it('shows the same result stories, now chosen by the list rather than the file', async () => {
    const index = new Map(snapshotResultStories().map((story) => [story.id, story.phrases]));
    const stories = await everyStory();
    const cards = new Map((await getAllArticles()).map((card) => [card.id, card]));
    const expected = [...index.keys()].filter((id) => cards.has(id));
    // Every row here is one the import wrote, so its key *is* the WordPress post id.
    expect(stories.map((story) => Number(story.key)).sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
    // The phrases come back through a JSON column, so they are compared by what they
    // say rather than by the identity the snapshot's array had in memory.
    const fromDatabase = new Map(stories.map((story) => [Number(story.key), story.phrases]));
    for (const id of expected) expect(fromDatabase.get(id)).toEqual(index.get(id));
  });

  it('takes the list off the snapshot, so hiding a story hides it', async () => {
    const listId = await resultsListId();
    if (!listId) throw new Error('the results list row is missing');
    const shown = await everyStory();
    const total = (await getResultStories({ page: 1, perPage: 30 })).total;
    const victim = shown[0];
    const row = await db
      .selectFrom('list_items')
      .select(['id', 'enabled'])
      .where('list_id', '=', listId)
      .where('uid', '=', victim.key)
      .executeTakeFirst();
    if (!row) throw new Error(`${victim.key} imported no list row`);

    try {
      await db.updateTable('list_items').set({ enabled: 0 }).where('id', '=', row.id).execute();
      const hidden = await everyStory();
      expect(hidden.some((story) => story.key === victim.key)).toBe(false);
      expect((await getResultStories({ page: 1, perPage: 30 })).total).toBe(total - 1);
      // The file still names it, so a snapshot answer would have kept showing it.
      expect(snapshotResultStories().some((entry) => String(entry.id) === victim.key)).toBe(true);
    } finally {
      await db.updateTable('list_items').set({ enabled: row.enabled }).where('id', '=', row.id).execute();
    }
    expect((await everyStory()).length).toBe(shown.length);
  });

  it('renders the same journal the snapshot rendered, article for article', async () => {
    const fromDatabase = new Map((await getAllArticles()).map((card) => [card.slug, card]));
    const fromSnapshot = await wp.getAllArticles();
    expect(fromDatabase.size).toBe(fromSnapshot.length);
    // The live Arabic body, to ask of it the question the teaser rule asks.
    const bodies = new Map(
      (await db.selectFrom('articles').select(['slug', 'pub_content_ar']).execute()).map((row) => [row.slug, row.pub_content_ar ?? '']),
    );

    for (const card of fromSnapshot) {
      const mine = fromDatabase.get(card.slug);
      if (!mine) throw new Error(`${card.slug} did not import`);
      // The numeric id is the WordPress post id, so an API consumer cannot tell an
      // imported article from one it served yesterday.
      expect(mine.id).toBe(card.id);
      // A title and an excerpt are `plain` fields: the sentence the column holds is the
      // snapshot's with its markup and its page-builder padding folded away. The site
      // never prints the doubled space WordPress renders between two runs, so the card
      // it builds is the same sentence either way.
      expect(mine.title).toEqual({ ar: plainText(card.title.ar), en: plainText(card.title.en) });
      // One field is deliberately not the snapshot's: the Arabic teaser. WordPress wrote
      // 92 auto-excerpts that are English sentences, so `/ar` answers them with the
      // article's own opening — and where the Arabic body is English too, which the audit
      // SQL counts, it keeps saying so rather than inventing a translation.
      const storedAr = plainText(card.excerpt.ar);
      if (answersIn('ar', storedAr)) expect(mine.excerpt.ar).toBe(storedAr);
      else expect(answersIn('ar', mine.excerpt.ar)).toBe(answersIn('ar', htmlToText(bodies.get(card.slug) ?? '')));
      expect(mine.excerpt.en).toBe(plainText(card.excerpt.en));
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
    const bodies = new Map(
      (await db.selectFrom('offers').select(['slug', 'pub_body_ar']).execute()).map((row) => [row.slug, row.pub_body_ar ?? '']),
    );

    fromSnapshot.forEach((card, index) => {
      const mine = fromDatabase[index];
      expect(mine.id).toBe(card.id);
      expect(mine.name).toEqual(card.name);
      // The same teaser rule as the journal, and the same answer: these four Arabic
      // excerpts are WooCommerce English, their Arabic bodies are English too, so the
      // card stays English and the audit SQL counts the row.
      if (answersIn('ar', card.excerpt.ar)) expect(mine.excerpt.ar).toBe(card.excerpt.ar);
      else expect(answersIn('ar', mine.excerpt.ar)).toBe(answersIn('ar', htmlToText(bodies.get(mine.slug) ?? '')));
      expect(mine.excerpt.en).toBe(card.excerpt.en);
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
    expect(stored.results).toBe(planResultStories().length);
  });
});
