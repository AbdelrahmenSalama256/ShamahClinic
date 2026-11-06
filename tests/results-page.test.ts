/**
 * #263 / slice R3 — a result is a result with or without an article.
 *
 * R2 joined a row to the journal and drew what survived. This slice drops the requirement, on
 * the owner's point 1: *"A new result must not need a blog article."* Four claims, checked
 * where each decision is actually made:
 *
 *   - **a row that names no article is drawn** — title, both pictures, service, caption. That
 *     is the whole form the console offers, and the page shows it.
 *   - **a row names its article by slug** — the join R2 fixed stays fixed. The 56 imported rows
 *     are keyed by the WordPress post id, and both spellings still resolve.
 *   - **the order is the one the owner set** — `position`, not the article's date. A list an
 *     owner can reorder but that renders in another order is a control that does nothing.
 *   - **half a comparison is not one** — a row with a "before" and no "after" answers with
 *     `pair: null`, so no reader can draw one picture under two labels.
 *
 * What is still dropped: the hidden row, the row with neither an article nor a title (it has
 * no name to draw), and a second row claiming an article another row already took.
 *
 * The before/after slice then split one field into two. A pair used to carry a single
 * description for both halves; each half now carries the sentence written for it, and a case
 * also states the area it treated and how many sessions it took. The 57 imported rows and the
 * one row an operator edited by hand still hold the shared sentence, so the fallback that reads
 * it is checked here rather than assumed — a description that reaches only one of the two
 * pictures is a screen reader naming a "before" with the word "after".
 *
 * The screen half renders `ResultsClient` for real. What a static render cannot show — the
 * enlarged view, which opens on a click and is built in a portal the server skips — is asserted
 * two ways: the note is provably absent from the list markup, and the dialog is read off the
 * card's source as walking only the stories that carry a pair. The pixels themselves are
 * unverified until a browser pass.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { createRow, getRow, saveDraft, type StoreResult } from '../src/lib/content/store';
import { publishRow } from '../src/lib/content/publish';
import type { ContentLocale } from '../src/lib/content/kinds';
import { getHomeResultCases, getResultStories, type ResultStory } from '../src/lib/content/site';
import { moveRow } from '../src/lib/content/order';
import { linkedArticleTitle, listSummaries } from '../src/lib/content/summary';
import { defaultViewFor } from '../src/lib/content/list-view';
import type { Article } from '../src/data/journal';

// `useLanguage()` reads the locale off the path, and the page's links need a router. The
// component under test is a client component; the mock is what lets a node render one.
let mockPath = '/en/results';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => undefined,
  redirect: () => undefined,
}));

const { LanguageProvider } = await import('../src/context/LanguageContext');
const { ResultsClient } = await import('../src/components/pages/ResultsClient');
type ResultStoryView = import('../src/components/pages/ResultsClient').ResultStoryView;

const run = randomUUID().slice(0, 8);
const key = (name: string): string => `results-${run}-${name}`;
const actor = { id: randomUUID(), email: `results-${run}@example.invalid` };
// The import keyed a result row by the WordPress post id, so the fallback path needs one
// whose key is a number. It stays in a range no imported post reaches, and is deleted again.
const legacyKey = String(90000 + (Number.parseInt(run.slice(0, 4), 16) % 9000));

function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

async function rowOf(id: string, what: string) {
  const row = await getRow('article', id);
  if (!row) throw new Error(`${what} disappeared`);
  return row;
}

async function seedArticle(name: string, title: Record<ContentLocale, string>, legacyId?: string): Promise<void> {
  const created = unwrap(await createRow('article', { key: key(name), actorId: actor.id }), `create ${name}`);
  for (const locale of ['ar', 'en'] as ContentLocale[]) {
    const current = await rowOf(created.id, name);
    unwrap(
      await saveDraft('article', {
        id: created.id,
        locale,
        fields: { title: title[locale], excerpt: `Excerpt in ${locale} for ${name}`, content: `<p>Body ${locale}</p>` },
        expectedVersion: current.version,
        actorId: actor.id,
      }),
      `save ${name} ${locale}`,
    );
  }
  unwrap(await publishRow('article', { id: created.id, locales: ['ar', 'en'], actor }), `publish ${name}`);
  // The import is the only writer of a WordPress id, so a test that means to hold one says
  // so on the column rather than through a form field no owner can see.
  if (legacyId) await db.updateTable('articles').set({ legacy_id: legacyId }).where('id', '=', created.id).execute();
}

async function seedItem(
  listKey: string,
  uid: string,
  data: Record<string, unknown>,
  options: { position?: number; enabled?: boolean } = {},
): Promise<void> {
  const created = unwrap(await createRow('list_item', { key: uid, listKey, actorId: actor.id }), `create ${listKey}/${uid}`);
  unwrap(
    await saveDraft('list_item', {
      id: created.id,
      locale: 'en',
      fields: { data, position: options.position ?? 0, enabled: options.enabled ?? true },
      expectedVersion: created.version,
      actorId: actor.id,
    }),
    `save ${listKey}/${uid}`,
  );
  unwrap(await publishRow('list_item', { id: created.id, locales: ['en'], actor }), `publish ${listKey}/${uid}`);
}

async function ensureList(listKey: string): Promise<void> {
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto('lists')
    .values({ id: randomUUID(), list_key: listKey, label: listKey, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: 0 })
    .execute();
}

async function purge(): Promise<void> {
  const itemIds = [
    ...(await db.selectFrom('list_items').select('id').where('uid', 'like', `results-${run}-%`).execute()),
    ...(await db.selectFrom('list_items').select('id').where('uid', '=', legacyKey).execute()),
  ];
  const articleIds = await db.selectFrom('articles').select('id').where('slug', 'like', `results-${run}-%`).execute();
  await db.deleteFrom('list_items').where('uid', 'like', `results-${run}-%`).execute();
  await db.deleteFrom('list_items').where('uid', '=', legacyKey).execute();
  await db.deleteFrom('articles').where('slug', 'like', `results-${run}-%`).execute();
  const ids = [...itemIds, ...articleIds].map((row) => row.id);
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

/** Every story, across every page — the page size must not decide what a claim proves. */
async function everyStory(): Promise<ResultStory[]> {
  const items: ResultStory[] = [];
  for (let page = 1; page < 20; page++) {
    const paged = await getResultStories({ page, perPage: 30 });
    items.push(...paged.items);
    if (items.length >= paged.total) return items;
  }
  throw new Error('the result stories never stopped paging');
}

