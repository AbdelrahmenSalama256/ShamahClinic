/**
 * BA-4: the console says which case is only half a comparison, and draws both of the shapes
 * the site will put it in.
 *
 * The owner's words were *"A case is complete only with both images; a half case never
 * renders as a pair and shows a 'Needs the other photo' badge in the list"* and *"a live
 * preview that looks like the site card AND the zoomed view"*. Both are about what a person
 * can see before they save, which is exactly what `tests/results-page.test.ts` cannot reach:
 * that file proves the read path drops a half pair from the data, while these two rows prove
 * the screen admits it.
 *
 *   - **the flag is computed from the two picture fields**, from nothing else — a row with
 *     neither is a different problem (`content.result.picture` already says so), and a row
 *     with both is never flagged.
 *   - **the badge is drawn**, in the card view and in the table view, in the console's own
 *     language, as a `warn` badge standing beside the state badge rather than replacing it:
 *     a half case is still published, and the owner needs both facts at once.
 *   - **the preview is the site's two drawings**, not a form dump: a headline above two
 *     squares with the corner words, then the chips, the line and the long text; and the
 *     same pair wider for the enlarged view. Each half carries its own description, which is
 *     the field the split replaced the shared one with.
 *   - **a half case is shown as one**, with the empty slot named and the same sentence the
 *     notice above the form prints — the person learns what is missing from the drawing, not
 *     from an error after saving.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));

import { ConsoleList, type ConsoleListProps } from '../src/components/console/ConsoleList';
import { catalogFor } from '../src/lib/console/messages';
import { defaultViewFor, filtersFor, sortsFor } from '../src/lib/content/list-view';
import type { ListPage, ListSummary } from '../src/lib/content/summary';
import type { ContentAbilities } from '../src/lib/console/content-screen';
import { listDocForm, listSchemaOf, needsOtherPhoto } from '../src/lib/content/list-schema';
import { previewDocument, previewModel, type PreviewReference } from '../src/lib/console/preview';

const labels = catalogFor('ar');
const labelsEn = catalogFor('en');
const results = listSchemaOf('results')!;

/* ------------------------------------------------------------------ the list --- */

/** A row of the results list, as the console receives it. */
function row(index: number, needsPhoto: boolean): ListSummary {
  return {
    id: `results-r${index}`,
    kind: 'list_item',
    key: `case-${index}`,
    titleAr: `نتيجة ${index}`,
    titleEn: `Result ${index}`,
    status: 'published',
    version: 1,
    trashed: false,
    pendingAr: false,
    pendingEn: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: '2026-10-01T08:00:00.000Z',
    image: null,
    needsPhoto,
    needsServices: false,
    warnings: [],
    cells: { area_ar: 'الوجه' },
  };
}

const writable: ContentAbilities = {
  create: ['results', 'ar'],
  update: ['results', 'ar'],
  publish: ['results', 'ar'],
  remove: ['results', 'ar'],
};

/** The results list, drawn as the workspace draws it. */
function draw(rows: ListSummary[], mode: 'card' | 'table', lang: 'ar' | 'en' = 'ar'): string {
  const page: ListPage = {
    rows,
    total: rows.length,
    page: 1,
    pages: 1,
    per: 25,
    columns: ['area_ar'],
    hasImages: false,
  };
  const props: ConsoleListProps = {
    kind: 'list_item',
    scope: { listKey: 'results', locale: null, trash: false, focusKey: null },
    page,
    view: { ...defaultViewFor('list_item'), mode },
    sorts: sortsFor('list_item'),
    filters: filtersFor('list_item', false),
    locale: 'ar',
    labels: lang === 'ar' ? labels : labelsEn,
    abilities: writable,
    onScopeChange: () => undefined,
  };
  return renderToStaticMarkup(createElement(ConsoleList, props));
}

/** The words of every badge a row prints, in the order they appear. */
function badges(html: string): string[] {
  return [...html.matchAll(/<span class="console-badge"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]!);
}

describe('the list marks a case that is missing one photo', () => {
  const flag = labels['content.result.needs-photo'];

  it('flags exactly the rows that hold one picture and not the other', () => {
    expect(needsOtherPhoto('/uploads/before.webp', '')).toBe(true);
    expect(needsOtherPhoto('', '/uploads/after.webp')).toBe(true);
    expect(needsOtherPhoto('/uploads/before.webp', '/uploads/after.webp')).toBe(false);
    // Neither is a different complaint: `content.result.picture` says "this result has no
    // picture", and a second badge telling the owner to upload "the other" one would point
    // at a photo that was never started.
    expect(needsOtherPhoto('', '')).toBe(false);
    expect(needsOtherPhoto('  ', '/uploads/after.webp')).toBe(true);
  });

  it('prints it as a warning beside the state, in both drawings of the row', () => {
    for (const mode of ['table', 'card'] as const) {
      const html = draw([row(1, true)], mode);
      expect(badges(html)).toEqual([labels['content.state.published'], flag]);
      expect(html).toContain(
        `<span class="console-badge" data-tone="ok">${labels['content.state.published']}</span>` +
          `<span class="console-badge" data-tone="warn">${flag}</span>`,
      );
    }
  });

  it('says nothing about a complete case, so the warning means one thing', () => {
    expect(badges(draw([row(2, false)], 'table'))).toEqual([labels['content.state.published']]);
    expect(draw([row(2, false)], 'card')).not.toContain(flag);
  });

  it('marks each row on its own, not the page', () => {
    const html = draw([row(1, true), row(2, false), row(3, true)], 'table');
    expect(html.split(flag).length - 1).toBe(2);
  });

  it('speaks the console language, not the site language', () => {
    expect(badges(draw([row(1, true)], 'table', 'en'))).toEqual([
      labelsEn['content.state.published'],
      labelsEn['content.result.needs-photo'],
    ]);
  });
});

