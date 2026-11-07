/**
 * P1-A4 — the article editor previews the whole page, and previews the *draft*.
 *
 * The brief asked for a live preview identical to the public page, table of contents included.
 * The console already had a card it paints itself (`src/lib/console/preview.ts`), which is right
 * for an offer and is a second implementation of a page the site already draws — a second TOC,
 * a second FAQ reading, a second idea of what a CTA block is. So the frame points at a route,
 * exactly as the service preview does, and the route hands over the site's own components.
 *
 * Five claims are load-bearing, and each is checked where it is actually made:
 *
 *   - **identical, not similar.** For a row whose draft and published copy agree,
 *     `getDraftArticle()` returns the *same object* `getPost()` returns — deep equal, field for
 *     field. That is the whole argument: one reader, one excerpt rule, one sanitizer, so the
 *     frame cannot drift from the page it is pretending to be.
 *   - **the draft, not the twin.** Publish, then edit: the preview shows this minute's words and
 *     the public page keeps last month's until somebody presses Publish.
 *   - **the TOC and the blocks come from the same pass.** `prepareArticleBody()` gives the
 *     headings their ids, the FAQ pairs their questions and the CTA its variant, so the contents
 *     list, the anchors and the FAQPage JSON-LD are one reading rather than three guesses.
 *   - **a preview is not a public page.** It needs a console session that may read articles in
 *     *that language*, it tells crawlers to stay out, and it paints its notice across the top.
 *     A wrong id, a foreign kind, a trashed row and an ungranted language all answer 404.
 *   - **no console CSS.** The document is the site's own.
 *
 * No real clinic wording, no prices, no photographs: every fixture is obviously test copy.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Grant } from '../src/lib/auth/permissions';
import type { StoreResult } from '../src/lib/content/store';

const signals = vi.hoisted(() => ({ notFound: 0, path: '/en/preview/articles/x' }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    signals.notFound += 1;
    throw new Error('signal: not-found');
  },
  redirect: (href: string) => {
    throw new Error(`signal: redirect ${href}`);
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => signals.path,
  useSearchParams: () => new URLSearchParams(),
}));

/** The session the route sees, one test at a time — the route's own gate, not a stand-in for it. */
const view = vi.hoisted(() => ({ auth: null as unknown }));
vi.mock('@/lib/console/server', () => ({ consoleView: async () => ({ auth: view.auth, prefs: { locale: 'en', theme: 'light' } }) }));

// `next/root-params` is a compiler placeholder: `next build` rewrites it and a node render has
// no root parameters.
vi.mock('next/root-params', () => ({ lang: async () => 'ar' }));

const { previewableArticle } = await import('../src/lib/console/content-screen');
const { db, destroyDb } = await import('../src/lib/db');
const { assertTestDb } = await import('../src/lib/db/guard');
const { createRow, saveDraft, setTrashed } = await import('../src/lib/content/store');
const { publishRow } = await import('../src/lib/content/publish');
const { draftRow } = await import('../src/lib/content/published');
const { getDraftArticle, getPost } = await import('../src/lib/content/site');
const { prepareArticleBody } = await import('../src/lib/content/article-body');
const PreviewPage = (await import('../src/app/[lang]/preview/articles/[id]/page')).default;
const { generateMetadata } = await import('../src/app/[lang]/preview/articles/[id]/page');
const { LanguageProvider } = await import('../src/context/LanguageContext');
const { BookingProvider } = await import('../src/context/BookingContext');

const editorSource = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');
const routeSource = readFileSync(join(process.cwd(), 'src', 'app', '[lang]', 'preview', 'articles', '[id]', 'page.tsx'), 'utf8');
const publicSource = readFileSync(join(process.cwd(), 'src', 'app', '[lang]', 'blogs', '[slug]', 'page.tsx'), 'utf8');

/** Everything this run writes is named with it, so the cleanup can be exact. */
const run = randomUUID().slice(0, 8);
const keyOf = (name: string): string => `artprev-${run}-${name}`;
const actor = { id: randomUUID(), email: `artprev-${run}@example.invalid` };