const typedHeadline = { ar: 'عنوان كتبته العيادة', en: 'A headline the clinic typed' };
const standaloneHeadline = { ar: 'نتيجة بلا مقال', en: 'A result with no article behind it' };
const oldDescHeadline = { ar: 'حالة قديمة', en: 'A case written before the split' };
const beforeAltText = { ar: 'وصف صورة قبل', en: 'What the before photo shows' };
const afterAltText = { ar: 'وصف صورة بعد', en: 'What the after photo shows' };
/** the one sentence a row written before the split holds for both halves. */
const sharedAltText = { ar: 'وصف الصورتين معًا', en: 'The one sentence both halves shared' };
const areaText = { ar: 'الوجه', en: 'The face' };
const sessionsText = { ar: '٤ جلسات', en: '4 sessions' };
const noteText = { ar: 'نص التكبير', en: 'The text only the enlarged view shows' };

/**
 * Write a document straight into a row's two JSON columns.
 *
 * The typed form refuses a key its schema does not list, which is right for an operator and
 * useless for a test: the shape this checks is the one the WordPress import left behind, and no
 * form can produce it any more. So the row is created and published through the store, and only
 * its document is replaced afterwards — the same way the seed for a WordPress post id works.
 */
async function writeDoc(uid: string, doc: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(doc);
  await db.updateTable('list_items').set({ draft: json, published: json }).where('uid', '=', uid).execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
  await ensureList('results');
  await ensureList('services');

  await seedArticle('a', { ar: 'مقال الأولى', en: 'Article A' });
  await seedArticle('b', { ar: 'مقال الثانية', en: 'Article B' });
  await seedArticle('c', { ar: 'مقال الثالثة', en: 'Article C' });
  await seedArticle('d', { ar: 'مقال الرابعة', en: 'Article D' }, legacyKey);

  await seedItem('services', key('svc'), { name: { ar: 'ليزر', en: 'Laser hair removal' } });

  // Positions deliberately disagree with the uid order the database would otherwise fall back to.
  await seedItem('results', key('half'), {
    story: key('b'),
    before: '/uploads/before-only.jpg',
    caption: { ar: 'سطر', en: 'A line' },
  }, { position: 0 });
  await seedItem('results', key('full'), {
    story: key('a'),
    title: typedHeadline,
    service: [key('svc')],
    before: '/uploads/before-a.jpg',
    after: '/uploads/after-a.jpg',
    beforeAlt: beforeAltText,
    afterAlt: afterAltText,
    area: areaText,
    sessions: sessionsText,
    caption: { ar: 'بعد أربع جلسات', en: 'After four sessions' },
    note: noteText,
  }, { position: 1 });
  // Exactly what the WordPress import writes: a row keyed by the post id, holding only the
  // phrases that made the article a result story. It has typed no title, so its name in the
  // console has to come from the article it claims.
  await seedItem('results', legacyKey, { phrases: ['بعد أربع جلسات', 'after four sessions'] }, { position: 2 });
  // The owner's point 1 in one row: it names no article at all, and holds everything else.
  await seedItem('results', key('standalone'), {
    title: standaloneHeadline,
    service: [key('svc')],
    before: '/uploads/before-alone.jpg',
    after: '/uploads/after-alone.jpg',
    beforeAlt: beforeAltText,
    afterAlt: afterAltText,
    caption: { ar: 'بعد جلستين', en: 'After two sessions' },
    note: noteText,
  }, { position: 3 });
  // One row in the shape the site's own data still holds: both halves and a single description
  // written for the pair, because that is all the older form could type.
  await seedItem('results', key('olddesc'), {
    title: oldDescHeadline,
    before: '/uploads/before-old.jpg',
    after: '/uploads/after-old.jpg',
    caption: { ar: 'سطر', en: 'A line' },
  }, { position: 8 });
  await writeDoc(key('olddesc'), {
    title_ar: oldDescHeadline.ar,
    title_en: oldDescHeadline.en,
    before: '/uploads/before-old.jpg',
    after: '/uploads/after-old.jpg',
    alt_ar: sharedAltText.ar,
    alt_en: sharedAltText.en,
    caption_ar: 'سطر',
    caption_en: 'A line',
  });
  await seedItem('results', key('hidden'), { story: key('c') }, { position: 4, enabled: false });
  await seedItem('results', key('orphan'), { story: key('missing-article') }, { position: 5 });
  await seedItem('results', key('dupe'), { story: key('a') }, { position: 6 });
});

