/**
 * B4d — the service editor previews the whole page, and previews the *draft*.
 *
 * The brief asked for a live preview of the public service page inside the existing frame,
 * faithful to the real components, with desktop and mobile widths, and asked in the same
 * breath that no console CSS reach it and that a draft never be mistaken for what the site
 * serves. This site already had one preview that satisfies none of that for a service: the
 * card `src/lib/console/preview.ts` paints, which is right for a result case and is a second
 * implementation of a page the site already draws. So the frame now points at a route.
 *
 * Four claims are load-bearing, and each is checked where it is actually made:
 *
 *   - **the draft, not the twin.** The route reads `draftJson`, so a row published last month
 *     and edited this minute previews this minute — and the public page keeps its own words
 *     until somebody presses Publish. That disagreement is the feature: the preview is what
 *     publishing *would* serve.
 *   - **the same doors.** A draft goes out through `withPublishedBody`, the filter
 *     `../content/rich.ts` calls the second door, so a preview cannot print markup the save
 *     would have refused — or withhold the dashboard body a published page gets.
 *   - **a preview is not a public page.** It needs a console session that may read the
 *     services list, it tells crawlers to stay out, and it paints its notice across the top.
 *     A wrong id, a foreign list, a trashed row and a nameless draft all answer 404.
 *   - **no console CSS.** The document is the site's own, so the console's classes have no
 *     business in it; the frame carries the site's stylesheet and nothing else.
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

const signals = vi.hoisted(() => ({ notFound: 0, path: '/en/services/preview' }));
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
// no root parameters. The route only asks it to normalise its own `[lang]` segment.
vi.mock('next/root-params', () => ({ lang: async () => 'ar' }));

const { catalogFor } = await import('../src/lib/console/messages');
const { previewableRow } = await import('../src/lib/console/content-screen');
const { db, destroyDb } = await import('../src/lib/db');
const { assertTestDb } = await import('../src/lib/db/guard');
const { createRow, saveDraft, setTrashed } = await import('../src/lib/content/store');
const { publishRow } = await import('../src/lib/content/publish');
const { getDraftServicePage } = await import('../src/lib/content/service-page');
const { serviceDraftOfDoc } = await import('../src/lib/wp/treatments');
const PreviewPage = (await import('../src/app/[lang]/preview/services/[id]/page')).default;
const { generateMetadata } = await import('../src/app/[lang]/preview/services/[id]/page');
const { LanguageProvider } = await import('../src/context/LanguageContext');
const { BookingProvider } = await import('../src/context/BookingContext');

const ar = catalogFor('ar');
const en = catalogFor('en');
const editorSource = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');
const routeSource = readFileSync(join(process.cwd(), 'src', 'app', '[lang]', 'preview', 'services', '[id]', 'page.tsx'), 'utf8');
const consoleCss = readFileSync(join(process.cwd(), 'src', 'app', '(console)', 'console', 'console.css'), 'utf8');

/** Everything this run writes is named with it, so the cleanup can be exact. */
const run = randomUUID().slice(0, 8);
const keyOf = (name: string): string => `svcprev-${run}-${name}`;
const actor = { id: randomUUID(), email: `svcprev-${run}@example.invalid` };

const READ_EVERYTHING: Grant[] = [{ resource: 'list', action: 'read', scope: null }];
const READ_OTHER_LIST: Grant[] = [{ resource: 'list', action: 'read', scope: { lists: ['results'] } }];

const bi = (arText: string, enText: string) => ({ ar: arText, en: enText });

function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

async function ensureList(listKey: string): Promise<void> {
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto('lists')
    .values({ id: randomUUID(), list_key: listKey, label: listKey, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: 0 })
    .execute();
}

/** A service row written through the store, in the shape the console's own form saves it.
 *  `saveDraft` flattens each `{ ar, en }` stem into the `stem_ar` / `stem_en` columns, so the
 *  row it lands on the database in is the row `serviceOfDoc` reads back. */
async function seedService(name: string, doc: Record<string, unknown>): Promise<string> {
  const created = unwrap(await createRow('list_item', { key: keyOf(name), listKey: 'services', actorId: actor.id }), `create ${name}`);
  unwrap(
    await saveDraft('list_item', { id: created.id, locale: 'en', fields: { data: doc, position: 0, enabled: true }, expectedVersion: created.version, actorId: actor.id }),
    `save ${name}`,
  );
  return created.id;
}

/** The row `beforeAll` writes: published once, then edited, so draft and twin disagree. */
const PUBLISHED_FIRST = {
  name: bi('خدمة اختبار', 'Test service'),
  intro: bi('سطر أول', 'The first line'),
  description: '<p>A published description</p>',
};
const DRAFT_SECOND = { ...PUBLISHED_FIRST, intro: bi('سطر ثانٍ', 'The second line, not published') };