const READ_ARTICLES: Grant[] = [{ resource: 'article', action: 'read', scope: null }];
const READ_ARABIC_ONLY: Grant[] = [{ resource: 'article', action: 'read', scope: { locales: ['ar'] } }];

function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

/** A body carrying every block the brief names, plus the markup a preview must never print.
 *  The headings stay Arabic in both languages, as the imported corpus's do: an address that
 *  transliterates them is the thing the TOC must not produce. */
const body = (paragraph: string): string =>
  [
    '<h2>القسم الأول</h2>',
    `<p>${paragraph} with <strong>bold</strong> words.</p>`,
    '<h3>تفصيل أصغر</h3>',
    '<p>Another paragraph.</p>',
    '<section data-block="faq"><h3>سؤال الاختبار؟</h3><div data-faq-answer><p>جواب الاختبار</p></div></section>',
    '<section data-block="cta" data-cta="consult"></section>',
    '<table><thead><tr><th>عمود</th></tr></thead><tbody><tr><td>خلية</td></tr></tbody></table>',
    '<script>bad()</script>',
  ].join('');

const BODY_AR = body('فقرة منشورة');
const BODY_EN = body('A published paragraph');
const BODY_EN_EDITED = body('An edited paragraph, not published');

/** One locale's draft: `saveDraft` writes the named locale's column, so a field is a string. */
const AR_FIRST = { title: 'عنوان الاختبار', excerpt: 'سطر تمهيدي', content: BODY_AR, imageAlt: 'وصف الصورة' };
const EN_FIRST = { title: 'Test article', excerpt: 'A published teaser', content: BODY_EN, imageAlt: 'A test picture' };

let rowId = '';
let slug = '';
let neverPublishedId = '';
let trashedId = '';
let offerId = '';

async function versionOf(id: string): Promise<number> {
  const row = await db.selectFrom('articles').select('version').where('id', '=', id).executeTakeFirstOrThrow();
  return Number(row.version);
}

async function seed(name: string, ar: Record<string, string> = AR_FIRST, en: Record<string, string> = EN_FIRST): Promise<string> {
  const created = unwrap(await createRow('article', { key: keyOf(name), actorId: actor.id }), `create ${name}`);
  unwrap(
    await saveDraft('article', { id: created.id, locale: 'ar', fields: ar, expectedVersion: created.version, actorId: actor.id }),
    `save ar ${name}`,
  );
  unwrap(
    await saveDraft('article', { id: created.id, locale: 'en', fields: en, expectedVersion: await versionOf(created.id), actorId: actor.id }),
    `save en ${name}`,
  );
  return created.id;
}

beforeAll(async () => {
  assertTestDb();
  rowId = await seed('edited');
  slug = keyOf('edited');
  unwrap(await publishRow('article', { id: rowId, locales: ['ar', 'en'], actor }), 'publish');
  // The second write is what makes this suite worth running: after it the draft and the
  // published twin say different things, and only one of the two is on the site.
  unwrap(
    await saveDraft('article', {
      id: rowId,
      locale: 'en',
      fields: { content: BODY_EN_EDITED, excerpt: 'An edited teaser' },
      expectedVersion: await versionOf(rowId),
      actorId: actor.id,
    }),
    'save the draft',
  );

  // Never published: the article somebody most needs to preview, and the one `rung()` would
  // have hidden from a reader that asked "is anything of this kind live".
  neverPublishedId = await seed('unpublished');
  trashedId = await seed('trashed');
  unwrap(await setTrashed('article', { id: trashedId, trashed: true, actorId: actor.id }), 'trash');

  // An id that belongs to another table: the frame's address says `articles`, so a row found
  // under `offers` is not this page.
  const offer = unwrap(await createRow('offer', { key: keyOf('offer'), actorId: actor.id }), 'create offer');
  offerId = offer.id;
});

afterAll(async () => {
  const ids = await db.selectFrom('articles').select('id').where('slug', 'like', `artprev-${run}%`).execute();
  await db.deleteFrom('articles').where('slug', 'like', `artprev-${run}%`).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids.map((row) => row.id)).execute();
  await db.deleteFrom('offers').where('slug', 'like', `artprev-${run}%`).execute();
  await destroyDb();
});

/* ------------------------------------------------------------------ the reader itself --- */