afterAll(async () => {
  await purge();
  await destroyDb();
});

/** What a reader would call the card: the article it opens, or the row's own name. */
const named = (story: ResultStory): string => story.card?.slug ?? story.key;

describe('a result row reaches the page', () => {
  it('draws a result that names no article, from its title and its two pictures', async () => {
    const alone = (await everyStory()).find((story) => story.key === key('standalone'));
    expect(alone).toBeDefined();
    expect(alone?.card).toBeNull();
    expect(alone?.headline).toEqual(standaloneHeadline);
    expect(alone?.pair).toEqual({ before: '/uploads/before-alone.jpg', after: '/uploads/after-alone.jpg', beforeAlt: beforeAltText, afterAlt: afterAltText });
    expect(alone?.caption.en).toBe('After two sessions');
    expect(alone?.service?.name.en).toBe('Laser hair removal');
    // The story it never had: no phrases, because nothing was imported into it.
    expect(alone?.phrases).toEqual([]);
  });

  it('joins by the slug it names, and by the post id when that is all it has', async () => {
    const stories = await everyStory();
    expect(stories.map(named)).toEqual([key('b'), key('a'), key('d'), key('standalone'), key('olddesc')]);
  });

  it('keeps the order the console set, which is not the order the rows were written', async () => {
    const paged = await getResultStories({ page: 1, perPage: 30 });
    // uid order would read the legacy number before the `results-…` keys, and date order is a
    // tie the list would then settle by uid. Either way it is not the order the owner picked.
    expect(paged.items.map(named)).toEqual([key('b'), key('a'), key('d'), key('standalone'), key('olddesc')]);
    expect(paged.total).toBe(5);
  });

  it('draws the case a row typed: both halves, each with its own words, and the two chips', async () => {
    const full = (await everyStory()).find((story) => story.key === key('full'));
    expect(full).toBeDefined();
    expect(full?.headline).toEqual(typedHeadline);
    // One sentence cannot name both pictures: a face before a peel and the same face after it
    // are two things, and the alt a screen reader hears is per side.
    expect(full?.pair).toEqual({ before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg', beforeAlt: beforeAltText, afterAlt: afterAltText });
    expect(full?.area).toEqual(areaText);
    expect(full?.sessions).toEqual(sessionsText);
    expect(full?.caption.en).toBe('After four sessions');
    expect(full?.note.en).toBe('The text only the enlarged view shows');
    expect(full?.service?.name.en).toBe('Laser hair removal');
  });

  it('reads the one shared description onto both halves for a row written before the split', async () => {
    const old = (await everyStory()).find((story) => story.key === key('olddesc'));
    expect(old?.pair?.before).toBe('/uploads/before-old.jpg');
    expect(old?.pair?.beforeAlt).toEqual(sharedAltText);
    expect(old?.pair?.afterAlt).toEqual(sharedAltText);
    // Fields the older row never had stay empty rather than being invented: no chip is drawn
    // for an area nobody named.
    expect(old?.area).toEqual({ ar: '', en: '' });
    expect(old?.sessions).toEqual({ ar: '', en: '' });
  });

  it('leaves the headline as the article wrote it when the row typed none', async () => {
    const half = (await everyStory()).find((story) => story.key === key('half'));
    expect(half?.headline).toEqual({ ar: 'مقال الثانية', en: 'Article B' });
    // One picture is not a comparison, so it has no halves to describe.
    expect(half?.pair).toBeNull();
    expect(half?.service).toBeNull();

    // The row the import wrote says nothing but its phrases, and is still a real card.
    const imported = (await everyStory()).find((story) => story.key === legacyKey);
    expect(imported?.headline).toEqual({ ar: 'مقال الرابعة', en: 'Article D' });
    expect(imported?.pair).toBeNull();
    // The phrases the import found travel with the row, in whichever language they were written.
    expect(imported?.phrases).toEqual(['بعد أربع جلسات', 'after four sessions']);
  });

  it('drops the pair when only one half was uploaded', async () => {
    const [half, full] = await everyStory();
    expect(half.pair).toBeNull();
    expect(full.pair).not.toBeNull();
  });

  it('never draws one article twice, nor a row that has no name', async () => {
    const stories = await everyStory();
    expect(stories.map(named)).not.toContain(key('c'));
    // Its pointer answers with nothing and it typed no headline: there is no card to title.
    expect(stories.map((story) => story.key)).not.toContain(key('orphan'));
    expect(new Set(stories.map(named)).size).toBe(stories.length);
  });

  it('keeps a titled row whose article is gone', async () => {
    // Deleting a post must not delete a result the owner wrote and photographed: the pointer
    // resolves to nothing, and the row's own headline is what the card is drawn from.
    await seedItem('results', key('gone'), {
      story: key('an-article-nobody-wrote'),
      title: { ar: 'بقيت', en: 'Still here' },
      before: '/uploads/before-gone.jpg',
      after: '/uploads/after-gone.jpg',
    }, { position: 7 });
    try {
      const gone = (await everyStory()).find((story) => story.key === key('gone'));
      expect(gone?.card).toBeNull();
      expect(gone?.headline).toEqual({ ar: 'بقيت', en: 'Still here' });
      // No article and no typed description for either half, so each is read out as whatever
      // the case is titled — a picture with no words still says what it is a picture of.
      expect(gone?.pair?.beforeAlt).toEqual({ ar: 'بقيت', en: 'Still here' });
      expect(gone?.pair?.afterAlt).toEqual({ ar: 'بقيت', en: 'Still here' });
      expect(gone?.pair?.before).toBe('/uploads/before-gone.jpg');
      expect(gone?.pair?.after).toBe('/uploads/after-gone.jpg');
    } finally {
      await db.deleteFrom('list_items').where('uid', '=', key('gone')).execute();
    }
  });
});

// --- the home comparison reads the same order and the same visibility ----------

/**
 * A2: what the console's two controls are claims to do, checked where the site decides.
 *
 * The arrows write the `position` column (proved in `tests/list-order.test.ts` and
 * `tests/content.test.ts`); the visibility box writes the `enabled` one. Neither claim means
 * anything until a reader agrees, and the home band reads through a third condition the owner
 * only ticks inside the row — so all three are checked together here:
 *
 *   - **Home takes its cases in the owner's order**, the same `position` the results page
 *     reads, so a row moved up is a row shown first in both places.
 *   - **asking is not enough**: a half case and a row nobody named both stay off Home, and the
 *     half one keeps its place on `/results`, which is what the field's own hint promises.
 *   - **a move changes nothing but the order**: after pressing up, the moving row is still
 *     visible, still asked for Home, still holds both pictures, and its document is the same
 *     text it was before — reordering cannot quietly edit a case.
 *   - **hiding takes it out of both reads and deletes nothing**: every field in the row's two
 *     JSON columns comes back the same, and switching it back returns the case with its pair
 *     and its headline exactly as they were.
 */
describe('the home comparison follows the console order and the console visibility', () => {
  const homeHeadline = (name: string): { ar: string; en: string } => ({ ar: `حالة ${name}`, en: `Case ${name}` });
  const homePair = (name: string): { before: string; after: string } => ({ before: `/uploads/before-${name}.jpg`, after: `/uploads/after-${name}.jpg` });

  /** the row's two document columns, as stored: the test for "hiding deletes nothing". */
  async function docOf(uid: string): Promise<unknown> {
    const row = await db.selectFrom('list_items').select(['draft', 'published']).where('uid', '=', uid).executeTakeFirst();
    if (!row) throw new Error(`${uid} is not in the list`);
    // Read as objects: MariaDB hands a JSON column back as text or as a value depending on the
    // driver's path, and what has to be identical here is the case's content, not its key order.
    const asValue = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);
    return { draft: asValue(row.draft), published: asValue(row.published) };
  }

  async function idOf(uid: string): Promise<string> {
    const row = await db.selectFrom('list_items').select('id').where('uid', '=', uid).executeTakeFirst();
    if (!row) throw new Error(`${uid} is not in the list`);
    return String(row.id);
  }

  /** Hide or show a row the way the editor does: the whole form saved through the store. */
  async function setShow(uid: string, visible: boolean): Promise<void> {
    const id = await idOf(uid);
    const current = await getRow('list_item', id);
    if (!current) throw new Error(`${uid} disappeared`);
    const data = current.fields.data;
    if (data.kind !== 'json' || data.draftJson === undefined) throw new Error(`${uid} holds no document`);
    unwrap(
      await saveDraft('list_item', { id, locale: 'en', fields: { data: data.draftJson, enabled: visible }, expectedVersion: current.version, actorId: actor.id }),
      `show ${uid}`,
    );
  }

  beforeAll(async () => {
    // Positions past every row the section above asserts on, so a move that renumbers the whole
    // list cannot shuffle the rows whose order those tests are about.
    const pairDoc = (name: string, ask = true): Record<string, unknown> => ({
      title: homeHeadline(name),
      ...homePair(name),
      beforeAlt: beforeAltText,
      afterAlt: afterAltText,
      showOnHome: ask,
    });
    await seedItem('results', key('h1'), pairDoc('one'), { position: 20 });
    await seedItem('results', key('h2'), pairDoc('two'), { position: 21 });
    // Asks for Home with one picture: the eligibility the row cannot grant itself.
    await seedItem('results', key('hhalf'), { title: homeHeadline('half'), before: '/uploads/before-half.jpg', showOnHome: true }, { position: 22 });
    // Asks for Home, holds a pair, and is hidden.
    await seedItem('results', key('hhidden'), pairDoc('hidden'), { position: 23, enabled: false });
    // A complete, visible case nobody invited to the home page.
    await seedItem('results', key('hplain'), { ...pairDoc('plain'), showOnHome: false }, { position: 24 });
  });

  afterAll(async () => {
    // Named, not patterned: `h%` would take the `half` and `hidden` rows the section above
    // seeded and another test still reads.
    const uids = ['h1', 'h2', 'hhalf', 'hhidden', 'hplain'].map((name) => `results-${run}-${name}`);
    const ids = await db.selectFrom('list_items').select('id').where('uid', 'in', uids).execute();
    await db.deleteFrom('list_items').where('uid', 'in', uids).execute();
    if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids.map((row) => row.id)).execute();
  });

  it('takes its cases in the order the owner set, and only those that asked', async () => {
    const cases = await getHomeResultCases();
    expect(cases.map((story) => story.key)).toEqual([key('h1'), key('h2')]);
    // The half case and the hidden one are absent, and for different reasons: one is not a
    // comparison, the other is not on the site. Neither is drawn, and neither is invented.
    expect(cases.map((story) => story.key)).not.toContain(key('hhalf'));
    expect(cases.map((story) => story.key)).not.toContain(key('hhidden'));
    expect(cases.map((story) => story.key)).not.toContain(key('hplain'));
    // Both halves reach the band, each with the words written for it.
    expect(cases[0]?.pair).toEqual({ before: '/uploads/before-one.jpg', after: '/uploads/after-one.jpg', beforeAlt: beforeAltText, afterAlt: afterAltText });
  });

  it('keeps a case that is not eligible on the results page, where it is not a comparison', async () => {
    const keys = (await everyStory()).map((story) => story.key);
    expect(keys).toContain(key('hhalf'));
    expect(keys).toContain(key('hplain'));
    // Hidden is the one state that leaves the site, and it leaves both reads at once.
    expect(keys).not.toContain(key('hhidden'));
  });

  it('moves a case to the front of Home without touching what it holds', async () => {
    const before = await docOf(key('h2'));
    const moved = await moveRow('list_item', { id: await idOf(key('h2')), direction: 'up', listKey: 'results', actorId: actor.id });
    expect(moved.ok).toBe(true);

    const cases = await getHomeResultCases();
    expect(cases.map((story) => story.key)).toEqual([key('h2'), key('h1')]);
    const movedStory = cases.find((story) => story.key === key('h2'));
    expect(movedStory?.showOnHome).toBe(true);
    expect(movedStory?.pair?.after).toBe('/uploads/after-two.jpg');
    // The move wrote numbers and nothing else: the case's own document came back unchanged, so
    // reordering a list cannot edit, hide or un-home a row.
    expect(await docOf(key('h2'))).toEqual(before);

    // Put it back for the claim below, which reads the list in the order it was written.
    expect((await moveRow('list_item', { id: await idOf(key('h2')), direction: 'down', listKey: 'results', actorId: actor.id })).ok).toBe(true);
    expect((await getHomeResultCases()).map((story) => story.key)).toEqual([key('h1'), key('h2')]);
  });

  it('hides a case from both reads and gives it back with nothing lost', async () => {
    const doc = await docOf(key('h1'));
    await setShow(key('h1'), false);

    expect((await getHomeResultCases()).map((story) => story.key)).toEqual([key('h2')]);
    expect((await everyStory()).map((story) => story.key)).not.toContain(key('h1'));
    // The row is off the site, and its pictures, headline and descriptions are still the values
    // they were — hiding is a column, not a delete.
    expect(await docOf(key('h1'))).toEqual(doc);

    await setShow(key('h1'), true);
    const back = (await getHomeResultCases()).find((story) => story.key === key('h1'));
    expect(back?.headline).toEqual(homeHeadline('one'));
    expect(back?.pair?.before).toBe('/uploads/before-one.jpg');
    expect(await docOf(key('h1'))).toEqual(doc);
  });
});

