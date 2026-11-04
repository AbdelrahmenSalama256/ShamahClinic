/**
 * AB-2 — the About page is its row's, not the code's.
 *
 * The defect this proves fixed was invisible from outside: `/about` rendered a hard-coded
 * document, `src/lib/wp/about.ts` read a WordPress snapshot, and the CMS row holding
 * `{"test":"value"}` was an unpublished draft the page never looked at. Three things had to
 * become true at once, and each is asserted here rather than promised in prose:
 *
 *  - **the seed is what the console writes.** `014_about_page_seed.sql` carries the document
 *    in the shape `parseListDoc(ABOUT, …)` produces, so opening the row and pressing save
 *    rewrites nothing. The test reads the literal out of the migration file, which is how an
 *    edit to either half is caught.
 *  - **a draft cannot reach a visitor.** The save is a real PATCH through the guarded content
 *    handler, with a real session, carrying the fields the console's own `fieldsFromForm()`
 *    builds from the typed form. The page is rendered between the save and the publish and
 *    still says what the published copy says.
 *  - **the component holds no words of its own.** Every sentence the page prints is asserted
 *    to arrive from the row in both languages, and the deleted fallbacks are asserted to stay
 *    deleted.
 *
 * Rows touched: `pages` where `id = 00000000-…-0001` and the `Owner` user this file creates.
 * The page row is left as the run found it — deleted if this file inserted it, its stored
 * document and status given back column-for-column if the migration had already seeded it.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { ABOUT, pageDocSchema, parseListDoc } from '../src/lib/content/list-schema';
import { getAboutPage, type AboutPage } from '../src/lib/content/about-page';
import { getBranchList, getClinicWords, getServiceCards } from '../src/lib/content/site';
import { getRow, idForRowKey, type ContentRow } from '../src/lib/content/store';
import { fieldsFromForm, formOf, listSchemaOfRow } from '../src/lib/console/editor-form';
import { sourceText } from './source-text';
import { contentActionHandler, contentItemHandler } from '../src/lib/content/api';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { loginHandler } from '../src/lib/auth/login';
import { syncRoles } from '../src/lib/auth/roles';
import { assignRole, createUser } from '../src/lib/auth/users';

// `revalidateSite()` swallows the throw a cache-less render produces, so the mock is what
// lets a test see that the invalidation happened rather than being silently eaten. The real
// module is a compiler placeholder outside `next build`, and `revalidatePath` is the only
// export this graph imports.
const revalidations: unknown[][] = [];
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => {
    revalidations.push(args);
  },
}));

// `useLanguage()` reads the locale off the path, and the page's links need a router. The mock
// is what lets a node render of these client components work at all.
let mockPath = '/ar/about';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => undefined,
  redirect: () => undefined,
}));

const { LanguageProvider } = await import('../src/context/LanguageContext');
const { ThemeProvider } = await import('../src/context/ThemeContext');
const { ClinicProvider } = await import('../src/context/ClinicContext');
const { AboutClient } = await import('../src/components/pages/AboutClient');

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-ab2-2026';
const email = `ab2-owner-${run}@example.invalid`;
const userIds: string[] = [];

/** The id `014_about_page_seed.sql` writes, so the migration and this file name one row. */
const ABOUT_ID = '00000000-0000-0000-0000-000000000001';
const MIGRATION = 'src/lib/db/migrations/014_about_page_seed.sql';

/** The document as the migration holds it: one literal, named once and written twice. */
function seedDocument(): Record<string, unknown> {
  const source = readFileSync(MIGRATION, 'utf8');
  const open = source.indexOf("SELECT '{");
  const close = source.lastIndexOf("' AS doc");
  if (open < 0 || close < open) throw new Error(`${MIGRATION} no longer carries its document as one literal`);
  return JSON.parse(source.slice(open + "SELECT '".length, close)) as Record<string, unknown>;
}

const SEED = seedDocument();
const text = (key: string): string => String(SEED[key] ?? '');
const list = (key: string): string[] => (SEED[key] as string[]) ?? [];

/** Headings the deleted `structuredOrDefault()` invented for blocks the row does not have. */
const INVENTED = ['رؤيتنا', 'مهمتنا', 'قيمنا الأساسية', 'شهادات معتمدة'];

let session = { token: '', csrf: '' };
let words: Awaited<ReturnType<typeof getClinicWords>>;
/** The stored twins as this file found them, so the run can only ever give them back. */
let prior: { data: string; pub_data: string; status: string } | null = null;
let thisFileInserted = false;