describe('the preview reads the same article the public page reads', () => {
  it('is deep equal to getPost() while the draft and the published copy agree', async () => {
    // `neverPublishedId` has no twin to disagree with, so this is the cleanest statement of the
    // claim: one reader, two doors, the same object. A second implementation of the card — its
    // own excerpt rule, its own entity decoding, its own category name — would fail here.
    const fresh = await seed('identical');
    unwrap(await publishRow('article', { id: fresh, locales: ['ar', 'en'], actor }), 'publish the identical row');
    const draft = await getDraftArticle(fresh);
    const live = await getPost(keyOf('identical'));
    expect(live, 'the row is published, so the public reader answers').not.toBeNull();
    expect(draft).toEqual(live!.item);
  });

  it('reads the draft columns, not the published twins', async () => {
    const row = await draftRow('article', rowId);
    expect(row).not.toBeNull();
    const content = row!.values.content;
    expect(content.kind).toBe('bi');
    if (content.kind !== 'bi') return;
    expect(content.en).toContain('An edited paragraph, not published');
    expect(content.ar).toContain('فقرة منشورة');

    // The public reader still answers with last month's words, which is the disagreement the
    // preview exists to show.
    const live = await getPost(slug);
    expect(live!.item.content.en).toContain('A published paragraph');
    expect(live!.item.content.en).not.toContain('An edited paragraph');
  });

  it('previews an article that has never been published', async () => {
    const draft = await getDraftArticle(neverPublishedId);
    expect(draft).not.toBeNull();
    expect(draft!.title.en).toBe('Test article');
    // And the site does not serve it: the two questions are different, and both are answered.
    expect(await getPost(keyOf('unpublished'))).toBeNull();
  });

  it('refuses a row in the Trash, and an id that is not an article', async () => {
    expect(await draftRow('article', trashedId)).toBeNull();
    expect(await draftRow('article', randomUUID())).toBeNull();
    expect(await getDraftArticle(offerId)).toBeNull();
  });

  it('filters the markup it prints, through the same door the save uses', async () => {
    const draft = await getDraftArticle(rowId);
    expect(draft!.content.en).not.toContain('<script');
    expect(draft!.content.en).not.toContain('bad()');
    // The blocks survive it: they are the reason the preview is a page and not a card.
    expect(draft!.content.en).toContain('data-block="faq"');
    expect(draft!.content.en).toContain('data-block="cta"');
  });
});

/* ------------------------------------------------------------------------ the gate --- */

describe('the row a preview may read', () => {
  it('reads an article for a role that may read articles', async () => {
    const row = await previewableArticle(rowId, { grants: READ_ARTICLES, locale: 'en' });
    expect(row?.key).toBe(slug);
    expect(row?.trashed).toBe(false);
  });

  it('refuses a role with no read at all, and one scoped to the other language', async () => {
    expect(await previewableArticle(rowId, { grants: [], locale: 'en' })).toBeNull();
    // An Arabic-only editor may read the row and sees the Arabic tab; the English frame is a
    // language their grant does not reach.
    expect(await previewableArticle(rowId, { grants: READ_ARABIC_ONLY, locale: 'en' })).toBeNull();
    expect(await previewableArticle(rowId, { grants: READ_ARABIC_ONLY, locale: 'ar' })).not.toBeNull();
  });

  it('refuses a row in the Trash, and an id belonging to another kind', async () => {
    expect(await previewableArticle(trashedId, { grants: READ_ARTICLES, locale: 'en' })).toBeNull();
    expect(await previewableArticle(offerId, { grants: READ_ARTICLES, locale: 'en' })).toBeNull();
    expect(await previewableArticle(randomUUID(), { grants: READ_ARTICLES, locale: 'en' })).toBeNull();
  });
});

/* ----------------------------------------------------------------- the route rendered --- */

/** The providers the site layout paints around every page, so the client component renders. */
/* eslint-disable react/no-children-prop */
async function paint(id: string, lang: 'ar' | 'en', auth: unknown): Promise<string> {
  view.auth = auth;
  signals.path = `/${lang}/preview/articles/${id}`;
  const element = await PreviewPage({ params: Promise.resolve({ lang, id }) });
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      children: createElement(BookingProvider, { branches: [], treatments: [], specialists: [], children: element }),
    }),
  );
}
/* eslint-enable react/no-children-prop */

