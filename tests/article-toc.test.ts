/**
 * The article body becomes addresses a reader can use.
 *
 * Three pieces have to agree about one thing — the heading's id — and the page breaks
 * in exactly that place when they do not: the markup the server printed, the table of
 * contents beside it, and the link in the address bar. So the suite is built around
 * the fixtures in `tests/fixtures/wp-articles.json`, which are two real WordPress rows
 * rather than a tidy example: the corpus that arrives carries an `h1` that repeats the
 * title, tables wrapped in `<figure>`, lists with a `start`, and Arabic headings whose
 * transliteration would be unreadable.
 *
 * Four properties:
 *
 * **The id keeps the script it was written in.** `ليزر` becomes `ليزر`, not `lyzr`:
 * a visitor copies what they can read, and a search engine follows what a person typed.
 *
 * **The TOC is the body's own H2/H3, in order, with no repeats.** Two identical
 * headings get `-2`; an id the author set by hand is kept; an empty heading is not an
 * entry; an `h4` is addressable but does not clutter the list.
 *
 * **The FAQ and CTA blocks are structure, not markup.** A `<section data-block="faq">`
 * leaves the prose stream as a question and an answer, and `data-block="cta"` as a
 * variant the page renders with the clinic's own numbers.
 *
 * **The sanitizer still owns the allowlist.** The pipeline adds nothing a person can
 * type, and what it does add — heading ids, a table's scroll wrapper — is generated,
 * never taken from the stored document.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { prepareArticleBody } from '@/lib/content/article-body';
import { slugify, uniqueSlug } from '@/lib/slug';
import { sanitizeHtmlBody } from '@/lib/wp/sanitize';

interface Fixture {
  slug: string;
  html: string;
}

const fixturesPath = fileURLToPath(new URL('./fixtures/wp-articles.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')).articles as Fixture[];

/** The two Arabic ids a repeated heading produces, in order. */
function idsOf(toc: Array<{ id: string }>): string[] {
  return toc.map((entry) => entry.id);
}

describe('slugify', () => {
  it('keeps Arabic letters and folds the letters that have one common shape', () => {
    expect(slugify('ما هو الديرما بن؟')).toBe('ما-هو-الديرما-بن');
    expect(slugify('إلى أين')).toBe('الي-اين');
    expect(slugify('الكهربائية')).toBe('الكهرباييه');
    expect(slugify('سعيد')).toBe('سعيد');
  });

  it('keeps Latin and digits, so an English heading is addressable too', () => {
    expect(slugify('Derma Pen with Mesotherapy 3-in-1')).toBe('derma-pen-with-mesotherapy-3-in-1');
  });

  it('drops punctuation, diacritics and surrounding space instead of encoding them', () => {
    expect(slugify('  ليزر — فراكشنال  ')).toBe('ليزر-فراكشنال');
    expect(slugify('لَيْزَر')).toBe('ليزر');
    expect(slugify('«عناية» بالبشرة!')).toBe('عنايه-بالبشره');
  });

  it('returns nothing when no letter survives, so the caller decides', () => {
    expect(slugify('— • … ')).toBe('');
  });

  it('numbers a repeated base rather than dropping it', () => {
    const taken = new Set<string>();
    const first = uniqueSlug('عناية', taken);
    taken.add(first);
    const second = uniqueSlug('عناية', taken);
    taken.add(second);
    expect([first, second]).toEqual(['عناية', 'عناية-2']);
    expect(uniqueSlug('عناية', new Set([...taken, 'عناية-2', 'عناية-3']))).toBe('عناية-4');
  });
});

describe('prepareArticleBody on the WordPress fixtures', () => {
  it.each(fixtures)('$slug: every heading is addressable once', (fixture) => {
    const prepared = prepareArticleBody(fixture.html);
    const ids = idsOf(prepared.toc);
    expect(ids.length).toBeGreaterThan(3);
    expect(new Set(ids).size).toBe(ids.length);
    // Arabic letters survive the slug, so the fragment a reader copies is readable.
    expect(ids.some((id) => /\p{Script=Arabic}/u.test(id))).toBe(true);
    // No id is percent-encoded on the way in; the page encodes it once, in the href.
    expect(ids.every((id) => !id.includes('%') && !id.includes('#') && !id.includes(' '))).toBe(true);
  });

  it.each(fixtures)('$slug: the duplicated title never becomes a section', (fixture) => {
    const prepared = prepareArticleBody(fixture.html);
    expect(prepared.segments.some((segment) => segment.kind === 'html' && /<h1/i.test(segment.html))).toBe(false);
    expect(prepared.toc.every((entry) => entry.level === 2 || entry.level === 3)).toBe(true);
  });

  it.each(fixtures)('$slug: what the page prints is what the TOC names', (fixture) => {
    const prepared = prepareArticleBody(fixture.html);
    const printed = prepared.segments
      .filter((segment) => segment.kind === 'html')
      .map((segment) => segment.html)
      .join('');
    for (const entry of prepared.toc) {
      // The id lives in the markup, not only in the list: an anchor works without JS.
      expect(printed).toContain(`id="${entry.id}"`);
    }
  });

  it.each(fixtures)('$slug: a wide table gets its own scroll box', (fixture) => {
    const prepared = prepareArticleBody(fixture.html);
    const printed = prepared.segments.map((segment) => (segment.kind === 'html' ? segment.html : '')).join('');
    const tables = (printed.match(/<table/gi) ?? []).length;
    const wraps = (printed.match(/class="article-table-wrap"/g) ?? []).length;
    if (tables > 0) expect(wraps).toBe(tables);
  });

  it('keeps the plain text a card needs, with no tags in it', () => {
    const prepared = prepareArticleBody(fixtures[0].html);
    expect(prepared.plain).not.toMatch(/[<>]/);
    expect(prepared.plain).not.toMatch(/\s{2,}/);
    expect(prepared.plain.length).toBeGreaterThan(500);
  });
});