let rowId = '';
let namelessId = '';

async function versionOf(id: string): Promise<number> {
  const row = await db.selectFrom('list_items').select('version').where('id', '=', id).executeTakeFirstOrThrow();
  return Number(row.version);
}

beforeAll(async () => {
  assertTestDb();
  await ensureList('services');
  await ensureList('results');
  rowId = await seedService('edited', PUBLISHED_FIRST);
  unwrap(await publishRow('list_item', { id: rowId, locales: ['en'], actor }), 'publish');
  // The second write is what makes this suite worth running: after it the row's draft and
  // its published twin say different things, and only one of the two is on the site.
  unwrap(
    await saveDraft('list_item', { id: rowId, locale: 'en', fields: { data: DRAFT_SECOND, position: 0, enabled: true }, expectedVersion: await versionOf(rowId), actorId: actor.id }),
    'save the draft',
  );
  // A row created and never written has no name to draw a page with. The console refuses to
  // save one, so this is the only way the state reaches the route — and it answers 404.
  namelessId = unwrap(await createRow('list_item', { key: keyOf('nameless'), listKey: 'services', actorId: actor.id }), 'create the nameless row').id;
  const disposable = await seedService('trashed', PUBLISHED_FIRST);
  unwrap(await setTrashed('list_item', { id: disposable, trashed: true, actorId: actor.id }), 'trash');
});

afterAll(async () => {
  const ids = await db.selectFrom('list_items').select('id').where('uid', 'like', `svcprev-${run}%`).execute();
  await db.deleteFrom('list_items').where('uid', 'like', `svcprev-${run}%`).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids.map((row) => row.id)).execute();
  await destroyDb();
});

/* ------------------------------------------------------------------ the reader itself --- */

describe('a draft is read as the page it would publish', () => {
  it('filters the markup it prints, whichever rung wrote the row', async () => {
    const page = await serviceDraftOfDoc(
      { name: bi('خدمة', 'Service'), description: '<p>Kept</p><script>bad()</script>', body: { ar: '', en: '<p>Body <img src=x onerror=bad()></p>' } },
      keyOf('doors'),
    );
    expect(page?.description.en).toContain('<p>Kept</p>');
    expect(page?.description.en).not.toContain('script');
    expect(page?.body.en).toContain('Body');
    expect(page?.body.en).not.toContain('onerror');
  });

  it('answers nothing for a row with no name in either language', async () => {
    // The route reads this as a 404, which is why the editor only switches frames once the
    // saved document has a name — and why one language is enough, exactly as on the site.
    expect(await serviceDraftOfDoc({ intro: bi('سطر', 'A line') }, keyOf('nameless'))).toBeNull();
    expect(await serviceDraftOfDoc({ name_en: 'English only' }, keyOf('one-name'))).not.toBeNull();
  });
});

/* ------------------------------------------------------------------------ the gate --- */

describe('the row a preview may read', () => {
  it('reads a services row for a role that may read the list', async () => {
    const row = await previewableRow(rowId, { grants: READ_EVERYTHING, listKey: 'services' });
    expect(row?.key).toBe(keyOf('edited'));
    expect(row?.trashed).toBe(false);
  });

  it('refuses a role whose read is scoped to another list, and one with no read at all', async () => {
    expect(await previewableRow(rowId, { grants: READ_OTHER_LIST, listKey: 'services' })).toBeNull();
    expect(await previewableRow(rowId, { grants: [], listKey: 'services' })).toBeNull();
  });

  it('refuses a row that is not in the list the screen asked about', async () => {
    // The frame's address names `services`; a row found under another list is not this page.
    expect(await previewableRow(rowId, { grants: READ_EVERYTHING, listKey: 'results' })).toBeNull();
  });

  it('refuses a row in the Trash, because its owner has to restore it first', async () => {
    const trashed = await db.selectFrom('list_items').select('id').where('uid', '=', keyOf('trashed')).executeTakeFirstOrThrow();
    expect(await previewableRow(String(trashed.id), { grants: READ_EVERYTHING, listKey: 'services' })).toBeNull();
  });

  it('refuses an id that is not a services row at all', async () => {
    expect(await previewableRow(randomUUID(), { grants: READ_EVERYTHING, listKey: 'services' })).toBeNull();
  });
});

/* --------------------------------------------------------------------- the page read --- */

