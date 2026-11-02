/**
 * The typed service document: an imported row keeps every line it had, and the new
 * controls round-trip through the same parser the server runs.
 *
 * The two shapes in play are real. A service row imported from WordPress holds
 * `benefits_ar`/`benefits_en` and `steps_ar`/`steps_en` as parallel string arrays. The
 * editor now draws each benefit as a row with a text, a title and an icon, and each step
 * as a text, a title and a picture. This file proves the imported row is readable — no
 * unknown-key refusal, no lost sentence — and that a save writes the new shape without
 * asking the person to retype anything.
 */
import { describe, expect, it } from 'vitest';
import {
  listDocForm,
  listDocFromForm,
  listSchemaOf,
  parseListDoc,
  type ListSchema,
} from '../src/lib/content/list-schema';

const schema = (): ListSchema => {
  const found = listSchemaOf('services');
  if (!found) throw new Error('services schema is missing');
  return found;
};

/** A row as the import left it: the flat pair for every bilingual field. */
function importedDoc(): Record<string, unknown> {
  return {
    name_ar: 'تقشير كيميائي',
    name_en: 'Chemical peeling',
    intro_ar: 'تجديد البشرة بمقشر طبي',
    intro_en: 'Skin renewal with a medical peel',
    description_ar: '<p>وصف</p>',
    description_en: '<p>Description</p>',
    benefits_ar: ['بشرة أنعم', 'لون موحد'],
    benefits_en: ['Smoother skin', 'Even tone'],
    steps_ar: ['تنظيف', 'التقشير'],
    steps_en: ['Cleaning', 'The peel'],
    aftercare_ar: ['واقي شمس'],
    aftercare_en: ['Sunscreen'],
    ideal_ar: 'البشرة الباهتة',
    ideal_en: 'Dull skin',
    duration_ar: '٣٠ دقيقة',
    duration_en: '30 minutes',
    sessions_ar: '٣ جلسات',
    sessions_en: '3 sessions',
    price: 1500,
    image: '/uploads/peel.jpg',
    alt_ar: 'صورة التقشير',
    alt_en: 'A peel picture',
    body_ar: '',
    body_en: '',
    featured: true,
    category: 'skincare',
  };
}

describe('an imported service row still parses', () => {
  it('accepts every key the import wrote, and names none of them unknown', () => {
    const parsed = parseListDoc(schema(), importedDoc());
    expect(parsed.unknown).toEqual({});
    expect(parsed.issues).toEqual([]);
  });

  it('folds each legacy benefit and step into its first text cell', () => {
    const { doc } = parseListDoc(schema(), importedDoc());
    expect(doc.benefits).toEqual([
      { text_ar: 'بشرة أنعم', text_en: 'Smoother skin', title_ar: '', title_en: '', icon: '' },
      { text_ar: 'لون موحد', text_en: 'Even tone', title_ar: '', title_en: '', icon: '' },
    ]);
    expect(doc.steps).toEqual([
      { text_ar: 'تنظيف', text_en: 'Cleaning', title_ar: '', title_en: '', image: '' },
      { text_ar: 'التقشير', text_en: 'The peel', title_ar: '', title_en: '', image: '' },
    ]);
    // The keys the old shape used are gone from the canonical document; the words are not.
    expect(doc).not.toHaveProperty('benefits_ar');
    expect(doc).not.toHaveProperty('steps_ar');
  });

  it('round-trips an untouched row without asking the person to retype it', () => {
    const form = listDocForm(schema(), importedDoc());
    expect(form['benefits.0.text_ar']).toBe('بشرة أنعم');
    expect(form['steps.1.text_en']).toBe('The peel');
    expect(form['aftercare_ar.0']).toBe('واقي شمس');

    const saved = listDocFromForm(schema(), form);
    expect(saved.issues).toEqual([]);
    expect(saved.unknown).toEqual({});
    const again = parseListDoc(schema(), importedDoc());
    // `sections` is the one field the old row never wrote: the parser supplies the defaults,
    // so the untouched save differs only by the field the console now owns.
    expect(again.doc.sections).toBeDefined();
    expect(saved.doc).toEqual(again.doc);
  });
});