// --- the console names the row by what it holds -------------------------------

describe('the console titles a result row by its article, or by what it typed', () => {
  it('reads the linked article when the row typed no headline of its own', async () => {
    const page = await listSummaries('list_item', { view: defaultViewFor('list_item'), listKey: 'results', trash: false, locale: 'en' });
    const byKey = new Map(page.rows.map((row) => [row.key, row]));
    // A heading of "1182" is the defect, not a name: the imported row is read by its post id…
    expect(byKey.get(legacyKey)?.titleEn).toBe('Article D');
    // …and a console row by the slug it picked.
    expect(byKey.get(key('half'))?.titleEn).toBe('Article B');
    // A row that did type a headline keeps it.
    expect(byKey.get(key('full'))?.titleEn).toBe('A headline the clinic typed');
    // And a row that named no article is titled by what the owner typed, not by its uid.
    expect(byKey.get(key('standalone'))?.titleEn).toBe('A result with no article behind it');
    expect(page.rows.some((row) => /^\d+$/.test(row.titleEn))).toBe(false);
  });

  it('answers the editor heading for either spelling of the pointer', async () => {
    expect(await linkedArticleTitle(key('b'), 'en')).toBe('Article B');
    expect(await linkedArticleTitle(legacyKey, 'en')).toBe('Article D');
    expect(await linkedArticleTitle(key('nothing-here'), 'en')).toBe('');
  });
});