/* ----------------------------------------------------------------- the preview --- */

const headline = { ar: 'تحسن ملمس البشرة بعد الليزر', en: 'Skin texture after the laser' };
const area = { ar: 'الوجه', en: 'The face' };
const sessions = { ar: '٤ جلسات', en: '4 sessions' };
const before = { ar: 'بشرة قبل الجلسات', en: 'Skin before the sessions' };
const after = { ar: 'بشرة بعد أربع جلسات', en: 'Skin after four sessions' };
const caption = { ar: 'الفرق بعد أربع جلسات', en: 'The difference after four sessions' };
const note = { ar: 'ما تراه الصورتان والمدة بينهما', en: 'What the two pictures show and the time between them' };
const serviceName = 'الليزر الجزئي للوجه';
const storyName = 'مقال عن جلسات الليزر';

const references: Record<string, PreviewReference[]> = {
  service: [{ key: 'svc-laser', label: serviceName }],
  story: [{ key: 'post-42', label: storyName }],
};

/** The form the editor holds for a document — the same keys a saved row is opened with. */
function formOf(doc: Record<string, unknown>): Record<string, string | boolean> {
  return listDocForm(results, doc);
}

const completeDoc = {
  title: headline,
  area,
  sessions,
  before: '/uploads/202610/before.webp',
  beforeAlt: before,
  after: '/uploads/202610/after.webp',
  afterAlt: after,
  caption,
  note,
  service: ['svc-laser'],
  story: 'post-42',
};

function preview(doc: Record<string, unknown>, locale: 'ar' | 'en' = 'ar') {
  const model = previewModel('list_item', formOf(doc), locale, 'results', references);
  return { model, html: previewDocument(model, locale, locale === 'ar' ? labels : labelsEn) };
}

/** The two drawings, in the order the pane stacks them. */
function cases(html: string): string[] {
  return html.match(/<section class="case">[\s\S]*?<\/section>/g) ?? [];
}

