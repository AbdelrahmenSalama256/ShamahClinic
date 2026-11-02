/**
 * B3 — the typed service page, read from the row that stores it.
 *
 * The schema test (`service-schema.test.ts`) proves the editor accepts and canonicalises a
 * service document. This one proves the other half of the contract: the page reader that
 * the console's preview, the list warnings and the public page share understands every
 * shape the database can hand it, does not invent a section, and scores a row by what the
 * clinic actually wrote.
 *
 * What is deliberately not here: any real price, photo or medical sentence. The fixtures
 * are obviously test copy, because a test that asserted against clinic wording would make
 * made-up wording look approved.
 */
import { describe, expect, it } from 'vitest';

import { SERVICE_SECTIONS } from '../src/lib/content/list-schema';
import {
  SERVICE_CHECKS,
  renderedSections,
  sectionFilled,
  serviceCompleteness,
  serviceOfDoc,
  serviceSections,
  serviceWarnings,
} from '../src/lib/content/service-doc';

/** The document the WordPress import wrote — flat pairs, benefits and steps as string arrays. */
const importedDoc = (): Record<string, unknown> => ({
  name_ar: 'تقشير تجريبي',
  name_en: 'A test peel',
  intro_ar: 'جملة قصيرة للاختبار',
  intro_en: 'A short test sentence',
  description_ar: '<p>وصف تجريبي</p>',
  description_en: '<p>Test description</p>',
  benefits_ar: ['فائدة أولى', 'فائدة ثانية'],
  benefits_en: ['First benefit', 'Second benefit'],
  steps_ar: ['خطوة أولى'],
  steps_en: ['First step'],
  aftercare_ar: ['تعليم أول'],
  aftercare_en: ['First instruction'],
  ideal_ar: 'مناسب لحالة تجريبية',
  ideal_en: 'Suits a test case',
  duration_ar: '٣٠ دقيقة',
  duration_en: '30 minutes',
  sessions_ar: '٣ جلسات',
  sessions_en: '3 sessions',
  price: 1500,
  image: '/uploads/test-service.jpg',
  alt_ar: '',
  alt_en: '',
  body_ar: '',
  body_en: '',
  featured: true,
  category: 'skincare',
  href: '',
});

const richDoc = (): Record<string, unknown> => ({
  name_ar: 'خدمة تجريبية',
  name_en: 'Test service',
  intro_ar: 'سطر',
  intro_en: 'One line',
  category: 'laser',
  image: '/uploads/hero.jpg',
  alt_ar: 'صورة اختبار',
  alt_en: 'Test photo',
  heroHeadline_ar: 'عنوان',
  heroHeadline_en: 'Headline',
  heroSubheadline_ar: 'سطر فرعي',
  heroSubheadline_en: 'Subheadline',
  ctaPrimary: 'whatsapp',
  ctaSecondary: 'call',
  description_ar: '<p>وصف</p>',
  description_en: '<p>Description</p>',
  benefits: [
    { text_ar: 'نص فائدة', text_en: 'Benefit text', title_ar: 'عنوان', title_en: 'A title', icon: 'droplet' },
    { text_ar: '', text_en: '', title_ar: '', title_en: '', icon: '' },
    { text_ar: 'بلا أيقونة', text_en: 'No icon', title_ar: '', title_en: '', icon: '' },
  ],
  ideal_ar: 'مناسب',
  ideal_en: 'Best for',
  notFor_ar: ['حالة أولى'],
  notFor_en: ['First case'],
  steps: [{ text_ar: 'خطوة', text_en: 'A step', title_ar: '', title_en: '', image: '/uploads/step.jpg' }],
  duration_ar: 'دقيقة',
  duration_en: 'A minute',
  contraindications_ar: ['حالة تمنع'],
  contraindications_en: ['A condition that rules it out'],
  sideEffects_ar: [],
  sideEffects_en: [],
  showDisclaimer: true,
  price: 2000,
  priceMax: 2500,
  currency: 'EGP',
  priceNote_ar: 'يشمل الجلسة',
  priceNote_en: 'Includes the session',
  priceOnRequest: false,
  offers: ['test-offer'],
  results: ['test-result'],
  specialists: ['test-specialist'],
  branches: ['test-branch'],
  faq: ['test-question'],
  faqInline: [
    { question_ar: 'سؤال؟', question_en: 'A question?', answer_ar: 'جواب', answer_en: 'An answer' },
    { question_ar: '', question_en: '', answer_ar: '', answer_en: '' },
  ],
  relatedServices: ['another-service'],
  relatedArticles: ['test-article'],
  body_ar: 'تفاصيل',
  body_en: 'Details',
  seoTitle_ar: 'عنوان البحث',
  seoTitle_en: 'Search title',
  seoDescription_ar: 'وصف البحث',
  seoDescription_en: 'Search description',
  focusKeyword: 'test',
  sections: [
    { key: 'faq', visible: true },
    { key: 'gallery', visible: false },
    { key: 'overview', visible: true },
  ],
});