// --- the screen ---------------------------------------------------------------

const banner = { src: '/uploads/banner.jpg', alt: { ar: 'بانر', en: 'Banner' }, width: 1200, height: 800, focal: '50% 50%' };

function article(slug: string, title: Record<ContentLocale, string>): Article {
  return {
    slug,
    title,
    excerpt: { ar: 'مقتطف', en: 'An excerpt' },
    authorId: 'clinic',
    date: { ar: '٢٠٢٦-١٠-٢٦', en: '2026-10-26' },
    isoDate: '2026-10-26',
    image: { src: '/uploads/article.jpg', alt: title, width: 1200, height: 800, focal: '50% 50%' },
    tags: { ar: [], en: [] },
  };
}

/**
 * A story as the page receives it. `standalone` is the row that names no article: the same
 * fields, with nothing behind them but what the owner wrote.
 */
function view(slug: string, pair: { before: string; after: string } | null, standalone = false): ResultStoryView {
  const headline = standalone ? standaloneHeadline : { ar: 'عنوان', en: `Headline of ${slug}` };
  return {
    key: slug,
    article: standalone ? null : article(slug, headline),
    headline,
    pair: pair
      ? {
          before: { src: pair.before, alt: beforeAltText, width: 1200, height: 800, focal: '50% 50%' },
          after: { src: pair.after, alt: afterAltText, width: 1200, height: 800, focal: '50% 50%' },
        }
      : null,
    area: areaText,
    sessions: sessionsText,
    caption: { ar: 'سطر', en: 'After four sessions' },
    note: noteText,
    service: { label: { ar: 'ليزر', en: 'Laser hair removal' }, href: { ar: '/ar/services', en: '/services' } },
  };
}