const SESSION = { user: { id: actor.id, grants: READ_ARTICLES } };

describe('the route paints the public page under a draft notice', () => {
  it('renders the draft, its table of contents and its blocks through the site’s own components', async () => {
    const markup = await paint(rowId, 'en', SESSION);
    expect(markup).toContain('data-draft-preview="article"');
    expect(markup).toContain('Draft preview');
    expect(markup).toContain('An edited paragraph, not published');
    expect(markup).toContain('Test article');

    // The TOC is the brief's own requirement, and it is the site's nav — not a list the
    // console invented. Both variants are painted: the fold at phone, the aside at desktop.
    expect(markup).toContain('article-toc');
    expect(markup).toContain('In this article');
    const prepared = prepareArticleBody((await getDraftArticle(rowId))!.content.en);
    expect(prepared.toc.length).toBeGreaterThan(0);
    for (const entry of prepared.toc) {
      // The link percent-encodes the id while the heading keeps its Arabic letters: the address
      // a person reads is the author's, the one the browser is handed is a valid URI.
      expect(markup, `the contents list links to ${entry.id}`).toContain(`href="#${encodeURIComponent(entry.id)}"`);
      expect(markup, `the heading carries ${entry.id}`).toContain(`id="${entry.id}"`);
    }

    // The FAQ pair is collapsible and the CTA is the site's booking box, never a typed number.
    expect(markup).toContain('article-faq');
    expect(markup).toContain('<details');
    expect(markup).toContain('article-cta');
  });

  it('says it in Arabic when asked for the Arabic tab, and keeps Arabic heading addresses', async () => {
    const markup = await paint(rowId, 'ar', SESSION);
    expect(markup).toContain('معاينة مسودة');
    expect(markup).not.toContain('Draft preview');
    expect(markup).toContain('في هذا المقال');
    expect(markup).toContain('سؤال الاختبار؟');
    // An address that transliterates `القسم` to `alqsm` is read by nobody and typed by nobody.
    const prepared = prepareArticleBody((await getDraftArticle(rowId))!.content.ar);
    expect(prepared.toc.some((entry) => /[\u0600-\u06FF]/.test(entry.id))).toBe(true);
  });

  it('speaks the FAQPage structured data the public page speaks', async () => {
    const markup = await paint(rowId, 'en', SESSION);
    expect(markup).toContain('FAQPage');
    expect(markup).toContain('سؤال الاختبار؟');
    // A body with no FAQ block claims none: an empty FAQPage node answers nothing.
    const bare = await seed('no-faq', { ...AR_FIRST, content: '<p>فقرة فقط</p>' }, { ...EN_FIRST, content: '<p>Only a paragraph</p>' });
    const plain = await paint(bare, 'en', SESSION);
    expect(plain).not.toContain('FAQPage');
  });

  it('carries no console class, because the frame is the site’s document', async () => {
    const markup = await paint(rowId, 'en', SESSION);
    expect(markup).not.toMatch(/console-/);
    expect(routeSource).not.toMatch(/import\s+['"][^'"]+\.css['"]/);
  });

  it('clears the site’s own fixed header, so the words saying “draft” are never the hidden part', () => {
    expect(routeSource).toMatch(
      /data-draft-preview="article"[\s\S]*?className="mt-\[calc\(69px-40px\)\][\s\S]*?lg:mt-\[calc\(108px-100px\)\]"/,
    );
  });

  it('answers 404 without a session, and 404 for a row it may not draw', async () => {
    const before = signals.notFound;
    await expect(paint(rowId, 'en', null)).rejects.toThrow('signal: not-found');
    await expect(paint(rowId, 'en', { user: { id: actor.id, grants: [] } })).rejects.toThrow('signal: not-found');
    await expect(paint(rowId, 'en', { user: { id: actor.id, grants: READ_ARABIC_ONLY } })).rejects.toThrow('signal: not-found');
    await expect(paint(trashedId, 'en', SESSION)).rejects.toThrow('signal: not-found');
    await expect(paint(offerId, 'en', SESSION)).rejects.toThrow('signal: not-found');
    await expect(paint(randomUUID(), 'en', SESSION)).rejects.toThrow('signal: not-found');
    expect(signals.notFound).toBe(before + 6);
  });

  it('draws an article that has never been published, because that is the one to look at', async () => {
    const markup = await paint(neverPublishedId, 'en', SESSION);
    expect(markup).toContain('data-draft-preview="article"');
    expect(markup).toContain('Test article');
  });

  it('tells crawlers to stay out, in both languages', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const meta = await generateMetadata({ params: Promise.resolve({ lang, id: rowId }) });
      expect(meta.robots).toBe('noindex,nofollow');
    }
    expect((await generateMetadata({ params: Promise.resolve({ lang: 'en', id: rowId }) })).title).toEqual({ absolute: 'Draft preview' });
  });
});