describe('a service document becomes the page that draws it', () => {
  it('reads the imported flat shape, including benefits and steps as string arrays', () => {
    const content = serviceOfDoc(importedDoc(), 'peeling');
    expect(content).not.toBeNull();
    expect(content!.name).toEqual({ ar: 'تقشير تجريبي', en: 'A test peel' });
    expect(content!.benefits.map((benefit) => benefit.text.en)).toEqual(['First benefit', 'Second benefit']);
    expect(content!.benefits[0].title).toEqual({ ar: '', en: '' });
    expect(content!.benefits[0].icon).toBeNull();
    expect(content!.steps.map((step) => step.text.ar)).toEqual(['خطوة أولى']);
    expect(content!.steps[0].image).toBeNull();
    // The old aftercare array is still the aftercare list, read as a pair.
    expect(content!.aftercare.ar).toEqual(['تعليم أول']);
    expect(content!.pricing.price).toBe(1500);
    expect(content!.pricing.currency).toBe('');
    expect(content!.featured).toBe(true);
    expect(content!.category).toBe('skincare');
  });

  it('names a picture by the service when no description was written', () => {
    const content = serviceOfDoc(importedDoc(), 'peeling')!;
    expect(content.hero.alt).toEqual({ ar: 'تقشير تجريبي', en: 'A test peel' });
  });

  it('reads the rich shape: titled benefits, step pictures, gallery, inline questions', () => {
    const content = serviceOfDoc(richDoc(), 'test')!;
    // A benefit with no sentence is dropped; a title alone is not a benefit.
    expect(content.benefits).toHaveLength(2);
    expect(content.benefits[0]).toEqual({ text: { ar: 'نص فائدة', en: 'Benefit text' }, title: { ar: 'عنوان', en: 'A title' }, icon: 'droplet' });
    expect(content.benefits[1].icon).toBeNull();
    expect(content.steps[0].image).toBe('/uploads/step.jpg');
    expect(content.hero.ctaPrimary).toBe('whatsapp');
    expect(content.hero.ctaSecondary).toBe('call');
    expect(content.faq.inline).toHaveLength(1);
    expect(content.notFor.ar).toEqual(['حالة أولى']);
    expect(content.faq.refs).toEqual(['test-question']);
    expect(content.pricing.offers).toEqual(['test-offer']);
  });

  it('keeps the author’s section order and appends what the row never mentioned', () => {
    const content = serviceOfDoc(richDoc(), 'test')!;
    const keys = content.sections.map((entry) => entry.key);
    expect(keys.slice(0, 3)).toEqual(['faq', 'gallery', 'overview']);
    expect(keys).toHaveLength(SERVICE_SECTIONS.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(SERVICE_SECTIONS.map((section) => section.key)));
    expect(content.sections.find((entry) => entry.key === 'gallery')?.visible).toBe(false);
    expect(content.sections.find((entry) => entry.key === 'faq')?.visible).toBe(true);
  });

  it('gives a row with no section list the whole page, in catalogue order', () => {
    const content = serviceOfDoc(importedDoc(), 'peeling')!;
    expect(content.sections).toEqual(SERVICE_SECTIONS.map((section) => ({ key: section.key, visible: true })));
  });

  it('falls back to a title, then refuses a row with no name at all', () => {
    expect(serviceOfDoc({ title_ar: 'عنوان', title_en: 'Title' }, 'x')?.name).toEqual({ ar: 'عنوان', en: 'Title' });
    expect(serviceOfDoc({ name_ar: '', name_en: '', intro_en: 'orphan' }, 'x')).toBeNull();
  });

  it('reads a legacy document and a canonical one to the same words', () => {
    const legacy = serviceOfDoc(importedDoc(), 'peeling')!;
    const canonical = serviceOfDoc(
      {
        ...importedDoc(),
        benefits: [
          { text_ar: 'فائدة أولى', text_en: 'First benefit', title_ar: '', title_en: '', icon: '' },
          { text_ar: 'فائدة ثانية', text_en: 'Second benefit', title_ar: '', title_en: '', icon: '' },
        ],
        steps: [{ text_ar: 'خطوة أولى', text_en: 'First step', title_ar: '', title_en: '', image: '' }],
        sections: SERVICE_SECTIONS.map((section) => ({ key: section.key, visible: true })),
      },
      'peeling',
    )!;
    expect(canonical.benefits).toEqual(legacy.benefits);
    expect(canonical.steps).toEqual(legacy.steps);
    expect(canonical.sections).toEqual(legacy.sections);
    expect(renderedSections(canonical).map((section) => section.key)).toEqual(renderedSections(legacy).map((section) => section.key));
  });
});