function render(stories: ResultStoryView[], language: 'ar' | 'en' = 'en'): string {
  mockPath = `/${language}/results`;
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(ResultsClient, { stories, page: 1, totalPages: 1, total: stories.length, banner }),
    ),
  );
}

const clientSource = readFileSync(join(process.cwd(), 'src', 'components', 'pages', 'ResultsClient.tsx'), 'utf8');
const cardSource = readFileSync(join(process.cwd(), 'src', 'components', 'cards', 'ResultCaseCard.tsx'), 'utf8');

describe('the results screen draws what the row says', () => {
  it('shows both halves, and neither, for a story with only one', () => {
    const paired = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })]);
    expect(paired).toContain('>Before<');
    expect(paired).toContain('>After<');
    // `next/image` rewrites the address into `/_next/image?url=…`, so the file the picker
    // returned is read in the form a browser would actually request it.
    expect(paired).toContain('url=%2Fuploads%2Fbefore-a.jpg');
    expect(paired).toContain('url=%2Fuploads%2Fafter-a.jpg');
    expect(paired).toContain('After four sessions');

    // Each half is described by the sentence written for it, so a screen reader never hears
    // the same words over two different pictures.
    expect(paired).toContain(`alt="${beforeAltText.en}"`);
    expect(paired).toContain(`alt="${afterAltText.en}"`);

    // The two chips the case states beside its pictures.
    expect(paired).toContain(areaText.en);
    expect(paired).toContain(sessionsText.en);

    const alone = render([view('no-pair', null)]);
    expect(alone).not.toContain('>Before<');
    // Nothing to enlarge: the two press targets are only drawn over a pair.
    expect(alone).not.toContain('View Headline of no-pair result');
    expect(alone).not.toContain('cursor-zoom-in');
    expect(alone).toContain('Headline of no-pair');
  });

  it('keeps the enlarged view’s text out of the list, and puts it in the dialog', () => {
    const html = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })]);
    expect(html).not.toContain(noteText.en);

    // The enlarged view opens on a press, and it is built inside a portal the server render
    // skips, so a static string cannot reach it. What it is built from is read where the
    // decision is made: the gallery it walks, and the two halves and the note it draws.
    expect(clientSource).toMatch(/stories\.filter\(\(story\)[\s\S]*story\.pair !== null/);
    expect(cardSource).toMatch(/activeResult\.pair \? \[activeResult\.pair\.before, activeResult\.pair\.after\]/);
    expect(cardSource).toContain('t(activeResult.note.ar, activeResult.note.en)');
    expect(cardSource).toContain('aria-modal="true"');
    // A case with no pair cannot open the dialog at all — the portal is drawn only for a pair.
    expect(cardSource).toMatch(/\{story\.pair && typeof document !== "undefined" &&/);
  });

  it('walks the cases in one order, whichever way the page reads', () => {
    // The counter counts the order of the cases, the words on the controls say what they do,
    // and the keyboard steps by one. The card this was ported from mirrored the *step* for
    // Arabic as well as the icon, so in RTL "the next result" jumped to the last case and
    // counted backwards: two controls, two answers. Onward is `+1` in both directions now, and
    // the icons and the slide still flip with the direction.
    expect(cardSource).toMatch(/onClick=\{\(\) => move\(-1\)\}/);
    expect(cardSource).toMatch(/onClick=\{\(\) => move\(1\)\}/);
    expect(cardSource).not.toMatch(/move\(rtl/);
    expect(cardSource).toMatch(/rtl \? <ChevronRight className="h-5 w-5" \/> : <ChevronLeft className="h-5 w-5" \/>/);
    // Escape closes, so it takes the same path the close button takes and hands focus back.
    expect(cardSource).toMatch(/if \(event\.key === "Escape"\) closeGallery\(\);/);
    expect(cardSource).toMatch(/triggerRef\.current\?\.focus\(\);/);
  });

  it('says what to do when nothing has been published', () => {
    const empty = render([]);
    expect(empty).toContain('No result has been published yet');
    expect(empty).toContain('uploads a before and an after');
  });

  it('states the rule the page now follows, in both languages', () => {
    // The sentence the copy center owns: a result is two pictures, and the page says so
    // where it has nothing else to say. (It replaced an earlier one-line rule that named the
    // same requirement in fewer words and no instructions.)
    expect(render([], 'en')).toContain('it uploads a before and an after');
    expect(render([], 'ar')).toContain('ترفع صورة قبل وأخرى بعد');
  });

  it('links the service the row named, and the article the card belongs to', () => {
    const html = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })]);
    expect(html).toContain('/services');
    expect(html).toContain('/blogs/one-pair');
  });

  it('draws a result with no article as a card of its own, and links it to nothing', () => {
    // The owner's point 1, on the screen: a title, two pictures and a service are a result.
    const html = render([view('standalone-one', { before: '/uploads/before-alone.jpg', after: '/uploads/after-alone.jpg' }, true)]);
    expect(html).toContain('A result with no article behind it');
    expect(html).toContain('url=%2Fuploads%2Fbefore-alone.jpg');
    expect(html).toContain('url=%2Fuploads%2Fafter-alone.jpg');
    expect(html).toContain('>Before<');
    expect(html).toContain('After four sessions');
    expect(html).toContain('/services');
    // Nothing was invented to fill the article that is not there: no dead link, no promise.
    expect(html).not.toContain('/blogs/');
  });

  it('says so in Arabic when a standalone result has no pictures either', () => {
    const html = render([view('standalone-two', null, true)], 'ar');
    expect(html).toContain('نتيجة بلا مقال');
    expect(html).not.toContain('/blogs/');
    expect(html).not.toContain('cursor-zoom-in');
  });

  it('is read by a screen reader in Arabic, with each half named by itself', () => {
    const arabic = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })], 'ar');
    expect(arabic).toContain('>قبل<');
    expect(arabic).toContain('>بعد<');
    expect(arabic).toContain(`alt="${beforeAltText.ar}"`);
    expect(arabic).toContain(`alt="${afterAltText.ar}"`);
    expect(arabic).toContain(areaText.ar);
  });

  it('omits a chip the row left empty, rather than drawing an empty one', () => {
    // An unnamed area is not a chip that says "—": the card shows only what the row states.
    const bare = view('no-chips', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' });
    const html = render([{ ...bare, area: { ar: '', en: '' }, sessions: { ar: '', en: '' }, service: null }]);
    expect(html).not.toContain(areaText.en);
    expect(html).not.toContain(sessionsText.en);
    expect(html).not.toContain('Laser hair removal');
    // and the case is still a card, with its pictures and its caption.
    expect(html).toContain('>Before<');
    expect(html).toContain('After four sessions');
  });
});
