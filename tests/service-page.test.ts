/**
 * B2b — what a service page holds once its references are resolved.
 *
 * `service-doc.test.ts` proves the reader understands every shape a row can be written in.
 * This proves the other question the page asks: those rows *name* offers, cases, doctors and
 * questions by id, and an id is only a request. Each claim here is about what happens when the
 * thing named is missing, hidden, or answers a different question than the row thinks it asked:
 *
 *   - **an offer's own scope outranks the service that picked it.** The row may name an offer
 *     that says `no services`; the offer wins, because that answer was set while deciding who
 *     may book through it.
 *   - **half a comparison is not one**, and a list of ids that resolve to nothing is not a
 *     section — which is what keeps «الأسئلة الشائعة» from standing over questions nobody
 *     published.
 *   - **a service with no related ids still gets the strip it has always had**, from its own
 *     category or from the featured rows, including when the two readers spell "no category"
 *     differently.
 *   - **the console's words are the page's words**, so a heading is checked against the schema
 *     the editor writes rather than against a string the component remembered.
 *
 * What is deliberately not here: real clinic wording, prices or photographs. Every fixture is
 * obviously test copy.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BranchDetail } from '../src/data/branches';
import type { FaqItem } from '../src/data/faq';
import type { Specialist } from '../src/data/specialists';
import type { Treatment, TreatmentCategory } from '../src/data/treatments';
import type { ArticleCard, Offer } from '../src/lib/wp/types';
import type { ResultStory } from '../src/lib/content/site';
import type { ServicePage } from '../src/lib/content/service-page';
import { SERVICE_SECTIONS, fieldLabelOf } from '../src/lib/content/list-schema';
import { buildServicePage, type ServicePageDeps } from '../src/lib/content/service-page';
import { serviceOfDoc } from '../src/lib/content/service-doc';
import { toPhotoSlot } from '../src/lib/wp/ui-helpers';

// The page is a client component: the locale comes off the path and its links need a router.
let mockPath = '/en/services/svc-peel';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => undefined,
  redirect: () => undefined,
}));

const { LanguageProvider } = await import('../src/context/LanguageContext');
const { TreatmentDetailClient } = await import('../src/components/pages/TreatmentDetailClient');

const bi = (ar: string, en: string) => ({ ar, en });

/** The keys the service rows in these tests are written against. */
const MINE = 'svc-peel';
const OTHER = 'svc-laser';

function card(id: string, over: Partial<Treatment> = {}): Treatment {
  return {
    id,
    category: null,
    categoryName: bi('فئة اختبار', 'Test category'),
    name: bi(`جلسة ${id}`, `Session ${id}`),
    tagline: bi('سطر اختبار', 'A test line'),
    description: bi('وصف اختبار', 'A test description'),
    benefits: { ar: [], en: [] },
    steps: { ar: [], en: [] },
    aftercare: { ar: [], en: [] },
    idealFor: bi('', ''),
    duration: bi('', ''),
    sessionsRecommended: bi('', ''),
    priceStartingAt: null,
    image: toPhotoSlot(`/uploads/${id}.jpg`, bi('صورة اختبار', 'A test photo')),
    featured: false,
    ...over,
  };
}

function offerRow(slug: string, services: string[] | null): Offer {
  return {
    id: slug.length,
    slug,
    name: bi(`عرض ${slug}`, `Offer ${slug}`),
    excerpt: bi('سطر', 'One line'),
    price: 100,
    regularPrice: 200,
    currency: 'EGP',
    onSale: true,
    discountPercent: 50,
    images: [{ src: `/uploads/${slug}.jpg`, alt: bi('صورة اختبار', 'A test photo') }],
    image: `/uploads/${slug}.jpg`,
    imageAlt: bi('صورة اختبار', 'A test photo'),
    services,
    validFrom: null,
    validUntil: null,
    href: bi(`/offers/${slug}`, `/en/offers/${slug}`),
  };
}

function storyOf(key: string, pair: ResultStory['pair']): ResultStory {
  return {
    key,
    card: null,
    phrases: [],
    headline: bi(`حالة ${key}`, `Case ${key}`),
    pair,
    area: bi('وجه', 'Face'),
    sessions: bi('٣ جلسات', '3 sessions'),
    caption: bi('تعليق', 'A caption'),
    note: bi('', ''),
    service: null,
    showOnHome: false,
  };
}

const bothPhotos = {
  before: '/uploads/before.jpg',
  after: '/uploads/after.jpg',
  beforeAlt: bi('قبل', 'Before'),
  afterAlt: bi('بعد', 'After'),
};

