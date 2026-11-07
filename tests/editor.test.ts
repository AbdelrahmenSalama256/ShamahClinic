/**
 * BK-13.4 — the editor's own modules, with no database and no React in sight.
 *
 * Three properties hold the pane together, and all three are cheap to lose:
 *
 * **The message a save comes back with is the message under the field.** The console does
 * not invent its own error strings — it translates `parseWrites()`'s. So the test drives the
 * real server function with every bad value a kind can be handed and requires each sentence
 * it answers with to have a mapping, in both languages. When the server learns a new way to
 * refuse a write, this fails until the catalog learns it too.
 *
 * **The preview and the SEO read-out say what the site will say.** `seoReadout()` follows
 * `publicSeo()`'s fallbacks and `publicPathOf()` is the same rule the site's hrefs are built
 * from, so a console link cannot point at a URL the routing does not serve.
 *
 * **Nothing is posted that the browser already knows is wrong, and nothing dirty stays
 * dirty forever.** `fieldsFromForm()` answers in the server's vocabulary, and `sameForm()`
 * compares against the form that was *posted* — because MariaDB returns `12` for what
 * someone typed as `12.0`, and a baseline re-read from the row would leave autosave writing
 * the same draft every two seconds.
 *
 * **A row that will never reach the site admits it.** `resultNotices()` names what the
 * server cannot refuse: a result with neither an article nor a title to draw, half a
 * before/after pair, a standalone row left with no picture at all. The schema requires none of
 * these, so an owner who saved any of them would be looking at a screen that said "saved"
 * about a page that changed nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIST_KEYS } from '../src/lib/auth/roles';
import { CONTENT_KINDS, CONTENT_LOCALES, kindSpec, parseWrites, type ContentKind, type ContentLocale } from '../src/lib/content/kinds';
import { localizedPath, pageSlug, publicPathOf } from '../src/lib/content/paths';
import { fieldsFromForm, formOf, sameForm, contentStateKey, isPendingIn, resultNotices, textWarnings } from '../src/lib/console/editor-form';
import { identityForTitle } from '../src/lib/content/slug';
import { imagesOfForm } from '../src/components/console/ConsoleEditor';
import { catalogFor, type MessageKey } from '../src/lib/console/messages';
import { fieldOf, groupIssues, issueText, liveIssues, type FieldIssue, type TrackedIssue } from '../src/lib/console/issues';
import { previewDocument, previewModel, seoReadout } from '../src/lib/console/preview';
import type { ContentRow, FieldView } from '../src/lib/content/store';

const labels = catalogFor('ar');
const labelsEn = catalogFor('en');

function field(patch: Partial<FieldView> & { kind: FieldView['kind'] }): FieldView {
  return { pending: false, immediate: false, multiline: false, max: 0, ...patch };
}

function row(patch: Partial<ContentRow> & { kind: ContentKind }): ContentRow {
  return {
    id: 'r1',
    key: 'k1',
    listKey: null,
    status: 'draft',
    version: 1,
    trashed: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: null,
    pendingLocales: [],
    fields: {},
    ...patch,
  };
}

/** One row shaped like every field of its kind, so `formOf` and `fieldsFromForm` see them all. */
function rowOfKind(kind: ContentKind): ContentRow {
  const spec = kindSpec(kind);
  const fields: Record<string, FieldView> = {};
  for (const bi of spec.bi) fields[bi.name] = field({ kind: 'bi', draft: { ar: '', en: '' }, pub: { ar: null, en: null }, max: bi.max });
  for (const text of spec.text) fields[text.name] = field({ kind: 'text', value: text.fallback ?? '', max: text.max });
  for (const number of spec.number) fields[number.name] = field({ kind: 'number', value: null });
  for (const flag of spec.flag) fields[flag.name] = field({ kind: 'flag', value: false });
  for (const json of spec.json) fields[json.name] = field({ kind: 'json', draftJson: {} });
  return row({ kind, fields });
}