describe('the new benefit and step cells are typed', () => {
  it('keeps a title and an icon beside the sentence', () => {
    const { doc, issues } = parseListDoc(schema(), {
      name_en: 'A service',
      benefits: [{ text_ar: 'نص', text_en: 'Text', title_en: 'Hydration', icon: 'droplet' }],
    });
    expect(doc.benefits).toEqual([{ text_ar: 'نص', text_en: 'Text', title_ar: 'Hydration', title_en: 'Hydration', icon: 'droplet' }]);
    expect(issues).toEqual([]);
  });

  it('refuses an icon the picker does not offer', () => {
    const { issues } = parseListDoc(schema(), {
      name_en: 'A service',
      benefits: [{ text_en: 'Text', icon: 'rocket' }],
    });
    expect(issues).toContainEqual({ path: 'benefits.0.icon', message: 'unknown option' });
  });

  it('requires the sentence a benefit exists to carry', () => {
    const { issues } = parseListDoc(schema(), {
      name_en: 'A service',
      benefits: [{ title_en: 'Hydration' }],
    });
    expect(issues).toContainEqual({ path: 'benefits.0.text', message: 'required' });
  });

  it('drops a row nobody filled instead of storing empty strings', () => {
    const { doc } = parseListDoc(schema(), {
      name_en: 'A service',
      gallery: [
        { image: '/uploads/a.jpg', caption_en: 'First' },
        { image: '', alt_en: '', caption_en: '' },
      ],
    });
    expect(doc.gallery).toEqual([{ image: '/uploads/a.jpg', alt_ar: '', alt_en: '', caption_ar: 'First', caption_en: 'First' }]);
  });
});

describe('section order and visibility', () => {
  it('starts a row that never had sections with every section visible, in catalogue order', () => {
    const { doc } = parseListDoc(schema(), { name_en: 'A service' });
    expect(doc.sections).toEqual([
      { key: 'overview', visible: true },
      { key: 'how', visible: true },
      { key: 'prep', visible: true },
      { key: 'safety', visible: true },
      { key: 'pricing', visible: true },
      { key: 'proof', visible: true },
      { key: 'gallery', visible: true },
      { key: 'people', visible: true },
      { key: 'faq', visible: true },
      { key: 'related', visible: true },
    ]);
  });

  it('keeps the order somebody chose, and appends a section the row predates', () => {
    const { doc, issues } = parseListDoc(schema(), {
      name_en: 'A service',
      sections: [
        { key: 'faq', visible: true },
        { key: 'overview', visible: false },
        { key: 'gallery', visible: true },
      ],
    });
    expect(issues).toEqual([]);
    expect((doc.sections as { key: string }[]).slice(0, 3).map((entry) => entry.key)).toEqual(['faq', 'overview', 'gallery']);
    // Every other section is still on the page, after the three the row named.
    expect(doc.sections).toHaveLength(10);
    expect((doc.sections as { key: string }[]).map((entry) => entry.key)).toContain('how');
    expect(doc.sections).toContainEqual({ key: 'overview', visible: false });
  });

  it('refuses a key no component draws, and a section named twice', () => {
    const unknown = parseListDoc(schema(), { name_en: 'A service', sections: [{ key: 'discount-banner', visible: true }] });
    expect(unknown.issues).toContainEqual({ path: 'sections.0.key', message: 'unknown section' });

    const duplicate = parseListDoc(schema(), { name_en: 'A service', sections: [{ key: 'faq' }, { key: 'faq' }] });
    expect(duplicate.issues).toContainEqual({ path: 'sections.1.key', message: 'duplicate section' });
  });

  it('round-trips order and visibility through the form', () => {
    const form = listDocForm(schema(), {
      name_en: 'A service',
      sections: [
        { key: 'gallery', visible: false },
        { key: 'overview', visible: true },
      ],
    });
    expect(form['sections.0.key']).toBe('gallery');
    expect(form['sections.0.visible']).toBe(false);
    expect(form['sections.1.key']).toBe('overview');
    expect(form['sections.1.visible']).toBe(true);

    const saved = listDocFromForm(schema(), form);
    expect((saved.doc.sections as { key: string; visible: boolean }[]).slice(0, 2)).toEqual([
      { key: 'gallery', visible: false },
      { key: 'overview', visible: true },
    ]);
  });
});