function specialist(id: string): Specialist {
  return {
    id,
    name: bi(`دكتور ${id}`, `Doctor ${id}`),
    title: bi('اختبار', 'Test'),
    credentials: bi('', ''),
    bio: bi('', ''),
    specialties: { ar: [], en: [] },
    experienceYears: 1,
    branches: [],
    image: toPhotoSlot(`/uploads/${id}.jpg`, bi('صورة اختبار', 'A test photo')),
  };
}

function branch(id: string): BranchDetail {
  return {
    id,
    name: bi(`فرع ${id}`, `Branch ${id}`),
    address: bi('عنوان', 'An address'),
    phone: '+20000000000',
    area: bi('منطقة', 'An area'),
    image: toPhotoSlot(`/uploads/${id}.jpg`, bi('صورة اختبار', 'A test photo')),
    intro: bi('', ''),
    features: { ar: [], en: [] },
    landmark: bi('', ''),
  };
}

function faqOf(id: string): FaqItem {
  return { id, question: bi(`سؤال ${id}؟`, `Question ${id}?`), answer: bi('جواب', 'An answer'), category: 'general' };
}

function articleCard(slug: string): ArticleCard {
  return {
    id: slug.length,
    slug,
    title: bi(`مقال ${slug}`, `Article ${slug}`),
    excerpt: bi('', ''),
    image: `/uploads/${slug}.jpg`,
    imageAlt: bi('صورة اختبار', 'A test photo'),
    date: '2026-01-01T00:00:00',
    modified: '2026-01-01T00:00:00',
    category: null,
    categorySlug: null,
    href: bi(`/journal/${slug}`, `/en/journal/${slug}`),
  };
}

const deps = (over: Partial<ServicePageDeps> = {}): ServicePageDeps => ({
  offers: [],
  cards: [],
  cases: [],
  specialists: [],
  branches: [],
  faq: [],
  articles: [],
  ...over,
});

const noCategory = { name_ar: 'تقشير تجريبي', name_en: 'A test peel', category: '' };

describe('an offer answers for itself', () => {
  const directory = [
    offerRow('scoped-to-me', [MINE]),
    offerRow('unconfigured', null),
    offerRow('all-services', ['*']),
    offerRow('scoped-away', [OTHER]),
    offerRow('no-services', []),
    offerRow('never-named', ['*']),
  ];
  const named = ['no-services', 'scoped-away', 'all-services', 'unconfigured', 'scoped-to-me'];

  it('keeps the ones that allow this service and drops the ones that do not', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, price: 1500, offers: named }, MINE)!,
      deps({ offers: directory }),
    );
    expect(page.offers.map((offer) => offer.slug)).toEqual(['scoped-to-me', 'unconfigured', 'all-services']);
  });

  it('keeps the offers list in its own order, not the order they were picked', () => {
    const page = buildServicePage(serviceOfDoc({ ...noCategory, offers: [...named].reverse() }, MINE)!, deps({ offers: directory }));
    expect(page.offers.map((offer) => offer.slug)).toEqual(['scoped-to-me', 'unconfigured', 'all-services']);
  });

  it('draws no pricing heading for a row whose only offer was refused', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, offers: ['no-services'] }, MINE)!,
      deps({ offers: directory }),
    );
    expect(page.offers).toHaveLength(0);
    expect(page.sections.map((section) => section.key)).not.toContain('pricing');
  });
});