function write(method: 'PATCH' | 'POST', path: string, body: unknown): Promise<Response> {
  const req = new Request(`http://localhost/api/console/content${path}`, {
    method,
    headers: {
      cookie: `shamah_session=${session.token}`,
      [CSRF_HEADER]: session.csrf,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  });
  return path.endsWith('/publish') ? contentActionHandler(req) : contentItemHandler(req);
}

/** The stored columns, read as the database holds them — not through the reader under test. */
async function columns(): Promise<{ data: string; pub_data: string; status: string; version: number }> {
  const rows = (
    await sql<{ data: string; pub_data: string; status: string; version: number }>`
      SELECT CAST(data AS CHAR) AS data, CAST(pub_data AS CHAR) AS pub_data, status, version
      FROM pages WHERE id = ${ABOUT_ID}`.execute(db)
  ).rows;
  return rows[0];
}

/** The page as a visitor gets it, with the layout's own providers above it. */
async function published(): Promise<AboutPage> {
  const page = await getAboutPage();
  if (!page) throw new Error('the /about row answers no page at all');
  return page;
}

/*
 * React 19 types a provider's `children` as a required prop, and `createElement` will not
 * accept the third argument in its place, while the lint rule wants exactly the opposite.
 * The props form is the one that compiles, so the rule is silenced for the nest.
 */
/* eslint-disable react/no-children-prop */
function drawn(page: AboutPage, language: 'ar' | 'en'): string {
  mockPath = `/${language}/about`;
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      {
        children: createElement(ThemeProvider, {
          children: createElement(ClinicProvider, { value: words, children: createElement(AboutClient, { page }) }),
        }),
      },
    ),
  );
}

beforeAll(async () => {
  assertTestDb();

  prior = (
    await sql<{ data: string; pub_data: string; status: string }>`
      SELECT CAST(data AS CHAR) AS data, CAST(pub_data AS CHAR) AS pub_data, status
      FROM pages WHERE id = ${ABOUT_ID}`.execute(db)
  ).rows[0];
  if (!prior) {
    thisFileInserted = true;
    await db
      .insertInto('pages')
      .values({
        id: ABOUT_ID,
        route: '/about',
        title_ar: 'من نحن',
        title_en: 'About Shamah',
        pub_title_ar: 'من نحن',
        pub_title_en: 'About Shamah',
        content_ar: '',
        content_en: '',
        pub_content_ar: '',
        pub_content_en: '',
        data: json(SEED),
        pub_data: json(SEED),
        enabled: 1,
        status: 'published',
        published_at: new Date(),
      })
      .execute();
  }

  await syncRoles({ dryRun: false, database: readDbConfig().database });
  const roles = new Map((await db.selectFrom('roles').select(['id', 'name']).execute()).map((role) => [role.name, role.id]));
  const id = await createUser({ email, password: PASSWORD, name: `AB2 ${run}` });
  await assignRole(id, roles.get('Owner') ?? '');
  userIds.push(id);

  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const line = cookies.find((cookie) => cookie.startsWith('shamah_session='));
  if (!line) throw new Error('login did not set a session cookie');
  session = { token: decodeURIComponent(line.slice('shamah_session='.length).split(';')[0]), csrf: (await res.json()).csrfToken };

  // The call links are the layout's own, read the way the layout reads them, so the render
  // below is the page's and not the test's.
  words = await getClinicWords();
});

afterAll(async () => {
  if (thisFileInserted) {
    await db.deleteFrom('revisions').where('entity_id', '=', ABOUT_ID).execute();
    await db.deleteFrom('pages').where('id', '=', ABOUT_ID).execute();
  } else if (prior) {
    await sql`
      UPDATE pages SET data = ${prior.data}, pub_data = ${prior.pub_data}, status = ${prior.status}
      WHERE id = ${ABOUT_ID}`.execute(db);
  }
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await destroyDb();
});