describe('the site path a row lives at (BK-13.4)', () => {
  it('spells each kind the way the site does', () => {
    expect(publicPathOf('article', 'rahma-diabetes')).toBe('/blogs/rahma-diabetes');
    expect(publicPathOf('offer', 'botox')).toBe('/offers/botox');
    expect(publicPathOf('page', '/')).toBe('/');
    expect(publicPathOf('page', '/about/')).toBe('/about');
  });

  it('gives every registered list a rule, and the header menu none', () => {
    for (const listKey of LIST_KEYS) {
      expect(publicPathOf('list_item', 'x', listKey) !== null || listKey === 'nav', `${listKey} is decided`).toBe(true);
    }
    expect(publicPathOf('list_item', 'x', 'nav')).toBeNull();
    expect(publicPathOf('list_item', 'x')).toBeNull();
    expect(publicPathOf('list_item', 'x', 'nope')).toBeNull();
    expect(publicPathOf('list_item', 'riyadh', 'branches')).toBe('/branches/riyadh');
  });

  it('prefixes both languages, because a bare path is Arabic', () => {
    // `decideRoute()` rewrites `/blogs/x` to `/ar/blogs/x`, so an English link has to say
    // `/en/` itself — a preview that opens the wrong language is worse than no link.
    expect(localizedPath('/blogs/x', 'ar')).toBe('/ar/blogs/x');
    expect(localizedPath('/blogs/x', 'en')).toBe('/en/blogs/x');
    expect(localizedPath('/', 'en')).toBe('/en');
    expect(pageSlug('//about//')).toBe('about');
  });

  it('is the rule the site itself uses, not a second copy', () => {
    const site = readFileSync(join(process.cwd(), 'src/lib/content/site.ts'), 'utf8');
    expect(site).toContain("from './paths'");
    expect(site).toMatch(/publicPathOf\('article'/);
    expect(site).toMatch(/publicPathOf\('offer'/);
    expect(site).not.toMatch(/`\/blogs\/\$\{/);
  });
});

describe('every message parseWrites() can answer with has a translation', () => {
  /** A value of the wrong shape for every field of every kind, plus a name that is not one. */
  function serverIssues(kind: ContentKind): FieldIssue[] {
    const spec = kindSpec(kind);
    const sent: Record<string, unknown> = { not_a_field: 'x' };
    for (const bi of spec.bi) sent[bi.name] = 'x'.repeat(bi.max + 1);
    for (const text of spec.text) sent[text.name] = 'x'.repeat(text.max + 1);
    for (const number of spec.number) sent[number.name] = '12abc';
    for (const flag of spec.flag) sent[flag.name] = 'yes';
    for (const json of spec.json) sent[json.name] = 'nope';
    const overlong = parseWrites(spec, { key: 'k', fields: sent }, 'ar');
    const empties: Record<string, unknown> = {};
    for (const bi of spec.bi) empties[bi.name] = 7;
    for (const json of spec.json) empties[json.name] = null;
    const wrongShape = parseWrites(spec, { key: 'k', fields: empties }, 'ar');
    // Nothing sent at all: a required JSON field answers `required`, in its own words.
    const missing = parseWrites(spec, { key: 'k', fields: {} }, 'ar');
    return [...overlong.issues, ...wrongShape.issues, ...missing.issues];
  }

  for (const kind of CONTENT_KINDS) {
    it(`${kind}: every sentence is mapped, in Arabic and in English`, () => {
      const issues = serverIssues(kind);
      expect(issues.length, `${kind} refuses a wrong-shaped write`).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issueText(labels, issue), `${kind}: ${issue.message}`).not.toBe(issue.message);
        expect(issueText(labelsEn, issue), `${kind}: ${issue.message}`).not.toBe(issue.message);
        expect(issueText(labels, issue).length).toBeGreaterThan(0);
        expect(issueText(labelsEn, issue)).not.toMatch(/[\u0600-\u06FF]/);
      }
    });
  }

  it('fills in a length limit instead of dropping the number', () => {
    expect(labels['content.issue.long']).toContain('{max}');
    expect(issueText(labels, { path: 'title', message: 'longer than 191 characters' })).toContain('191');
    expect(issueText(labelsEn, { path: 'title', message: 'longer than 191 characters' })).toBe('Longer than 191 characters.');
  });

  it('passes an unknown sentence through rather than showing nothing', () => {
    expect(issueText(labels, { path: 'title', message: 'the column is on fire' })).toBe('the column is on fire');
  });
});

describe('issues reach the field they belong to', () => {
  const names = ['title', 'price'];

  it('takes the field name out of a zod path', () => {
    expect(fieldOf('fields.title')).toBe('title');
    expect(fieldOf('title')).toBe('title');
    expect(fieldOf('fields.data.0.name')).toBe('data');
  });

  it('marks a known field and keeps the rest for the notice line', () => {
    const grouped = groupIssues(labels, [{ path: 'fields.title', message: 'required' }, { path: 'version', message: 'stale_row' }], names);
    expect(grouped.byField.title).toEqual([labels['content.issue.required']]);
    expect(grouped.other).toEqual(['stale_row']);
  });

  it('says each sentence once per field', () => {
    // The browser's parse and the server can both refuse the same box; one box, one line.
    const grouped = groupIssues(labels, [{ path: 'price', message: 'expected a number' }, { path: 'fields.price', message: 'expected a number' }], names);
    expect(grouped.byField.price).toHaveLength(1);
    expect(grouped.other).toEqual([]);
  });

  it('names the unknown key in the notice line', () => {
    // Every unknown key answers with the same sentence, so the bare sentence leaves the
    // person hunting: `stray_note — …` is the only line they can act on.
    const grouped = groupIssues(labels, [{ path: 'stray_note', message: 'unknown field' }], names);
    expect(grouped.byField).toEqual({});
    expect(grouped.other).toEqual([`stray_note — ${labels['content.issue.unknown']}`]);
  });

  it('retires a server sentence once its value is gone from the box', () => {
    // Found by typing over a refused currency: the write had been rejected for nine
    // letters, the box now held three, and the field still read `أطول من 8 حرفًا.`.
    const refused: TrackedIssue[] = [{ path: 'currency', message: 'longer than 8 characters', was: 'EEEEEEEEE' }];
    expect(liveIssues(refused, { currency: 'EEEEEEEEE' })).toEqual(refused);
    expect(liveIssues(refused, { currency: 'EGP' })).toEqual([]);
    expect(liveIssues(refused, {})).toEqual([]);
  });

  it('keeps a sentence no field owns until the next attempt answers', () => {
    // A moved `version` is not fixed by editing a box, so it must not vanish on a keystroke.
    const stale: TrackedIssue[] = [{ path: 'version', message: 'stale_row', was: '' }];
    expect(liveIssues(stale, { title: 'رحمة' })).toEqual(stale);
  });

  it('reads a bilingual path as the field the editor can mark', () => {
    const refused: TrackedIssue[] = [{ path: 'fields.title', message: 'longer than 500 characters', was: 'طويل' }];
    expect(liveIssues(refused, { title: 'طويل' })).toHaveLength(1);
    expect(liveIssues(refused, { title: 'رحمة' })).toHaveLength(0);
  });
});

describe('the form the fields draw', () => {
  it('reads one language tab out of a bilingual row', () => {
    const article = rowOfKind('article');
    article.fields.title = field({ kind: 'bi', draft: { ar: 'رحمة', en: 'Mercy' }, pub: { ar: 'رحمة', en: 'Mercy' } });
    expect(formOf(article, 'ar').title).toBe('رحمة');
    expect(formOf(article, 'en').title).toBe('Mercy');
    // A language nobody has written yet starts empty, not `[object Object]`.
    article.fields.excerpt = field({ kind: 'bi', draft: { ar: 'مقتطف', en: '' }, pub: { ar: null, en: null } });
    expect(formOf(article, 'en').excerpt).toBe('');
    expect(formOf(article, 'ar').excerpt).toBe('مقتطف');
  });

  it('prints JSON the way an editor expects to read it', () => {
    const item = rowOfKind('list_item');
    item.fields.data = field({ kind: 'json', draftJson: { name: { ar: 'عيون', en: 'Eyes' } } });
    expect(formOf(item, 'ar').data).toBe(JSON.stringify({ name: { ar: 'عيون', en: 'Eyes' } }, null, 2));
    expect(formOf(rowOfKind('list_item'), 'ar').data).toBe('{}');
  });

  it('is dirty only against the values it posted, never against the database’s rounding', () => {
    const typed = { price: '12.0' };
    expect(sameForm(typed, { price: '12.0' })).toBe(true);
    // The stored spelling differs; the baseline the component keeps is the typed one, so a
    // re-read row cannot re-dirty the form and drive autosave in a circle.
    expect(sameForm(typed, { price: '12' })).toBe(false);
    expect(sameForm({}, { price: '' })).toBe(true);
    expect(sameForm({ enabled: true }, { enabled: 'true' })).toBe(true);
  });

  it('collects what cannot be sent, in the words the server uses', () => {
    const offer = rowOfKind('offer');
    offer.fields.price = field({ kind: 'number', value: null });
    offer.fields.images = field({ kind: 'json', draftJson: [] });
    offer.fields.onSale = field({ kind: 'flag', value: false });

    const blank = fieldsFromForm(offer, { price: '', images: '', onSale: false });
    expect(blank.issues).toEqual([]);
    expect(blank.fields.price).toBeNull();
    expect(blank.fields.images).toEqual({});
    expect(blank.fields.onSale).toBe(false);

    const halfTyped = fieldsFromForm(offer, { price: '12.', images: '[{"a":1}]', onSale: true });
    expect(halfTyped.fields.price).toBe(12);
    expect(halfTyped.fields.images).toEqual([{ a: 1 }]);
    expect(halfTyped.fields.onSale).toBe(true);

    const broken = fieldsFromForm(offer, { price: 'abc', images: '{oops', onSale: false });
    expect(broken.issues).toEqual([
      { path: 'price', message: 'expected a number' },
      { path: 'images', message: 'not valid JSON' },
    ]);

    const scalar = fieldsFromForm(offer, { price: '1', images: '"just a string"', onSale: false });
    expect(scalar.issues).toEqual([{ path: 'images', message: 'expected an object or an array' }]);
  });

  it('refuses a write the moment one field is unusable', () => {
    // The component checks `parsed.issues.length` before any request goes out.
    const offer = rowOfKind('offer');
    offer.fields.price = field({ kind: 'number', value: null });
    expect(fieldsFromForm(offer, { price: 'x' }).issues.length).toBeGreaterThan(0);
  });

  it('names the row’s state as one chip', () => {
    expect(contentStateKey(row({ kind: 'article', status: 'draft' }))).toBe('content.state.draft');
    expect(contentStateKey(row({ kind: 'article', status: 'published' }))).toBe('content.state.published');
    expect(contentStateKey(row({ kind: 'article', status: 'published', publishedAt: '2026-10-01T08:00:00.000Z', pendingLocales: ['ar'] }))).toBe('content.state.pending');
    expect(contentStateKey(row({ kind: 'article', status: 'published', trashed: true }))).toBe('content.state.trashed');

    const title = field({ kind: 'bi', draft: { ar: 'جديد', en: 'New' }, pub: { ar: 'قديم', en: 'New' } });
    expect(isPendingIn(title, 'ar')).toBe(true);
    expect(isPendingIn(title, 'en')).toBe(false);
    // Never published: there is no copy the draft could have outrun.
    expect(isPendingIn(field({ kind: 'bi', draft: { ar: 'جديد', en: 'New' }, pub: { ar: null, en: null } }), 'ar')).toBe(false);
  });
});

describe('the typed form of a list row', () => {
  /** A list row as the console receives one: its whole content is the `data` document. */
  function itemRow(listKey: string, doc: Record<string, unknown>): ContentRow {
    const row = rowOfKind('list_item');
    row.listKey = listKey;
    row.fields.data = field({ kind: 'json', draftJson: doc });
    return row;
  }

  it('draws one box for a value the site keeps once', () => {
    const row = itemRow('branches', { name_ar: 'فرع المعادي', name_en: 'Maadi branch', phone: '+20 100' });
    const form = formOf(row, 'ar');
    // A phone number is not translated, and the site reads it under one key. Two boxes
    // would be two numbers to keep in step, so the form has one and posts that key back.
    expect(form.phone).toBe('+20 100');
    expect(form.phone_ar).toBeUndefined();
    expect(form.phone_en).toBeUndefined();
    expect(fieldsFromForm(row, { ...form, phone: '+20 111' }).fields.data).toMatchObject({ phone: '+20 111' });
  });

  it('reads what an older row stored in another shape, and posts it in this one', () => {
    const row = itemRow('branches', { name: { ar: 'فرع التجمع', en: 'New Cairo branch' }, phone_ar: '+20 100', phone_en: '+20 100' });
    const form = formOf(row, 'ar');
    expect(form.name_ar).toBe('فرع التجمع');
    // A pair left by an earlier save is folded into the one value the field has, rather
    // than dropped: what a person typed yesterday is still in the box today.
    expect(form.phone).toBe('+20 100');
    const posted = fieldsFromForm(row, form);
    expect(posted.issues).toEqual([]);
    expect(posted.fields.data).toMatchObject({ name_ar: 'فرع التجمع', name_en: 'New Cairo branch', phone: '+20 100' });
  });

  it('sends the whole document, so an emptied box stays empty', () => {
    const row = itemRow('faq', { question_ar: 'س؟', question_en: 'Q?', answer_ar: '', answer_en: '', category: '' });
    const posted = fieldsFromForm(row, formOf(row, 'ar'));
    expect(posted.issues).toEqual([]);
    // Every field the list's form names is in what goes up, so the saved document *is* the
    // form: a box cleared on purpose reads back cleared, and a key the form never showed
    // cannot survive quietly under the fields a person did edit.
    expect(posted.fields.data).toEqual({ question_ar: 'س؟', question_en: 'Q?', answer_ar: '', answer_en: '', category: '' });
  });

  it('gives a service the one link its card is built from', () => {
    const row = itemRow('services', { name_ar: 'تقشير', name_en: 'Peeling' });
    const form = formOf(row, 'en');
    expect(form.href).toBe('');
    const posted = fieldsFromForm(row, { ...form, href: '/peeling' });
    expect(posted.issues).toEqual([]);
    expect(posted.fields.data).toMatchObject({ href: '/peeling' });
  });
});

describe('a result row says what will not reach the site', () => {
  it('names the row that has neither an article nor a title', () => {
    // `/results` draws a row that owns a name: the article it opens, or the headline written
    // for it. A row with neither has nothing to draw — and the save itself is legal, so
    // nothing else reports it.
    expect(resultNotices({}, 'laser-for-acne-scars')).toEqual(['content.result.nameless', 'content.result.picture']);
    expect(resultNotices({ title_ar: '   ' }, 'a-new-result')).toEqual(['content.result.nameless', 'content.result.picture']);
    expect(resultNotices({ story: 'laser-for-acne-scars' }, 'a-new-result')).toEqual([]);
    expect(resultNotices({ title_en: 'After four sessions' }, 'a-new-result')).toEqual(['content.result.picture']);
  });

  it('counts a row imported by article id as attached', () => {
    // The site found the 57 imported rows through the WordPress number in their key long
    // before this picker existed; calling them unfinished would point at what is not broken.
    expect(resultNotices({ story: '' }, '1182')).toEqual([]);
  });

  it('flags half a before/after pair and says nothing about none of it', () => {
    expect(resultNotices({ story: 's', before: '/uploads/a.webp' }, 'r1')).toEqual(['content.result.pair']);
    // Spaces in a box are no picture, so that row is still missing its second half.
    expect(resultNotices({ story: 's', before: '/uploads/a.webp', after: '   ' }, 'r1')).toEqual(['content.result.pair']);
    expect(resultNotices({ story: 's', before: '/uploads/a.webp', after: '/uploads/b.webp' }, 'r1')).toEqual([]);
    expect(resultNotices({ story: 's' }, 'r1')).toEqual([]);
  });

  it('lets a standalone case be complete: a title, both halves, no article', () => {
    expect(resultNotices({ title_ar: 'بعد أربع جلسات', title_en: 'After four sessions', before: '/uploads/a.webp', after: '/uploads/b.webp' }, 'a-new-result')).toEqual([]);
    // The same row with one half missing has no picture left to draw, so both sentences say true.
    expect(resultNotices({ title_ar: 'بعد أربع جلسات', before: '/uploads/a.webp' }, 'a-new-result')).toEqual([
      'content.result.pair',
      'content.result.picture',
    ]);
  });

  it('shows both halves of the pair in the media strip', () => {
    const row = rowOfKind('list_item');
    row.listKey = 'results';
    row.fields.data = field({ kind: 'json', draftJson: {} });
    expect(imagesOfForm(row, { before: '/uploads/202610/a.webp', after: '/uploads/202610/b.webp' })).toEqual([
      '/uploads/202610/a.webp',
      '/uploads/202610/b.webp',
    ]);
  });
});

describe('the preview pane', () => {
  it('shows the words being typed, not the last saved copy', () => {
    const model = previewModel('article', { title: 'لحاملات', excerpt: 'نص', content: '<p>فقرة</p>', image: '', imageAlt: false }, 'ar');
    expect(model.title).toBe('لحاملات');
    expect(model.intro).toBe('نص');
    expect(model.body).toBe('<p>فقرة</p>');
    expect(model.bodyAs).toBe('html');
    // An empty text field says nothing; a flag says something even when it is off.
    expect(model.fields.map((f) => f.name)).toEqual(['imageAlt']);
  });

  it('previews a list item as the card its own list draws', () => {
    // The pane reads the typed form the editor writes, never a box of JSON: the answer
    // a person types is the teaser, and the question is what the card is titled by.
    const model = previewModel('list_item', { question_ar: 'سؤال؟', question_en: 'Q?', answer_ar: 'جواب', answer_en: 'A' }, 'en', 'faq');
    expect(model.title).toBe('Q?');
    expect(model.intro).toBe('A');
    expect(model.body).toBe('');
    // The list's own strip, not the form's leftovers: a category left unset says nothing.
    expect(model.fields).toEqual([]);
  });

  it('previews a service with its picture and its points', () => {
    // One benefit is one row, and the form types its sentence as `benefits.0.text_ar`. The
    // older two-parallel-arrays shape is still read out of the database, but nobody types it
    // into this form, so this is the shape the pane has to answer from.
    const model = previewModel('list_item', { name_ar: 'ليزر', intro_ar: 'تنعيم', 'benefits.0.text_ar': 'نتيجة فورية', image: '/u/laser.jpg', featured: true }, 'ar', 'services');
    expect(model.title).toBe('ليزر');
    expect(model.intro).toBe('تنعيم');
    expect(model.image).toBe('/u/laser.jpg');
    expect(model.bullets).toEqual(['نتيجة فورية']);
    expect(model.fields).toContainEqual({ name: 'خدمة مميزة', value: true });
  });

  it('leaves the pane empty for a document it has no form for', () => {
    // The old pane printed a half-typed JSON document as its body. The form is keyed per
    // field now, so there is no such text to echo — and a list the console has no schema
    // for previews as nothing rather than as the bytes behind it.
    expect(previewModel('list_item', { data: '{"name": ' }, 'ar')).toEqual({
      title: '',
      intro: '',
      body: '',
      bodyAs: 'text',
      image: null,
      bullets: [],
      fields: [],
      resultCase: null,
    });
  });

  it('escapes everything the pane prints itself, and nothing the author wrote', () => {
    const doc = previewDocument(previewModel('article', { title: '<img src=x onerror=alert(1)>', excerpt: 'a & b', content: '<p>real & true</p>' }, 'en'), 'en', labelsEn);
    expect(doc).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(doc).not.toContain('<img src=x');
    expect(doc).toContain('a &amp; b');
    // The body is the authored HTML, on purpose — the frame it goes into runs nothing.
    expect(doc).toContain('<p>real & true</p>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('lang="en" dir="ltr"');
    expect(previewDocument(previewModel('article', { title: 'رحمة' }, 'ar'), 'ar', labels)).toContain('lang="ar" dir="rtl"');
  });

  it('is handed to a frame that cannot run it', () => {
    const editor = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');
    // Scripting is off in both frames. The card keeps `sandbox=""` outright: no origin either,
    // so a `<script>` pasted into a body could not read the console's session cookie even if a
    // frame could run one. The other frame is the site's own draft route, which needs an origin
    // to load the site's stylesheet and self-hosted fonts — safe only because scripting stays
    // off. `tests/service-preview.test.ts` checks which row gets which frame and which source.
    expect(editor).not.toContain('allow-scripts');
    expect(editor).toMatch(/sandbox=\{draftHref \? 'allow-same-origin' : ''\}/);
    expect(editor).toMatch(/srcDoc=\{draftHref \? undefined : previewSrc\}/);
  });
});

describe('the search read-out follows the site', () => {
  const base = { kind: 'article' as const, key: 'rahma', locale: 'ar' as ContentLocale };

  it('borrows the other language the way publicSeo() does', () => {
    const mine = seoReadout({ ...base, title: 'رحمة', otherTitle: 'Mercy', description: 'وصف', otherDescription: 'Desc' });
    expect(mine).toMatchObject({ title: 'رحمة', description: 'وصف', path: '/ar/blogs/rahma' });

    const borrowed = seoReadout({ ...base, title: '', otherTitle: 'Mercy', description: '', otherDescription: 'Desc' });
    expect(borrowed.title).toBe('Mercy');
    expect(borrowed.description).toBe('Desc');

    const headingOnly = seoReadout({ ...base, title: '', otherTitle: '', description: '', otherDescription: '' });
    expect(headingOnly.title).toBe('');
    expect(headingOnly.description).toBe('');
    expect(headingOnly.descriptionLength).toBe(0);
  });

  it('counts characters the way a person counts them', () => {
    // Code points, not UTF-16 units: an emoji is one character in a search result.
    expect(seoReadout({ ...base, title: 'رحمة', otherTitle: '', description: 'x', otherDescription: '' }).titleLength).toBe(4);
    expect(seoReadout({ ...base, title: '👩🏼 💊', otherTitle: '', description: 'x', otherDescription: '' }).titleLength).toBe(4);
  });

  it('says when a row has no page to preview', () => {
    expect(seoReadout({ kind: 'list_item', key: 'home', listKey: 'nav', locale: 'en', title: 'x', otherTitle: '', description: '', otherDescription: '' }).path).toBeNull();
    expect(seoReadout({ kind: 'page', key: '/contact', locale: 'en', title: 'x', otherTitle: '', description: '', otherDescription: '' }).path).toBe('/en/contact');
  });
});

describe('a box says what the WordPress import left in it', () => {
  const plain = field({ kind: 'bi', format: 'plain', draft: { ar: '', en: '' }, pub: { ar: null, en: null } });
  const body = field({ kind: 'bi', format: 'html', draft: { ar: '', en: '' }, pub: { ar: null, en: null } });

  it('flags an Arabic box written in Latin letters, and only that one', () => {
    // 91 of the 93 imported article excerpts are English sentences in an `*_ar` column, and the
    // server has always accepted them: this is the only place that says so to the person typing.
    expect(textWarnings(plain, 'ar', 'Skin care routine')).toEqual(['content.warn.latin']);
    expect(textWarnings(plain, 'en', 'Skin care routine')).toEqual([]);
    expect(textWarnings(plain, 'ar', 'روتين العناية بالبشرة')).toEqual([]);
  });

  it('counts a product name inside an Arabic sentence as Arabic', () => {
    expect(textWarnings(plain, 'ar', 'جلسة Derma Pen للبشرة')).toEqual([]);
  });

  it('flags the teaser artifact in whichever language it survived in', () => {
    expect(textWarnings(plain, 'ar', 'روتين العناية […]')).toEqual(['content.warn.ellipsis']);
    expect(textWarnings(plain, 'en', 'A skin routine […]')).toEqual(['content.warn.ellipsis']);
    expect(textWarnings(plain, 'ar', 'روتين العناية…')).toEqual([]);
  });

  it('says both at once, in the order the box reads', () => {
    expect(textWarnings(plain, 'ar', 'Skin care routine […]')).toEqual(['content.warn.latin', 'content.warn.ellipsis']);
  });

  it('stays quiet about an empty box, about markup and about a column that is not text', () => {
    expect(textWarnings(plain, 'ar', '   ')).toEqual([]);
    // A body ends in `</p>`, so the same test over it would answer about the closing tag rather
    // than about the sentence — which is why a warning is a plain field's business only.
    expect(textWarnings(body, 'ar', 'A skin care routine […]</p>')).toEqual([]);
    expect(textWarnings(field({ kind: 'text', format: 'plain', value: '' }), 'ar', 'Skin care […]')).toEqual([]);
  });

  it('is drawn under the field it belongs to, and never withholds the save', () => {
    const pane = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');
    expect(pane).toMatch(/const warnNotes = textWarnings\(field, locale, value\)/);
    expect(pane).toMatch(/note=\{warnNotes\.length > 0 \? <>\{noteNode\}\{warnNotes\}<\/> : noteNode\}/);
    // What greys the buttons is still the browser's own complaint list, and a warning is not in it.
    expect(pane).toMatch(/const invalid = parsed\.issues\.length > 0;/);
    expect(fieldsFromForm(row({ kind: 'article', fields: { title: plain } }), { title: 'Skin care routine […]' }).issues).toEqual([]);
  });
});

describe('the address a row is served at is editable, and says what a move costs', () => {
  const pane = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');

  it('is drawn for the kinds whose key is a URL, and for no others', () => {
    expect(pane).toMatch(/\{kind !== 'list_item' \? \(\s*<SlugField/);
    // Keyed by the address it holds, so a move that lands starts the box from the database's
    // value instead of leaving the person looking at the text they just submitted.
    expect(pane).toMatch(/key=\{row\.key\}/);
  });

  it('folds what is typed with the function a new row is named by', () => {
    expect(pane).toContain("from '@/lib/content/slug'");
    expect(pane).toMatch(/const key = identityForTitle\(kind, typed\)/);
    expect(pane).toMatch(/publicPathOf\(kind, key\)/);
    // Arabic letters are kept rather than transliterated, a page keeps its leading slash, and a
    // title made only of punctuation folds to nothing — which the box says instead of posting.
    expect(identityForTitle('article', 'Derma Pen — Fusion!')).toBe('derma-pen-fusion');
    expect(identityForTitle('article', 'عنوان مكرر')).toBe('عنوان-مكرر');
    expect(identityForTitle('page', 'About Us')).toBe('/about-us');
    expect(identityForTitle('article', '…')).toBe('');
  });

  it('offers the title as the source, read off the words in the box right now', () => {
    expect(pane).toMatch(/const slugTitle = titleField \? String\(form\[titleField\.name\] \?\? ''\) : '';/);
    expect(pane).toMatch(/onClick=\{\(\) => setTyped\(title\)\}/);
    expect(pane).toMatch(/title\.trim\(\) === ''/);
  });

  it('is its own verb, so no draft write and no autosave can move a published page', () => {
    expect(pane).toMatch(/\/rename\$\{query\}`, 'POST', \{ key: next, version: row\.version \}/);
    // The box is not a member of the form: `fieldsFromForm()` walks the row's fields, and a
    // typed address is not one of them, so a save cannot carry it even by accident.
    expect(fieldsFromForm(rowOfKind('article'), { key: 'another-row' }).fields.key).toBeUndefined();
    expect(fieldsFromForm(rowOfKind('page'), { key: '/somewhere-else' }).fields.key).toBeUndefined();
  });

  it('says every answer the server can give, in both languages', () => {
    const keys: MessageKey[] = [
      'content.slug',
      'content.route',
      'content.slug_at',
      'content.slug_derive',
      'content.slug_change',
      'content.slug_changed',
      'content.slug_moves',
      'content.warn.latin',
      'content.warn.ellipsis',
      'content.error.key_taken',
      'content.error.invalid_key',
      'content.error.rename_not_applicable',
    ];
    for (const key of keys) {
      expect(labels[key].trim().length, `${key} in Arabic`).toBeGreaterThan(0);
      expect(labelsEn[key].trim().length, `${key} in English`).toBeGreaterThan(0);
      expect(labels[key], key).not.toBe(labelsEn[key]);
      expect(labels[key], `${key} reads as Arabic`).toMatch(/[\u0600-\u06FF]/);
      expect(labelsEn[key], `${key} reads as English`).not.toMatch(/[\u0600-\u06FF]/);
    }
    // The three codes the store answers with that a save cannot: each one reaches a sentence
    // through the same `content.error.<code>` mapping every other failure uses.
    for (const code of ['key_taken', 'invalid_key', 'rename_not_applicable', 'stale_row', 'in_trash']) {
      expect(labels[`content.error.${code}` as MessageKey], code).toBeTruthy();
    }
  });
});

describe('the catalog carries every key in both languages', () => {
  const editorKeys: MessageKey[] = [
    'content.editor',
    'content.preview',
    'content.preview.draft',
    'content.preview.site',
    'content.preview.no_page',
    'content.seo',
    'content.seo.title',
    'content.seo.description',
    'content.seo.none',
    'content.seo.count',
    'content.dirty',
    'content.saving',
    'content.autosave',
    'content.autosaved',
    'content.autosave_stopped',
    'content.unsaved.title',
    'content.unsaved.body',
    'content.unsaved.save',
    'content.unsaved.discard',
    'content.unsaved.keep',
    'content.keyboard',
    'content.flag.on',
    'content.flag.off',
    'content.issue.text',
    'content.issue.number',
    'content.issue.flag',
    'content.issue.json',
    'content.issue.invalid_json',
    'content.issue.unknown',
    'content.issue.required',
    'content.issue.long',
    'content.list.story.empty',
    'content.list.story.none',
    'content.result.nameless',
    'content.result.pair',
    'content.result.picture',
    // the before/after case: what a half row is marked by, and the two drawings of its preview.
    'content.result.needs-photo',
    'content.result.before',
    'content.result.after',
    'content.preview.card',
    'content.preview.zoom',
    'content.preview.missing',
  ];

  for (const key of editorKeys) {
    it(`${key} reads in Arabic and in English`, () => {
      for (const locale of CONTENT_LOCALES) {
        expect(catalogFor(locale as ContentLocale)[key].trim().length, `${key} ${locale}`).toBeGreaterThan(0);
      }
      // An Arabic string with an English word pasted into it is a half-finished translation,
      // and a placeholder the console substitutes has to survive in both catalogues.
      expect(labels[key]).toMatch(/[\u0600-\u06FF]/);
      expect(labelsEn[key]).not.toMatch(/[\u0600-\u06FF]/);
      expect([...labels[key].matchAll(/\{\w+\}/g)].length, key).toBe([...labelsEn[key].matchAll(/\{\w+\}/g)].length);
    });
  }
});