describe('a section is drawn only when it resolves to something', () => {
  it('drops a question list whose every id points at nothing', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, faq: ['gone-1', 'gone-2'] }, MINE)!,
      deps({ faq: [faqOf('other')] }),
    );
    expect(page.questions).toHaveLength(0);
    expect(page.sections.map((section) => section.key)).not.toContain('faq');
  });

  it('drops a team that names doctors and branches none of which exist', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, specialists: ['gone'], branches: ['gone'] }, MINE)!,
      deps({ specialists: [specialist('real')], branches: [branch('real')] }),
    );
    expect(page.specialists).toHaveLength(0);
    expect(page.branches).toHaveLength(0);
    expect(page.sections.map((section) => section.key)).not.toContain('people');
    // The doctor card names the branches *its own* row lists, so it needs the whole list.
    expect(page.allBranches.map((item) => item.id)).toEqual(['real']);
  });

  it('leaves the disclaimer switch to draw nothing on its own', () => {
    const page = buildServicePage(serviceOfDoc({ ...noCategory, showDisclaimer: true }, MINE)!, deps());
    expect(page.sections.map((section) => section.key)).not.toContain('safety');
    const withWords = buildServicePage(
      serviceOfDoc({ ...noCategory, showDisclaimer: true, contraindications_ar: ['حالة تمنع'] }, MINE)!,
      deps(),
    );
    expect(withWords.sections.map((section) => section.key)).toContain('safety');
  });

  it('drops a case with one photograph, and keeps one with both', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, results: ['half', 'whole'] }, MINE)!,
      deps({ cases: [storyOf('half', null), storyOf('whole', bothPhotos)] }),
    );
    expect(page.cases.map((item) => item.key)).toEqual(['whole']);
    expect(page.cases[0].pair.before.src).toBe('/uploads/before.jpg');
    expect(page.cases[0].pair.after.alt).toEqual(bi('بعد', 'After'));
    const oneSided = buildServicePage(serviceOfDoc({ ...noCategory, results: ['half'] }, MINE)!, deps({ cases: [storyOf('half', null)] }));
    expect(oneSided.sections.map((section) => section.key)).not.toContain('proof');
  });

  it('keeps a video it can play and drops one it cannot', () => {
    const withVideo = buildServicePage(
      serviceOfDoc({ ...noCategory, videoUrl: '/uploads/session.mp4', videoPoster: '/uploads/poster.jpg' }, MINE)!,
      deps(),
    );
    expect(withVideo.video).toEqual({ url: '/uploads/session.mp4', poster: '/uploads/poster.jpg' });
    expect(withVideo.sections.map((section) => section.key)).toContain('proof');
    expect(buildServicePage(serviceOfDoc(noCategory, MINE)!, deps()).video).toBeNull();
  });

  it('holds the author’s order across the sections that survive', () => {
    const page = buildServicePage(
      serviceOfDoc(
        {
          ...noCategory,
          description_ar: 'وصف',
          description_en: 'Description',
          duration_en: '30 minutes',
          faq: ['q1'],
          sections: [
            { key: 'how', visible: true },
            { key: 'faq', visible: true },
            { key: 'overview', visible: true },
          ],
        },
        MINE,
      )!,
      deps({ faq: [faqOf('q1')] }),
    );
    expect(page.sections.map((section) => section.key)).toEqual(['how', 'faq', 'overview']);
    expect(page.sections.every((section) => section.label.ar !== '' && section.label.en !== '')).toBe(true);
  });
});

describe('the related strip survives both ways it is written', () => {
  const siblings = [
    card(OTHER, { category: 'skincare' as TreatmentCategory }),
    card(MINE, { category: 'skincare' as TreatmentCategory }),
    card('svc-third', { category: 'skincare' as TreatmentCategory }),
    card('svc-laser-2', { category: 'laser' as TreatmentCategory }),
    card('svc-star', { featured: true }),
  ];

  it('uses the ids the row names, in the directory’s order', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, relatedServices: ['svc-star', OTHER], relatedArticles: ['post-b', 'post-a'] }, MINE)!,
      deps({ cards: siblings, articles: [articleCard('post-a'), articleCard('post-b')] }),
    );
    expect(page.relatedServices.map((item) => item.id)).toEqual([OTHER, 'svc-star']);
    expect(page.relatedArticles.map((item) => item.slug)).toEqual(['post-a', 'post-b']);
  });

  it('suggests the siblings the listing already used when the row names none', () => {
    const page = buildServicePage(serviceOfDoc({ ...noCategory, category: 'skincare' }, MINE)!, deps({ cards: siblings }));
    // Same category, plus anything the clinic marks featured — the rule the card grid used,
    // with the page itself left out.
    expect(page.relatedServices.map((item) => item.id)).toEqual([OTHER, 'svc-third', 'svc-star']);
    expect(page.relatedServices.some((item) => item.id === MINE)).toBe(false);
  });

  it('suggests three at most, which is what the strip is built to hold', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, category: 'laser' }, MINE)!,
      deps({ cards: [card('a', { category: 'laser' as TreatmentCategory }), card('b', { category: 'laser' as TreatmentCategory }), card('c', { category: 'laser' as TreatmentCategory }), card('d', { category: 'laser' as TreatmentCategory })] }),
    );
    expect(page.relatedServices.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('reads a card without a category and a row with an empty one as the same thing', () => {
    // The card type has no place for an empty category so it answers `null`; the console's
    // select leaves `''` behind. Spelled differently they would match nothing, and every
    // unfiled service would lose the strip it shows today.
    const page = buildServicePage(serviceOfDoc(noCategory, MINE)!, deps({ cards: siblings }));
    expect(page.relatedServices.map((item) => item.id)).toEqual(['svc-star']);
  });

  it('is absent, not empty, when neither the ids nor the suggestions resolve', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...noCategory, category: 'skincare', relatedArticles: ['missing-post'] }, MINE)!,
      deps({ cards: [card(MINE)] }),
    );
    expect(page.relatedServices).toHaveLength(0);
    expect(page.relatedArticles).toHaveLength(0);
    expect(page.sections.map((section) => section.key)).not.toContain('related');
  });
});