describe('the seed is the shape the console writes', () => {
  it('parses clean and needs no repair', () => {
    const parsed = parseListDoc(ABOUT, SEED);
    expect(parsed.issues).toEqual([]);
    // A document the first save rewrites is a document the migration did not canonicalise.
    expect(parsed.doc).toEqual(SEED);
  });

  it('carries a value for every field the form draws', () => {
    const missing = ABOUT.fields
      .filter((field) => field.type !== 'children')
      .filter((field) => {
        if (field.type === 'list') return list(`${field.stem}_ar`).length === 0 && list(`${field.stem}_en`).length === 0;
        if (field.type === 'image') return text(field.stem) === '';
        return text(`${field.stem}_ar`) === '' && text(`${field.stem}_en`) === '';
      })
      .map((field) => field.stem);
    // Only the numbers block is empty on purpose: the two figures beside the story are
    // counted, and the third is the one claim the page already printed.
    expect(missing).toEqual(['numbersTitle', 'numbersLead']);
  });

  it('is the row the typed form knows, not a JSON box', async () => {
    const row = (await getRow('page', ABOUT_ID)) as ContentRow;
    expect(row).not.toBeNull();
    expect(pageDocSchema('/about')).toBe(ABOUT);
    expect(listSchemaOfRow(row)).toBe(ABOUT);
    const form = formOf(row, 'ar');
    expect(form.lead_ar).toBe(text('lead_ar'));
    expect(form['storyParagraphs_ar.1']).toBe(list('storyParagraphs_ar')[1]);
    expect(form['storyParagraphs_ar.2']).toBeUndefined();
    expect(form.heroImage).toBe(text('heroImage'));
  });

  it('opens its own door onto the shared editor', async () => {
    // The screen is eight lines, and a broken door fails one of two things: the route it
    // looks the row up by, or the editor it hands the row to. Both are asserted, and the
    // second one is asserted as a delegation — a second editor built for this page would
    // be a second place for the words to disagree with the row.
    expect(await idForRowKey('page', '/about')).toBe(ABOUT_ID);
    const screen = sourceText('src/app/(console)/console/(workspace)/pages/about/page.tsx');
    expect(screen).toContain('<ContentDetailScreen kind="page" id={id}');
    expect(screen).not.toMatch(/fallback|structuredOrDefault|ConsoleEditor/);
  });
});

describe('the reader answers from the published copy', () => {
  it('reads the row, not the code', async () => {
    const page = await published();
    expect(page.title.ar).toBe('من نحن');
    expect(page.hero?.src).toBe(text('heroImage'));
    expect(page.lead.ar).toBe(text('lead_ar'));
    expect(page.splits.map((split) => split.paragraphs.length)).toEqual([
      list('storyParagraphs_ar').length,
      list('processParagraphs_ar').length,
    ]);
    expect(page.splits[0]?.image?.alt.ar).toBe(text('storyAlt_ar'));
    expect(page.reasons.map((reason) => reason.ar)).toEqual(list('reasons_ar'));
    expect(page.values.map((value) => value.ar)).toEqual(list('values_ar'));
    // An empty block is no block at all.
    expect(page.numbers).toEqual([]);
  });

  it('counts the two figures it claims and takes the third from the row', async () => {
    const [page, branches, services] = await Promise.all([published(), getBranchList(), getServiceCards()]);
    expect(page.branchCount).toBe(branches.length);
    expect(page.treatmentCount).toBe(services.length);
    expect(page.staffValue.ar).toBe(text('staffValue_ar'));
  });
});