/* ------------------------------------------------------- one reading, not two copies --- */

describe('the preview and the public page are the same code', () => {
  it('hands the frame the same component, the same body pass and the same JSON-LD', () => {
    for (const line of [
      'JournalArticleClient',
      'prepareArticleBody',
      'articleToUI',
      'articleFaqJsonLd',
      'articleJsonLd',
      'breadcrumbJsonLd',
    ]) {
      expect(routeSource, `the preview imports ${line}`).toContain(line);
      expect(publicSource, `the public page imports ${line}`).toContain(line);
    }
    // The prepared pass is what feeds all three: segments to render, toc to announce, faqs to
    // speak. A preview that re-derived any of them would be a second reading.
    expect(routeSource).toMatch(/body=\{prepared\.segments\} toc=\{prepared\.toc\}/);
    expect(publicSource).toMatch(/body=\{prepared\.segments\} toc=\{prepared\.toc\}/);
    expect(routeSource).toMatch(/if \(prepared\.faqs\.length\)/);
  });

  it('does not ask the listing’s visibility switch, or the row’s publish state', () => {
    // An owner who hid `/blogs` still has to read the page they are writing, and the article
    // they most need to preview is the one they have never published.
    expect(routeSource).not.toContain('guardPage');
    expect(routeSource).not.toMatch(/status\s*===\s*'published'/);
    expect(routeSource).toContain("export const dynamic = 'force-dynamic'");
  });
});

/* ------------------------------------------------------------------- the editor frame --- */

describe('the editor points the frame at that route', () => {
  it('gives an article the site route, keyed to the row and reloaded by its version', () => {
    expect(editorSource).toMatch(/kind === 'article'/);
    expect(editorSource).toMatch(/localizedPath\(`\/preview\/articles\/\$\{row\.id\}`, locale\)\}\?v=\$\{row\.version\}/);
    // The service row keeps its own route and its own name check: a card kind is still a card.
    expect(editorSource).toMatch(/localizedPath\(`\/preview\/services\/\$\{row\.id\}`, locale\)\}\?v=\$\{row\.version\}/);
    expect(editorSource).toMatch(/listSchema\?\.key === 'services'/);
  });

  it('needs no headline to draw an article page, and refuses a trashed row', () => {
    // The public detail prints its own "Untitled", so the frame does too; the name check that
    // gates a service page does not gate this one.
    expect(editorSource).toMatch(/row === null \|\| row\.trashed/);
    const start = editorSource.indexOf("kind === 'article'");
    const articleBranch = editorSource.slice(start, editorSource.indexOf("listSchema?.key === 'services'", start));
    expect(articleBranch).toContain('/preview/articles/');
    expect(articleBranch).not.toContain('listDocTitle');
  });

  it("gives the page frame no sandbox, because it is the site's own route", () => {
    // The frame points at a first-party route the server sanitizes; its streamed scripts must
    // load unrefused (an opaque origin gets 403 on `/_next/static` in dev), so the sandbox
    // comes off entirely. The card frame keeps `sandbox=""` with no scripts and no origin.
    expect(editorSource).toMatch(/sandbox=\{draftHref \? undefined : ''\}/);
    expect(editorSource).not.toContain('allow-same-origin');
    expect(editorSource).not.toContain('allow-scripts');
  });
});