describe('questions, gallery and the settings the page borrows', () => {
  it('lists the picked questions first, in list order, then the row’s own', () => {
    const page = buildServicePage(
      serviceOfDoc(
        {
          ...noCategory,
          faq: ['q2', 'q1'],
          faqInline: [
            { question_ar: 'سؤال؟', question_en: 'A question?', answer_ar: 'جواب', answer_en: 'An answer' },
            { question_ar: 'ثانٍ؟', question_en: 'Another?', answer_ar: 'جواب', answer_en: 'An answer' },
          ],
        },
        MINE,
      )!,
      deps({ faq: [faqOf('q1'), faqOf('q2')] }),
    );
    expect(page.questions.map((item) => item.id)).toEqual(['q1', 'q2', 'inline-0', 'inline-1']);
  });

  it('carries the caption of each gallery photograph and no site-wide words of its own', () => {
    const page = buildServicePage(
      serviceOfDoc(
        {
          ...noCategory,
          gallery: [{ image: '/uploads/g1.jpg', alt_ar: 'صورة', alt_en: 'A photo', caption_ar: 'تعليق', caption_en: 'A caption' }],
        },
        MINE,
      )!,
      deps(),
    );
    expect(page.gallery).toEqual([{ slot: toPhotoSlot('/uploads/g1.jpg', bi('صورة', 'A photo')), caption: bi('تعليق', 'A caption') }]);
    // The currency word and the dialled number belong to the whole site and reach every
    // control through the provider the layout renders. Carried here they would sit in the
    // served HTML of a service nobody has priced — which is the thing the render gate
    // looks for, and the reason this page must not own either one.
    expect(page).not.toHaveProperty('currency');
    expect(page).not.toHaveProperty('phone');
  });
});

describe('the page names its headings with the console’s words', () => {
  /** Every stem `TreatmentDetailClient` asks the schema about. */
  const asked = [
    'body',
    'ideal',
    'benefits',
    'notFor',
    'steps',
    'duration',
    'sessions',
    'frequency',
    'timeline',
    'downtime',
    'anesthesia',
    'technology',
    'prep',
    'aftercare',
    'contraindications',
    'sideEffects',
    'price',
    'priceMax',
    'priceOnRequest',
    'specialists',
    'branches',
    'relatedServices',
    'relatedArticles',
  ];

  it.each(asked)('answers for %s', (stem) => {
    const label = fieldLabelOf('services', stem);
    expect(label, `the page would draw a heading with no words under it for ${stem}`).not.toBeNull();
    expect(label!.ar).not.toBe('');
    expect(label!.en).not.toBe('');
  });

  it('answers for every section, including the one the page writes for itself', () => {
    for (const section of SERVICE_SECTIONS) {
      expect(section.label.ar, `section ${section.key}`).not.toBe('');
      expect(section.label.en, `section ${section.key}`).not.toBe('');
    }
    expect(SERVICE_SECTIONS.map((section) => section.key)).toContain('overview');
  });

  it('answers nothing for a stem the schema does not have', () => {
    expect(fieldLabelOf('services', 'noSuchField')).toBeNull();
    expect(fieldLabelOf('branches', 'ideal')).toBeNull();
  });
});

const { BookingProvider } = await import('../src/context/BookingContext');

/**
 * The tree a public page really builds: the layout's providers, then the component. React 19
 * types a provider's `children` as a required prop and `createElement` will not take the third
 * argument in its place, while the lint rule wants the opposite — the same trade the
 * `clinic-words` suite documents, so the rule is silenced for the nest.
 */
/* eslint-disable react/no-children-prop */
function render(page: ServicePage, language: 'ar' | 'en' = 'en'): string {
  mockPath = `/${language}/services/${page.content.key}`;
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      {
        children: createElement(BookingProvider, {
          branches: [],
          treatments: [],
          specialists: [],
          children: createElement(TreatmentDetailClient, { page }),
        }),
      },
    ),
  );
}
/* eslint-enable react/no-children-prop */