describe('the preview reads the draft while the site keeps its twin', () => {
  it('draws the words that were never published, from the column the route reads', async () => {
    const row = await previewableRow(rowId, { grants: READ_EVERYTHING, listKey: 'services' });
    const data = row!.fields.data!;
    // The store's own pair, so the disagreement is on the record before anything renders it.
    // Both columns are the flattened document the store wrote — `{ ar, en }` in, `stem_locale`
    // out — which is the same shape the site's own reader accepts.
    expect(data.draftJson).toMatchObject({ intro_en: 'The second line, not published', intro_ar: 'سطر ثانٍ' });
    expect(data.pubJson).toMatchObject({ intro_en: 'The first line' });

    const draft = await getDraftServicePage(data.draftJson as Record<string, unknown>, row!.key);
    expect(draft?.content.intro.en).toBe('The second line, not published');
    expect(draft?.content.intro.ar).toBe('سطر ثانٍ');
    // The published column through the same reader is what the site serves today, and the
    // frame would be a lie if it drew this instead of the draft above.
    const asPublished = await getDraftServicePage(data.pubJson as Record<string, unknown>, row!.key);
    expect(asPublished?.content.intro.en).toBe('The first line');
  });

  it('keeps the references the site publishes, so a preview is not a private universe', async () => {
    const row = await previewableRow(rowId, { grants: READ_EVERYTHING, listKey: 'services' });
    const page = await getDraftServicePage(row!.fields.data!.draftJson as Record<string, unknown>, row!.key);
    expect(page?.sections.length).toBeGreaterThan(0);
    expect(page?.sections.map((section) => section.key)).toContain('overview');
  });
});

/* ----------------------------------------------------------------- the route rendered --- */

/** The providers the site layout paints around every page, so the client component renders. */
/* eslint-disable react/no-children-prop */
async function paint(id: string, lang: 'ar' | 'en', auth: unknown): Promise<string> {
  view.auth = auth;
  signals.path = `/${lang}/preview/services/${id}`;
  const element = await PreviewPage({ params: Promise.resolve({ lang, id }) });
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      children: createElement(BookingProvider, { branches: [], treatments: [], specialists: [], children: element }),
    }),
  );
}
/* eslint-enable react/no-children-prop */

describe('the route paints the public page under a draft notice', () => {
  it('renders the draft through the site’s own components', async () => {
    const markup = await paint(rowId, 'en', { user: { id: actor.id, grants: READ_EVERYTHING } });
    expect(markup).toContain('data-draft-preview="services"');
    expect(markup).toContain('Draft preview');
    expect(markup).toContain('The second line, not published');
    expect(markup).toContain('Test service');
    // The public page's own furniture, not a card the console invented.
    expect(markup).toContain('About this treatment');
  });

  it('says it in Arabic when asked for the Arabic tab', async () => {
    const markup = await paint(rowId, 'ar', { user: { id: actor.id, grants: READ_EVERYTHING } });
    expect(markup).toContain('معاينة مسودة');
    expect(markup).not.toContain('Draft preview');
    expect(markup).toContain('سطر ثانٍ');
  });

  it('carries no console class, because the frame is the site’s document', async () => {
    const markup = await paint(rowId, 'en', { user: { id: actor.id, grants: READ_EVERYTHING } });
    expect(markup).not.toMatch(/console-/);
    // The notice is written with the site's utilities, so it adds nothing to `globals.css`
    // either — and the route imports no stylesheet of its own.
    expect(routeSource).not.toMatch(/import\s+['"][^'"]+\.css['"]/);
  });

  it('clears the site’s own fixed header, so the words saying “draft” are never the hidden part', () => {
    // `SiteShell` gives `<main>` 40px at phone and 100px at desktop while `Navbar` is 69 and 108
    // tall, so anything flush to the top of the page paints behind the header’s glass. Every
    // section of a real page carries its own padding and never notices; this sentence is the one
    // flush element on the route, and losing its first line behind a translucent bar would remove
    // the only thing telling an owner — or a screenshot — that the page is not live.
    expect(routeSource).toMatch(
      /data-draft-preview="services"[\s\S]*?className="mt-\[calc\(69px-40px\)\][\s\S]*?lg:mt-\[calc\(108px-100px\)\]"/,
    );
  });

  it('answers 404 without a session, and 404 for a row it may not draw', async () => {
    const before = signals.notFound;
    await expect(paint(rowId, 'en', null)).rejects.toThrow('signal: not-found');
    await expect(paint(rowId, 'en', { user: { id: actor.id, grants: [] } })).rejects.toThrow('signal: not-found');
    // A row created and never named: the reader has nothing to build a page from, so the
    // frame would show a 404 — which is why the editor keeps the card until a name is saved.
    await expect(paint(namelessId, 'en', { user: { id: actor.id, grants: READ_EVERYTHING } })).rejects.toThrow('signal: not-found');
    expect(signals.notFound).toBe(before + 3);
  });

  it('tells crawlers to stay out, in both languages', async () => {
    for (const lang of ['ar', 'en'] as const) {
      const meta = await generateMetadata({ params: Promise.resolve({ lang, id: rowId }) });
      expect(meta.robots).toBe('noindex,nofollow');
    }
    // The title is the page's only other claim about itself, and it makes no medical one.
    expect((await generateMetadata({ params: Promise.resolve({ lang: 'en', id: rowId }) })).title).toEqual({ absolute: 'Draft preview' });
  });
});

