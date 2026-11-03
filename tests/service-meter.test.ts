/**
 * B4b: the service editor tells the owner how much of the page the site would show.
 *
 * The brief's own example is a sentence — *"Service page 70% complete — add FAQs, add
 * pricing"* — and a sentence is only worth painting if three things hold, which is what this
 * file checks:
 *
 *   - **the number comes from the words in the boxes**, not from the last write. The editor
 *     hands the panel the document `listDocFromForm` builds from the live form, which is the
 *     same document the save posts and the preview paints, so a sentence typed one second ago
 *     counts and a section the row merely defaults to never inflates the score.
 *   - **the basics and the optional sections read differently.** A page with no hero picture
 *     is a page the services grid shows badly; a page with no FAQ is a page that works and
 *     could say more. One undifferentiated list of thirteen would teach nobody the difference.
 *   - **it is an indicator and never a gate.** The save button's own conditions are asserted
 *     here unchanged, because the moment a meter can stop a draft, an owner with an honest
 *     eighty-percent page is told to throw it away.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ServiceCompleteness } from '../src/components/console/ServiceCompleteness';
import { catalogFor, type MessageKey } from '../src/lib/console/messages';
import { SERVICE_CHECKS, SERVICE_CORE_CHECKS, serviceCompletenessOfDoc } from '../src/lib/content/service-doc';

const labelsEn = catalogFor('en');
const labelsAr = catalogFor('ar');
const editorSource = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');

/** A row whose name, one line and picture are written — and nothing else is. */
const PARTIAL: Record<string, unknown> = {
  name_en: 'Test service',
  intro_en: 'One line',
  image: '/uploads/hero.jpg',
};

/** One value for each of the thirteen checks, in the shapes the import writes. */
const WRITTEN: Record<string, unknown> = {
  ...PARTIAL,
  description_en: '<p>Description</p>',
  benefits_en: ['A benefit'],
  steps_en: ['A step'],
  sideEffects_en: ['A side effect'],
  price: 2000,
  results: ['test-result'],
  specialists: ['test-specialist'],
  faq: ['test-question'],
  relatedServices: ['another-service'],
  seoTitle_en: 'Search title',
  seoDescription_en: 'Search description',
};

const paint = (doc: Record<string, unknown>, map = labelsEn): string =>
  renderToStaticMarkup(createElement(ServiceCompleteness, { doc, rowKey: 'test-service', labels: map }));

describe('the service meter in the editor', () => {
  it('says the score in one sentence, from the checks the row passes', () => {
    // Three of thirteen: the line, the picture, and the booking button the row always had.
    expect(serviceCompletenessOfDoc(PARTIAL, 'test-service').score).toBe(23);
    const markup = paint(PARTIAL);
    expect(markup).toContain('Service page 23% complete');
    expect(markup).toContain('3 of 13 sections written');
    expect(markup).not.toContain('{pct}');
    expect(markup).not.toContain('{done}');
    expect(markup).toContain('inline-size:23%');
  });

  it('names what is missing as the thing to add, and stays quiet about what is written', () => {
    const markup = paint(PARTIAL);
    expect(markup).toContain('add the service description');
    expect(markup).toContain('add FAQs');
    expect(markup).toContain('add pricing or offers');
    expect(markup).not.toContain('add a one-line description');
    expect(markup).not.toContain('add the hero image');
    expect(markup).not.toContain('add the booking button');
  });

  it('holds the basics apart from the optional sections', () => {
    const markup = paint(PARTIAL);
    const core = markup.indexOf('console-meter-part is-core');
    const optional = markup.indexOf('console-meter-part"');
    expect(core).toBeGreaterThan(-1);
    expect(optional).toBeGreaterThan(-1);
    // The description is the only basic this row is short of, and it sits in the first list.
    expect(markup.slice(core, optional)).toContain('add the service description');
    expect(markup.slice(core, optional)).not.toContain('add FAQs');
    expect(markup.slice(optional)).toContain('add FAQs');
    expect(markup).toContain('The page is missing its basics');
    expect(markup).toContain('Optional sections');
  });

  it('finishes the page instead of nagging when every check passes', () => {
    expect(serviceCompletenessOfDoc(WRITTEN, 'test-service').missing).toEqual([]);
    const markup = paint(WRITTEN);
    expect(markup).toContain('inline-size:100%');
    expect(markup).toContain('Every section is written.');
    expect(markup).not.toContain('console-meter-chips');
    expect(markup).not.toContain('add FAQs');
  });

  it('speaks Arabic when the editor does', () => {
    const markup = paint(PARTIAL, labelsAr);
    expect(markup).toContain('اكتمال صفحة الخدمة');
    expect(markup).toContain('صفحة الخدمة مكتملة 23% — كُتب 3 من 13 قسمًا');
    expect(markup).toContain('أضف الأسئلة الشائعة');
    expect(markup).not.toContain('add FAQs');
  });

  it('keeps the bar for the eye and the sentence for the voice', () => {
    const markup = paint(PARTIAL);
    // Which attribute comes first is the renderer's choice, so the bar is read as one tag.
    const bar = markup.match(/<span[^>]*console-meter-bar[^>]*>/)?.[0] ?? '';
    expect(bar).toContain('aria-hidden="true"');
    expect(markup).toContain('aria-label="Service page completeness"');
    // A panel of words the owner acts on, not a control that answers for it.
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
  });
});

describe('the meter is painted, never obeyed', () => {
  it('is drawn only for a service row, from the live form', () => {
    expect(editorSource).toContain("listSchema?.key === 'services'");
    // The document is the one the save would post, not the row that was read.
    expect(editorSource).toContain('<ServiceCompleteness doc={listDocFromForm(listSchema, shown).doc}');
  });

  it('leaves the save button to its own three conditions', () => {
    expect(editorSource).toContain('disabled={!canEditRow || !dirty || invalid}');
    expect(editorSource).not.toMatch(/disabled=\{[^}]*score/);
    expect(editorSource).not.toMatch(/completeness[^}]*disabled/);
  });
});

describe('the meter speaks every language the console does', () => {
  it('has a plain-language addition for each of the thirteen checks, twice', () => {
    for (const key of SERVICE_CHECKS) {
      const ar = labelsAr[`content.service.todo.${key}` as MessageKey];
      const en = labelsEn[`content.service.todo.${key}` as MessageKey];
      expect(ar, `${key} in Arabic`).toBeTruthy();
      expect(en, `${key} in English`).toBeTruthy();
      expect(ar).not.toBe(en);
      expect(en).toMatch(/^add /);
      expect(ar.startsWith('أضف ')).toBe(true);
    }
  });

  it('draws its basics from the checks the model declares', () => {
    expect(SERVICE_CORE_CHECKS.every((key) => SERVICE_CHECKS.includes(key))).toBe(true);
    const meter = serviceCompletenessOfDoc({}, 'test-service');
    // A row with no name is measured anyway: the editor has to answer for a fresh row too.
    expect(meter.score).toBe(8);
    expect([...meter.missingCore, ...meter.missingOptional].sort()).toEqual([...meter.missing].sort());
    expect(meter.missingCore).toEqual(['intro', 'hero_image', 'description']);
    expect(meter.missingOptional).not.toContain('intro');
  });
});