/**
 * A page built from a row like the seven the clinic has published today — a name, an intro and
 * a description — plus whatever the test puts on top of it.
 */
function thinPage(fields: Record<string, unknown> = {}, over: Partial<ServicePageDeps> = {}): ServicePage {
  return buildServicePage(
    serviceOfDoc(
      {
        ...noCategory,
        intro_ar: 'سطر اختبار',
        intro_en: 'A test line',
        description_ar: '<p>وصف اختبار</p>',
        description_en: '<p>A test description</p>',
        ...fields,
      },
      MINE,
    )!,
    deps(over),
  );
}

describe('the ported page draws a group only when the row fills it', () => {
  const unwritten = [
    'How it works',
    'Preparation &amp; aftercare',
    'Safety',
    'Pricing &amp; offers',
    'Proof &amp; results',
    'Gallery',
    'Specialists &amp; branches',
    'FAQ',
    'Related services &amp; articles',
  ];

  it('draws the overview alone over a row that carries only its name, intro and description', () => {
    const markup = render(thinPage());
    expect(markup).toContain('About this treatment');
    expect(markup).toContain('A test description');
    for (const label of unwritten) {
      expect(markup, `the page drew a ${label} block the row never filled`).not.toContain(label);
    }
    for (const key of ['how', 'prep', 'safety', 'pricing', 'proof', 'gallery', 'people', 'faq', 'related']) {
      expect(markup, `the anchor #${key} would point at nothing`).not.toContain(`id="${key}"`);
    }
    expect(markup).not.toContain('aria-label="Page sections"');
  });

  it('reads in Arabic with the console’s own Arabic words', () => {
    const markup = render(thinPage(), 'ar');
    expect(markup).toContain('عن هذه الجلسة');
    expect(markup).toContain('وصف اختبار');
    expect(markup).not.toContain('About this treatment');
  });

  it('names a fact chip and a price with the words beside the box that wrote them', () => {
    const markup = render(thinPage({ duration_en: '30 minutes', price: 1500 }));
    expect(markup).toContain('aria-label="Treatment at a glance"');
    expect(markup).not.toContain('href="#how"');
    expect(markup).toContain('Session time');
    expect(markup).toContain('30 minutes');
    expect(markup).toContain('Pricing &amp; offers');
    expect(markup).toContain('Starting price');
    expect(markup).toContain('1500');
    expect(markup).toContain('EGP');
  });

  it('draws the benefit and step lists under their own headings', () => {
    const markup = render(
      thinPage({
        benefits: [{ text_en: 'A test benefit', text_ar: 'فائدة اختبار', icon: 'badge-check' }],
        steps: [{ text_en: 'A test step', text_ar: 'خطوة اختبار' }],
      }),
    );
    expect(markup).toContain('Benefits');
    expect(markup).toContain('A test benefit');
    expect(markup).toContain('How it works');
    expect(markup).not.toContain('Session steps');
    expect(markup).toContain('A test step');
  });

  it('keeps the sticky card the original had and takes it away when the owner chooses no action', () => {
    const booked = render(thinPage());
    expect(booked).toContain('<aside');
    expect(booked).toContain('Book Appointment');
    const muted = render(thinPage({ ctaPrimary: 'none' }));
    expect(muted).not.toContain('<aside');
    // With no card the column takes the whole width rather than leaving a gap beside it.
    expect(muted).toContain('lg:col-span-12');
  });

  it('offers WhatsApp only when the owner asked for the WhatsApp button', () => {
    expect(render(thinPage({ ctaSecondary: 'whatsapp' }))).toContain('WhatsApp');
    expect(render(thinPage())).not.toContain('WhatsApp');
  });

  it('opens the accordion for the questions it has, picked and written alike', () => {
    const markup = render(thinPage({ faq: ['q1'], faqInline: [{ question_en: 'An inline question?', answer_en: 'An inline answer' }] }, { faq: [faqOf('q1')] }));
    expect(markup).toContain('FAQ');
    expect(markup).toContain('Question q1?');
    expect(markup).toContain('An inline question?');
    expect(render(thinPage({ faq: ['gone'] }, { faq: [faqOf('q1')] }))).not.toContain('FAQ');
  });

  it('shows a case only when both of its photographs resolve', () => {
    const markup = render(thinPage({ results: ['whole', 'half'] }, { cases: [storyOf('whole', bothPhotos), storyOf('half', null)] }));
    expect(markup).toContain('Proof &amp; results');
    expect(markup).toContain('Case whole');
    expect(markup).not.toContain('Case half');
  });
});