describe('the editor previews a case as the site draws it', () => {
  it('reads the case out of the live form, field by field', () => {
    const { model } = preview(completeDoc);
    expect(model.resultCase).toEqual({
      headline: headline.ar,
      before: '/uploads/202610/before.webp',
      after: '/uploads/202610/after.webp',
      half: false,
      beforeLabel: results.fields.find((f) => f.stem === 'before')!.label.ar,
      afterLabel: results.fields.find((f) => f.stem === 'after')!.label.ar,
      beforeAlt: before.ar,
      afterAlt: after.ar,
      beforeAltLabel: results.fields.find((f) => f.stem === 'beforeAlt')!.label.ar,
      afterAltLabel: results.fields.find((f) => f.stem === 'afterAlt')!.label.ar,
      area: area.ar,
      sessions: sessions.ar,
      caption: caption.ar,
      note: note.ar,
      service: serviceName,
    });
  });

  it('draws the card and the enlarged view, and nothing else', () => {
    const { html } = preview(completeDoc);
    const [card, zoom] = cases(html);
    expect(cases(html)).toHaveLength(2);
    expect(card).toContain(labels['content.preview.card']);
    expect(zoom).toContain(labels['content.preview.zoom']);
    // The two shapes the site uses: squares on the card, a wider pair in the enlarged view.
    expect(card).toContain('<div class="pair">');
    expect(zoom).toContain('<div class="pair big">');
    // The generic card the other lists get would repeat what these two already print.
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<dl class="meta">');
  });

  it('names each picture with the description written for it', () => {
    const [card] = cases(preview(completeDoc).html);
    expect(card).toContain(`alt="${before.ar}"`);
    expect(card).toContain(`alt="${after.ar}"`);
    expect(card).toContain(`<p class="alt"><b>${results.fields.find((f) => f.stem === 'beforeAlt')!.label.ar}</b> ${before.ar}</p>`);
    expect(card).toContain(`<p class="alt"><b>${results.fields.find((f) => f.stem === 'afterAlt')!.label.ar}</b> ${after.ar}</p>`);
  });

  it('stacks the chips, the line and the long text the way the card does', () => {
    const [card, zoom] = cases(preview(completeDoc).html);
    expect(card).toBe(
      `<section class="case"><h2 class="tag">${labels['content.preview.card']}</h2>` +
        `<h3 class="head">${headline.ar}</h3>` +
        `<div class="pair"><figure><img src="/uploads/202610/before.webp" alt="${before.ar}"><figcaption>${labels['content.result.before']}</figcaption></figure>` +
        `<figure><img src="/uploads/202610/after.webp" alt="${after.ar}"><figcaption>${labels['content.result.after']}</figcaption></figure></div>` +
        `<div class="chips"><span class="chip">${serviceName}</span><span class="chip">${area.ar}</span><span class="chip">${sessions.ar}</span></div>` +
        `<p class="cap">${caption.ar}</p>` +
        `<p class="alt"><b>${results.fields.find((f) => f.stem === 'beforeAlt')!.label.ar}</b> ${before.ar}</p>` +
        `<p class="alt"><b>${results.fields.find((f) => f.stem === 'afterAlt')!.label.ar}</b> ${after.ar}</p></section>`,
    );
    // The long text belongs to the enlarged view alone — that is the field's whole point,
    // and a person checking it needs the pane to agree with the page.
    expect(card).not.toContain('class="note"');
    expect(zoom).toContain(`<p class="note">${note.ar}</p>`);
    expect(zoom).toContain(`<p class="cap">${caption.ar}</p>`);
  });

  it('drops a chip the row left empty instead of drawing an empty one', () => {
    const empty = { ar: '', en: '' };
    const doc = { ...completeDoc, area: empty, caption: empty, note: empty, service: [], beforeAlt: empty, afterAlt: empty };
    const [card, zoom] = cases(preview(doc).html);
    // A description left empty prints an empty `alt` in the pane; the page falls back to the
    // headline for that picture. Nothing in the drawing changes, only what a reader says.
    expect(card).toBe(
      `<section class="case"><h2 class="tag">${labels['content.preview.card']}</h2>` +
        `<h3 class="head">${headline.ar}</h3>` +
        `<div class="pair"><figure><img src="/uploads/202610/before.webp" alt=""><figcaption>${labels['content.result.before']}</figcaption></figure>` +
        `<figure><img src="/uploads/202610/after.webp" alt=""><figcaption>${labels['content.result.after']}</figcaption></figure></div>` +
        `<div class="chips"><span class="chip">${sessions.ar}</span></div></section>`,
    );
    expect(zoom).not.toContain('class="cap"');
    expect(zoom).not.toContain('class="note"');
  });

  it('falls back to the related article the way the page does', () => {
    const doc = { ...completeDoc, title: { ar: '', en: '' } };
    expect(preview(doc).model.resultCase?.headline).toBe(storyName);
    // With neither, the drawing says nothing rather than inventing something.
    expect(preview({ ...doc, story: '' }).model.resultCase?.headline).toBe('');
    expect(cases(preview({ ...doc, story: '' }).html)[0]).toContain('<h3 class="head">—</h3>');
  });

  it('reads the second language when the person edits that tab', () => {
    const { model, html } = preview(completeDoc, 'en');
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(model.resultCase?.headline).toBe(headline.en);
    expect(model.resultCase?.service).toBe(serviceName);
    const [card] = cases(html);
    expect(card).toContain(labelsEn['content.preview.card']);
    expect(card).toContain(labelsEn['content.result.before']);
    expect(card).toContain(`alt="${after.en}"`);
  });
});

describe('the preview shows a half case as the half it is', () => {
  const missingAfter = { ...completeDoc, after: '' };

  it('names the empty slot and says the sentence the notice says', () => {
    const { model, html } = preview(missingAfter);
    expect(model.resultCase?.half).toBe(true);
    const [card, zoom] = cases(html);
    for (const drawing of [card, zoom]) {
      expect(drawing).toContain(
        `<figure class="miss"><span>${results.fields.find((f) => f.stem === 'after')!.label.ar}</span>` +
          `<b>${labels['content.preview.missing']}</b></figure>`,
      );
    }
    // The sentence is said once, above the pair on the card. The enlarged view repeats the
    // empty slot but not the rule — one line per drawing would read as two complaints.
    expect(card).toContain(`<p class="warn">${labels['content.result.pair']}</p>`);
    expect(zoom).not.toContain('class="warn"');
    // The half that exists is still drawn — the person is checking the picture they uploaded.
    expect(card).toContain('<img src="/uploads/202610/before.webp"');
  });

  it('leaves the enlarged view with only one picture to enlarge', () => {
    const [card, zoom] = cases(preview({ ...completeDoc, before: '' }).html);
    expect(card).toContain(`<figure class="miss"><span>${results.fields.find((f) => f.stem === 'before')!.label.ar}</span>`);
    expect(zoom).toContain('<figcaption>' + labels['content.result.after'] + '</figcaption>');
  });

  it('warns only about one missing half, like the badge does', () => {
    expect(preview({ ...completeDoc, before: '', after: '' }).model.resultCase?.half).toBe(false);
    expect(preview(completeDoc).html).not.toContain('class="warn"');
  });

  it('carries its own stylesheet, never the site\u2019s or the console\u2019s', () => {
    const { html } = preview(completeDoc);
    expect(html).toContain('.pair.big img{aspect-ratio:3/2');
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('console-');
    expect(html).not.toContain('var(--');
  });
});