describe('an edit in the console cannot reach a visitor before it is published', () => {
  const DRAFT_LEAD = `${text('lead_ar')} — مسودة ${run}`;
  const DRAFT_PARAGRAPH = `فقرة مسودة ${run}`;

  it('saves the draft and leaves the published twin alone', async () => {
    const row = (await getRow('page', ABOUT_ID)) as ContentRow;
    const form = formOf(row, 'ar');
    form.lead_ar = DRAFT_LEAD;
    form['storyParagraphs_ar.2'] = DRAFT_PARAGRAPH;
    const parsed = fieldsFromForm(row, form);
    expect(parsed.issues).toEqual([]);

    revalidations.length = 0;
    const res = await write('PATCH', `/page/${ABOUT_ID}?locale=ar`, { fields: parsed.fields, version: row.version });
    expect(res.status).toBe(200);
    // A draft save is not a publish, so it must not purge what a visitor is reading.
    expect(revalidations).toEqual([]);

    const stored = await columns();
    const draft = JSON.parse(stored.data) as Record<string, unknown>;
    const publishedDoc = JSON.parse(stored.pub_data) as Record<string, unknown>;
    expect(draft.lead_ar).toBe(DRAFT_LEAD);
    expect((draft.storyParagraphs_ar as string[])[2]).toBe(DRAFT_PARAGRAPH);
    expect(publishedDoc.lead_ar).toBe(text('lead_ar'));
    expect((publishedDoc.storyParagraphs_ar as string[]).length).toBe(list('storyParagraphs_ar').length);

    // Not just the columns: the page a visitor would be handed still says the published words.
    const page = await published();
    expect(page.lead.ar).toBe(text('lead_ar'));
    expect(page.splits[0]?.paragraphs.map((paragraph) => paragraph.ar)).toEqual(list('storyParagraphs_ar'));
    expect(drawn(page, 'ar')).not.toContain(DRAFT_PARAGRAPH);
  });

  it('publishes through the same door and the page answers with the new words', async () => {
    revalidations.length = 0;
    const res = await write('POST', `/page/${ABOUT_ID}/publish`, { locales: ['ar'] });
    expect(res.status).toBe(200);
    expect(revalidations).toContainEqual(['/[lang]', 'layout']);
    expect(revalidations).toContainEqual(['/sitemap.xml', 'page']);

    const stored = await columns();
    expect(stored.status).toBe('published');
    expect(stored.pub_data).toBe(stored.data);
    expect((JSON.parse(stored.pub_data) as Record<string, unknown>).lead_ar).toBe(DRAFT_LEAD);

    const page = await published();
    expect(page.lead.ar).toBe(DRAFT_LEAD);
    expect(page.splits[0]?.paragraphs.map((paragraph) => paragraph.ar)).toEqual([...list('storyParagraphs_ar'), DRAFT_PARAGRAPH]);
    // The English half of a bilingual field survives an Arabic-only publish.
    expect(page.lead.en).toBe(text('lead_en'));
    expect(drawn(page, 'ar')).toContain(DRAFT_LEAD);
  });
});

describe('the page renders what the row says', () => {
  it('prints the published Arabic, and nothing the code invented', async () => {
    const markup = drawn(await published(), 'ar');
    expect(markup).toContain(text('storyTitle_ar'));
    for (const paragraph of list('processParagraphs_ar')) expect(markup).toContain(paragraph);
    for (const reason of list('reasons_ar')) expect(markup).toContain(reason);
    for (const value of list('values_ar')) expect(markup).toContain(value);
    expect(markup).toContain(text('heroAlt_ar'));
    // The blocks the deleted fallback manufactured are still absent, because the row leaves
    // them empty and an empty block is not drawn.
    for (const word of INVENTED) expect(markup).not.toContain(word);
  });

  it('prints the published English on the English path', async () => {
    const markup = drawn(await published(), 'en');
    expect(markup).toContain(text('lead_en'));
    expect(markup).toContain(text('storyTitle_en'));
    for (const paragraph of list('processParagraphs_en')) expect(markup).toContain(paragraph);
    for (const reason of list('reasons_en')) expect(markup).toContain(reason);
  });

  it('draws the counted figures and the owner’s third', async () => {
    const [page, branches, services] = await Promise.all([published(), getBranchList(), getServiceCards()]);
    const markup = drawn(page, 'en');
    expect(markup).toContain(`>${branches.length}<`);
    expect(markup).toContain(`>${services.length}<`);
    expect(markup).toContain(text('staffValue_en'));
  });
});

describe('the readers that made this a page of code stay gone', () => {
  it('has no WordPress About reader', () => {
    expect(existsSync('src/lib/wp/about.ts')).toBe(false);
    expect(readFileSync('src/lib/content/site.ts', 'utf8')).not.toContain('getAbout');
  });

  it('has no hard-coded document behind the component', () => {
    const component = readFileSync('src/components/pages/AboutClient.tsx', 'utf8');
    expect(component).not.toContain('structuredOrDefault');
    expect(component).not.toContain('aboutFallback');
    expect(component).not.toContain(text('lead_ar').slice(0, 40));
    expect(component).not.toContain(list('storyParagraphs_ar')[0].slice(0, 40));

    const route = readFileSync('src/app/[lang]/about/page.tsx', 'utf8');
    // The route reads through the contract, so it never names a draft column at all.
    expect(route).not.toContain('pub_data');
    expect(route).not.toContain('selectFrom');
    expect(route).toContain('getAboutPage');

    const data = readFileSync('src/data/about.ts', 'utf8');
    expect(data).not.toContain('aboutFallback');
    expect(data).not.toContain('AboutStructuredData');
  });
});