describe('a section draws only when it has something to draw', () => {
  it('drops a section the author hid even when it is full', () => {
    const content = serviceOfDoc(
      {
        ...richDoc(),
        gallery: [{ image: '/uploads/gallery.jpg', alt_ar: 'صورة', alt_en: 'A photo', caption_ar: '', caption_en: '' }],
      },
      'test',
    )!;
    const gallery = serviceSections(content).find((section) => section.key === 'gallery')!;
    expect(gallery.filled).toBe(true);
    expect(gallery.visible).toBe(false);
    expect(gallery.render).toBe(false);
    expect(renderedSections(content).map((section) => section.key)).not.toContain('gallery');
  });

  it('hides an empty section even when its switch is on', () => {
    // The imported row has no gallery, no questions, no specialists and no offers.
    const content = serviceOfDoc(importedDoc(), 'peeling')!;
    const rendered = renderedSections(content).map((section) => section.key);
    expect(rendered).toEqual(expect.arrayContaining(['overview', 'how', 'prep']));
    expect(rendered).not.toContain('gallery');
    expect(rendered).not.toContain('people');
    expect(rendered).not.toContain('faq');
    expect(rendered).not.toContain('related');
  });

  it('counts the shared disclaimer as safety, and a toggle alone as nothing else', () => {
    const base = serviceOfDoc(importedDoc(), 'peeling')!;
    expect(sectionFilled(base, 'safety')).toBe(false);
    const withSwitch = serviceOfDoc({ ...importedDoc(), showDisclaimer: true }, 'peeling')!;
    expect(sectionFilled(withSwitch, 'safety')).toBe(true);
  });

  it('counts each section from its own fields', () => {
    const content = serviceOfDoc(richDoc(), 'test')!;
    expect(sectionFilled(content, 'overview')).toBe(true);
    expect(sectionFilled(content, 'how')).toBe(true);
    expect(sectionFilled(content, 'pricing')).toBe(true);
    expect(sectionFilled(content, 'proof')).toBe(true);
    expect(sectionFilled(content, 'people')).toBe(true);
    expect(sectionFilled(content, 'faq')).toBe(true);
    expect(sectionFilled(content, 'related')).toBe(true);
    expect(sectionFilled(content, 'gallery')).toBe(false);
  });
});

describe('the console is told the gaps a visitor would notice', () => {
  it('names the four warnings the list prints', () => {
    const bare = serviceOfDoc({ name_en: 'Only a name' }, 'x')!;
    // An empty primary action means the booking button, so it is not a warning.
    expect(serviceWarnings(bare)).toEqual(['no_intro', 'no_hero_image', 'no_faq']);
    const muted = serviceOfDoc({ name_en: 'Only a name', ctaPrimary: 'none' }, 'x')!;
    expect(serviceWarnings(muted)).toContain('no_primary_cta');
    expect(serviceWarnings(serviceOfDoc(richDoc(), 'test')!)).toEqual([]);
  });
});

describe('completeness scores what the clinic wrote, never a default', () => {
  it('scores a full row at 100 and a name-only row at one check', () => {
    expect(serviceCompleteness(serviceOfDoc(richDoc(), 'test')!)).toMatchObject({ score: 100, missing: [], total: SERVICE_CHECKS.length });
    const bare = serviceCompleteness(serviceOfDoc({ name_en: 'Only a name' }, 'x')!);
    // The booking button is the one default that counts as a real action on the page; a
    // hidden gallery is still empty, and nothing else has been written.
    expect(bare.done).toEqual(['primary_cta']);
    expect(bare.score).toBe(Math.round((1 / SERVICE_CHECKS.length) * 100));
  });

  it('does not count the disclaimer toggle, or a price note alone, as written content', () => {
    const content = serviceOfDoc(
      {
        name_en: 'Test',
        showDisclaimer: true,
        priceNote_en: 'Ask the clinic',
        seoTitle_en: 'Title only',
      },
      'x',
    )!;
    const result = serviceCompleteness(content);
    expect(result.missing).toEqual(expect.arrayContaining(['safety', 'pricing', 'seo']));
  });

  it('has one check for every section it promises to score', () => {
    expect(new Set(SERVICE_CHECKS).size).toBe(SERVICE_CHECKS.length);
    expect(SERVICE_CHECKS).toEqual(expect.arrayContaining(['intro', 'hero_image', 'benefits', 'how', 'safety', 'pricing', 'faq', 'seo']));
  });
});
