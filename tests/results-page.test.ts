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
 * The screen half renders `ResultsClient` for real. What a static render cannot show — the
 * enlarged view, which opens on a click — is asserted two ways: the note is provably absent
 * from the list markup, and the dialog is read off the source as walking only the stories
 * that carry a pair. The pixels themselves are unverified until a browser pass.
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
import { getResultStories, type ResultStory } from '../src/lib/content/site';
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
const pairAlt = { ar: 'وصف الصورتين', en: 'The description of the two pictures' };
const noteText = { ar: 'نص التكبير', en: 'The text only the enlarged view shows' };

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
    alt: pairAlt,
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
    alt: pairAlt,
    caption: { ar: 'بعد جلستين', en: 'After two sessions' },
    note: noteText,
  }, { position: 3 });
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
    expect(alone?.pair).toEqual({ before: '/uploads/before-alone.jpg', after: '/uploads/after-alone.jpg' });
    expect(alone?.caption.en).toBe('After two sessions');
    expect(alone?.service?.name.en).toBe('Laser hair removal');
    // The story it never had: no phrases, because nothing was imported into it.
    expect(alone?.phrases).toEqual([]);
  });

  it('joins by the slug it names, and by the post id when that is all it has', async () => {
    const stories = await everyStory();
    expect(stories.map(named)).toEqual([key('b'), key('a'), key('d'), key('standalone')]);
  });

  it('keeps the order the console set, which is not the order the rows were written', async () => {
    const paged = await getResultStories({ page: 1, perPage: 30 });
    // uid order would read the legacy number before the `results-…` keys, and date order is a
    // tie the list would then settle by uid. Either way it is not the order the owner picked.
    expect(paged.items.map(named)).toEqual([key('b'), key('a'), key('d'), key('standalone')]);
    expect(paged.total).toBe(4);
  });

  it('draws the case a row typed: both halves, the headline, the alt, the caption, the note', async () => {
    const full = (await everyStory()).find((story) => story.key === key('full'));
    expect(full).toBeDefined();
    expect(full?.headline).toEqual(typedHeadline);
    expect(full?.pair).toEqual({ before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' });
    expect(full?.alt).toEqual(pairAlt);
    expect(full?.caption.en).toBe('After four sessions');
    expect(full?.note.en).toBe('The text only the enlarged view shows');
    expect(full?.service?.name.en).toBe('Laser hair removal');
  });

  it('leaves the headline and the description as the article wrote them when the row typed none', async () => {
    const half = (await everyStory()).find((story) => story.key === key('half'));
    expect(half?.headline).toEqual({ ar: 'مقال الثانية', en: 'Article B' });
    // An alt that was never written still has to say what the two pictures are of.
    expect(half?.alt).toEqual(half?.headline);
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
      // No article to describe the pair, so the headline says what the pictures are of.
      expect(gone?.alt).toEqual({ ar: 'بقيت', en: 'Still here' });
      expect(gone?.pair).toEqual({ before: '/uploads/before-gone.jpg', after: '/uploads/after-gone.jpg' });
    } finally {
      await db.deleteFrom('list_items').where('uid', '=', key('gone')).execute();
    }
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
    sections: [],
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
          before: { src: pair.before, alt: pairAlt, width: 1200, height: 800, focal: '50% 50%' },
          after: { src: pair.after, alt: pairAlt, width: 1200, height: 800, focal: '50% 50%' },
        }
      : null,
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

describe('the results screen draws what the row says', () => {
  it('shows both halves, and neither, for a story with only one', () => {
    const paired = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })]);
    expect(paired).toContain('Before');
    expect(paired).toContain('After');
    // `next/image` rewrites the address into `/_next/image?url=…`, so the file the picker
    // returned is read in the form a browser would actually request it.
    expect(paired).toContain('url=%2Fuploads%2Fbefore-a.jpg');
    expect(paired).toContain('url=%2Fuploads%2Fafter-a.jpg');
    expect(paired).toContain('After four sessions');

    const alone = render([view('no-pair', null)]);
    expect(alone).not.toContain('>Before<');
    expect(alone).not.toContain('aria-label="Enlarge');
    expect(alone).toContain('Headline of no-pair');
  });

  it('keeps the enlarged view’s text out of the list, and puts it in the dialog', () => {
    const html = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })]);
    expect(html).not.toContain(noteText.en);

    // The enlarged view opens on a press, so a static render cannot reach it. What it is
    // built from is checked where the decision is made.
    expect(clientSource).toMatch(/stories\.filter\(\(story\)[\s\S]*story\.pair !== null/);
    expect(clientSource).toContain('shown.pair.before');
    expect(clientSource).toContain('shown.pair.after');
    expect(clientSource).toContain('t(shown.note.ar, shown.note.en)');
    expect(clientSource).toContain('aria-modal="true"');
  });

  it('says what to do when nothing has been published', () => {
    const empty = render([]);
    expect(empty).toContain('No result has been published yet');
    expect(empty).toContain('uploads a before and an after');
  });

  it('states the rule the page now follows, in both languages', () => {
    expect(render([], 'en')).toContain('A before/after pair shows only when the clinic uploads both halves');
    expect(render([], 'ar')).toContain('صورة «قبل وبعد» تظهر فقط حين ترفع العيادة الصورتين');
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
    expect(html).not.toContain('Open the article');
  });

  it('says so in Arabic when a standalone result has no pictures either', () => {
    const html = render([view('standalone-two', null, true)], 'ar');
    expect(html).toContain('نتيجة بلا مقال');
    expect(html).not.toContain('/blogs/');
    expect(html).not.toContain('aria-label="تكبير');
  });

  it('is read by a screen reader in Arabic, with the same two halves', () => {
    const arabic = render([view('one-pair', { before: '/uploads/before-a.jpg', after: '/uploads/after-a.jpg' })], 'ar');
    expect(arabic).toContain('قبل');
    expect(arabic).toContain('بعد');
    expect(arabic).toContain('وصف الصورتين');
  });
});