/* ------------------------------------------------------------------- the editor frame --- */

describe('the editor points the frame at that route', () => {
  it('gives a services row the site route, keyed to the row and reloaded by its version', () => {
    expect(editorSource).toMatch(/listSchema\?\.key === 'services'/);
    expect(editorSource).toMatch(/localizedPath\(`\/preview\/services\/\$\{row\.id\}`, locale\)\}\?v=\$\{row\.version\}/);
    // Only the saved document decides: the route reads the database, so a name that exists
    // only in this browser would be answered by a 404 inside the frame.
    expect(editorSource).toMatch(/listDocTitle\(listSchema, listDocFromForm\(listSchema, savedForm\)\.doc, locale\)/);
  });

  it('gives the page frame the site route un-sandboxed, keeps the card frame sandboxed', () => {
    // The page frame points at a first-party route the server sanitizes, so it loads freed of
    // any sandbox (an opaque origin is refused the chunks that stream the page in dev). The
    // card frame keeps `sandbox=""`: no scripts, and no `<script>` pasted into a body can
    // reach the document holding the session.
    expect(editorSource).toMatch(/sandbox=\{draftHref \? undefined : ''\}/);
    expect(editorSource).toMatch(/src=\{draftHref \?\? undefined\}/);
    expect(editorSource).toMatch(/srcDoc=\{draftHref \? undefined : previewSrc\}/);
  });

  it('offers both widths and an address to open, and says so in both catalogues', () => {
    for (const key of ['content.preview.page', 'content.preview.desktop', 'content.preview.mobile', 'content.preview.open_draft', 'content.preview.needs_name'] as const) {
      expect(ar[key], key).toBeTruthy();
      expect(en[key], key).toBeTruthy();
      expect(ar[key]).not.toBe(en[key]);
    }
    expect(editorSource).toMatch(/data-viewport=\{viewport\}/);
    expect(editorSource).toMatch(/aria-pressed=\{viewport === 'wide'\}/);
    expect(editorSource).toMatch(/aria-pressed=\{viewport === 'phone'\}/);
  });

  it('lays the page out at a real width and scales it into the rail', () => {
    /* The rail is about 25rem whichever way the window is opened, so a frame sized to the rail
       is a phone-sized document at both settings — a "desktop" preview would be the mobile
       layout with wider margins, which is the one thing a preview must never be. The frame is
       therefore laid out at a device width and shrunk to fit, and the number it is laid out at
       is what the site's own breakpoints read. */
    expect(editorSource).toMatch(/const PREVIEW_LAYOUTS = \{ wide: 1280, phone: 390 \} as const;/);
    expect(editorSource).toMatch(/Math\.min\(1, stageWidth \/ previewLayout\)/);
    expect(editorSource).toMatch(/inlineSize: `\$\{previewLayout\}px`/);
    expect(editorSource).toMatch(/blockSize: `\$\{Math\.round\(railHeight \/ previewScale\)\}px`/);
    expect(editorSource).toMatch(/transform: `scale\(\$\{previewScale\}\)`/);
    // Measured, because the rail is not a constant: it moves with the window and the sheet.
    expect(editorSource).toMatch(/new ResizeObserver\(measure\)/);
    // The stage clips what the scale leaves outside it, and the scale runs from that corner.
    expect(consoleCss).toMatch(/\.console-preview-stage \{[^}]*overflow: hidden;/);
    expect(consoleCss).toMatch(/\.console-preview-stage \.console-preview-frame \{\s*transform-origin: top left;/);
    // The two widths are a page's question; a card is one box at any width.
    expect(editorSource).toMatch(/draftHref !== null && \(\s*<div className="console-controls">/);
    // The frame is the site's page: nothing here may paint a `--c-*` token onto it.
    expect(consoleCss).not.toMatch(/\.console-preview-stage[^{]*\{[^}]*var\(--(?!c-)[a-z]/);
  });
});