describe('prepareArticleBody on the blocks the console writes', () => {
  const document = `
    <h2>قبل العلاج</h2>
    <p>مقدمة قصيرة.</p>
    <section data-block="faq">
      <h3>هل الجلسة مؤلمة؟</h3>
      <div data-faq-answer><p>الجلسة مريحة، ويوضع تخدير موضعي قبلها.</p></div>
    </section>
    <section data-block="faq">
      <h3>هل الجلسة مؤلمة؟</h3>
      <div data-faq-answer><p>نسخة ثانية من السؤال نفسه.</p></div>
    </section>
    <section data-block="cta" data-cta="whatsapp"></section>
    <section data-block="cta" data-cta="whatever-else"></section>
    <h2 id="خطوات-العلاج">خطوات العلاج</h2>
    <h3>خطوات العلاج</h3>
    <h4>تفصيل صغير</h4>
  `;

  it('splits the FAQ pairs out of the prose and numbers a repeated question', () => {
    const prepared = prepareArticleBody(document);
    expect(prepared.faqs.map((faq) => faq.question)).toEqual(['هل الجلسة مؤلمة؟', 'هل الجلسة مؤلمة؟']);
    expect(prepared.faqs[0].id).toBe('هل-الجلسه-مولمه');
    expect(prepared.faqs[1].id).toBe('هل-الجلسه-مولمه-2');
    expect(prepared.faqs[0].answerHtml).toContain('تخدير موضعي');
    const faqSegments = prepared.segments.filter((segment) => segment.kind === 'faq');
    expect(faqSegments).toHaveLength(2);
    // The question is a `<details>` label, not a prose heading: it is collapsed on the page.
    expect(prepared.toc.map((entry) => entry.text)).toEqual(['قبل العلاج', 'خطوات العلاج', 'خطوات العلاج']);
  });

  it('validates the CTA variant and falls back to the consultation box', () => {
    const prepared = prepareArticleBody(document);
    const variants = prepared.segments.filter((segment) => segment.kind === 'cta').map((segment) => (segment as { variant: string }).variant);
    expect(variants).toEqual(['whatsapp', 'consult']);
  });

  it('keeps an id the author set, and still names the next heading past it', () => {
    const prepared = prepareArticleBody(document);
    expect(prepared.toc[1]).toEqual({ id: 'خطوات-العلاج', text: 'خطوات العلاج', level: 2 });
    expect(prepared.toc[2].id).toBe('خطوات-العلاج-2');
  });

  it('wraps a bare sentence so it is not left outside every block', () => {
    const prepared = prepareArticleBody('جملة لم يلفها المحرر بوسم.');
    expect(prepared.segments).toEqual([{ kind: 'html', html: '<p>جملة لم يلفها المحرر بوسم.</p>' }]);
    expect(prepared.plain).toBe('جملة لم يلفها المحرر بوسم.');
  });
});

describe('the sanitizer still owns the pipeline', () => {
  it('drops scripts, handlers and unknown tags before the walk can print them', () => {
    const prepared = prepareArticleBody(
      '<p>نص</p><script>alert(1)</script><img src="https://example.test/a.png" onerror="alert(2)"><h2 onclick="alert(3)">عنوان</h2><iframe src="https://example.test"></iframe>',
    );
    const printed = prepared.segments.map((segment) => (segment.kind === 'html' ? segment.html : '')).join('');
    expect(printed).not.toMatch(/<script|<iframe|onerror|onclick/i);
    expect(printed).toMatch(/<h2 id="عنوان">عنوان<\/h2>/);
    // The image survives — it is the block the editor inserts — with its alt and src only.
    expect(printed).toMatch(/<img[^>]*src="https:\/\/example\.test\/a\.png"[^>]*>/);
  });

  it('keeps the block markers the pipeline reads', () => {
    const html = '<section data-block="cta" data-cta="book"></section>';
    expect(sanitizeHtmlBody(html)).toContain('data-block="cta"');
    expect(prepareArticleBody(html).segments).toEqual([{ kind: 'cta', variant: 'book' }]);
  });

  it('is idempotent, because the read path sanitizes as well', () => {
    const once = sanitizeHtmlBody(fixtures[0].html);
    expect(sanitizeHtmlBody(once)).toBe(once);
  });
});
