/**
 * B5b — the schema.org a service page is allowed to publish.
 *
 * A crawler reads JSON-LD as the site's own claim about the page in front of it, so every
 * claim here is the question the page was built with, asked of the built page instead of of
 * the rendered pixels:
 *
 *   - **the node describes the page it ships on.** The name, the sentence, the photograph and
 *     the three links are the ones this URL draws, in the language this URL answers in — not
 *     the other language's words, not the row's internal code.
 *   - **a number is only published when the row published it.** «Price on request» stays words.
 *     A price with no three-letter currency code stays off the wire, because the page prints a
 *     display word for it and a display word is not an ISO 4217 code.
 *   - **an offer is only published when the pricing section drew its card.** An offer the row
 *     named and the read path refused never reaches the node, and an offer the read path kept
 *     with no publishable price is skipped on its own.
 *   - **the questions are the accordion's**, in its order, and a question the page leaves
 *     unanswered is not an answer the site claims.
 *
 * Each case builds the page the route does — `serviceOfDoc` then `buildServicePage` — because
 * the whole point is that the node is derived from what survived, not from the row's fields.
 * What is deliberately not here: real clinic wording, prices or photographs. Every fixture is
 * obviously test copy.
 */
import { describe, expect, it } from 'vitest';

import type { FaqItem } from '../src/data/faq';
import type { Offer } from '../src/lib/wp/types';
import { buildServicePage, type ServicePageDeps } from '../src/lib/content/service-page';
import { serviceOfDoc } from '../src/lib/content/service-doc';
import { servicePageJsonLd } from '../src/lib/content/service-jsonld';
import { SITE_URL } from '../src/lib/site';

type Node = Record<string, unknown>;

const bi = (ar: string, en: string) => ({ ar, en });

const KEY = 'svc-peel';
const EN_URL = `${SITE_URL}/en/services/${KEY}`;
const AR_URL = `${SITE_URL}/services/${KEY}`;

/** The row these tests are written against: a name, a summary line — and nothing else. */
const thin = { name_ar: 'جلسة تجريبيّة', name_en: 'A test session', intro_ar: 'سطر', intro_en: 'A line' };

function offerRow(slug: string, services: string[] | null, over: Partial<Offer> = {}): Offer {
  return {
    id: slug.length,
    slug,
    name: bi(`عرض ${slug}`, `Offer ${slug}`),
    excerpt: bi('سطر العرض', 'The offer line'),
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
    ...over,
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

/** The nodes a document publishes — the two steps the route takes, without the database. */
function nodes(fields: Record<string, unknown> = {}, over: Partial<ServicePageDeps> = {}, lang: 'ar' | 'en' = 'en'): Node[] {
  return servicePageJsonLd(buildServicePage(serviceOfDoc({ ...thin, ...fields }, KEY)!, deps(over)), lang);
}

/** The node for one thing the page is; a service answers to two names. */
function one(list: Node[], type: string): Node | undefined {
  return list.find((node) => (Array.isArray(node['@type']) ? node['@type'].includes(type) : node['@type'] === type));
}

/** The offers the service node carries, however many the row earned. */
function offersOf(node: Node): Node[] {
  return (node.offers ?? []) as Node[];
}

describe('the service node describes the page it ships on', () => {
  it('names itself with the words the hero prints, in the language of the URL', () => {
    const en = one(nodes({}, {}, 'en'), 'Service')!;
    expect(en.name).toBe('A test session');
    expect(en.alternateName).toBe('جلسة تجريبيّة');
    expect(en.description).toBe('A line');
    expect(en.inLanguage).toBe('en-US');
    expect(en.url).toBe(EN_URL);
    expect(en['@id']).toBe(`${EN_URL}#service`);

    const ar = one(nodes({}, {}, 'ar'), 'Service')!;
    expect(ar.name).toBe('جلسة تجريبيّة');
    expect(ar.alternateName).toBe('A test session');
    expect(ar.description).toBe('سطر');
    expect(ar.inLanguage).toBe('ar-EG');
    // Arabic is the site's default segment, so its canonical URL carries no prefix.
    expect(ar.url).toBe(AR_URL);
  });

  it('is a Service and a MedicalProcedure, hanging off the clinic every page already names', () => {
    const service = nodes()[0];
    expect(service['@context']).toBe('https://schema.org');
    expect(service['@type']).toEqual(['Service', 'MedicalProcedure']);
    expect(service.provider).toEqual({ '@id': `${SITE_URL}/#organization` });
  });

  it('takes the summary line when the row has one and the overview paragraph when it has none', () => {
    expect(nodes({ description_ar: '<p>وصف</p>', description_en: '<p>A paragraph</p>' })[0].description).toBe('A line');
    expect(nodes({ intro_ar: '', intro_en: '', description_en: '<p>A paragraph</p>' })[0].description).toBe('A paragraph');
  });

  it('publishes the photograph the page shows and no other', () => {
    expect(nodes()[0]).not.toHaveProperty('image');
    expect(nodes({ image: '/uploads/hero.jpg' })[0].image).toBe(`${SITE_URL}/uploads/hero.jpg`);
    // A row that points at somebody else's server keeps that URL — the page really draws it.
    expect(nodes({ image: 'https://cdn.example.test/hero.jpg' })[0].image).toBe('https://cdn.example.test/hero.jpg');
  });

  it('says nothing a plain-text field would not say', () => {
    expect(nodes({ intro_ar: '<p>وصف <strong>عربي</strong> &amp; لوحة</p>', intro_en: '' })[0].description).toBe('وصف عربي & لوحة');
  });

  it('never reaches for a word the row does not hold', () => {
    const bare = nodes({ intro_ar: '', intro_en: '' });
    expect(bare[0]).not.toHaveProperty('description');
    const namedOnce = servicePageJsonLd(
      buildServicePage(serviceOfDoc({ name_en: 'Only in English', intro_en: 'A line' }, KEY)!, deps()),
      'ar',
    );
    expect(namedOnce[0].name).toBe('Only in English');
    expect(namedOnce[0]).not.toHaveProperty('alternateName');
  });
});

describe('a price reaches the wire only as a number the row published', () => {
  it('publishes the price the pricing section prints', () => {
    expect(nodes({ price: 1500, currency: 'EGP' })[0].offers).toEqual([
      { '@type': 'Offer', price: 1500, priceCurrency: 'EGP', url: EN_URL },
    ]);
  });

  it('describes a range only when the row carries both ends', () => {
    const offer = offersOf(nodes({ price: 1500, priceMax: 2500, currency: 'EGP' })[0])[0];
    expect(offer.priceSpecification).toEqual({
      '@type': 'PriceSpecification',
      minPrice: 1500,
      maxPrice: 2500,
      priceCurrency: 'EGP',
    });
    // A ceiling alone is what the page prints as «up to», and that is not a price to publish.
    expect(nodes({ priceMax: 2500, currency: 'EGP' })[0]).not.toHaveProperty('offers');
  });

  it('keeps «price on request» as words', () => {
    expect(nodes({ price: 1500, currency: 'EGP', priceOnRequest: true })[0]).not.toHaveProperty('offers');
    expect(nodes({ priceOnRequest: true, priceNote_en: 'After an examination' })[0]).not.toHaveProperty('offers');
  });

  it('publishes no price whose currency is not a code', () => {
    // The field's own hint says to leave it empty and read the site's word, and the page then
    // prints «ج.م» from the Texts screen. Neither is an ISO 4217 code, so neither is a price
    // this node may state in another language's words.
    expect(nodes({ price: 1500 })[0]).not.toHaveProperty('offers');
    expect(nodes({ price: 1500, currency: 'ج.م' })[0]).not.toHaveProperty('offers');
    expect(nodes({ price: 1500, currency: 'egp' })[0]).not.toHaveProperty('offers');
    expect(nodes({ price: -1, currency: 'EGP' })[0]).not.toHaveProperty('offers');
  });

  it('publishes nothing when the pricing section has a sentence but no number', () => {
    const page = buildServicePage(serviceOfDoc({ ...thin, priceNote_en: 'A note about the session' }, KEY)!, deps());
    // Proof the section really is drawn: the node had its chance and the row held no price.
    expect(page.sections.map((section) => section.key)).toContain('pricing');
    expect(servicePageJsonLd(page, 'en')[0]).not.toHaveProperty('offers');
  });
});

describe('a campaign offer reaches the wire only when its card was drawn', () => {
  const scoped = [offerRow('for-me', [KEY]), offerRow('for-another', ['svc-laser']), offerRow('no-currency', [KEY], { currency: '' })];
  const named = ['for-me', 'for-another', 'no-currency'];

  it('publishes the eligible offer the section drew, pointing back at this service', () => {
    const page = buildServicePage(serviceOfDoc({ ...thin, offers: named }, KEY)!, deps({ offers: scoped }));
    expect(page.offers.map((offer) => offer.slug)).toEqual(['for-me', 'no-currency']);
    expect(page.sections.map((section) => section.key)).toContain('pricing');

    expect(offersOf(nodes({ offers: named }, { offers: scoped })[0])).toEqual([
      {
        '@type': 'Offer',
        name: 'Offer for-me',
        alternateName: 'عرض for-me',
        price: 100,
        priceCurrency: 'EGP',
        url: `${SITE_URL}/en/offers/for-me`,
        description: 'The offer line',
        image: `${SITE_URL}/uploads/for-me.jpg`,
        seller: { '@id': `${SITE_URL}/#organization` },
        itemOffered: { '@id': `${EN_URL}#service` },
      },
    ]);
  });

  it('publishes the Arabic name and the Arabic URL on the Arabic page', () => {
    const offer = offersOf(nodes({ offers: ['for-me'] }, { offers: scoped }, 'ar')[0])[0];
    expect(offer.name).toBe('عرض for-me');
    expect(offer.alternateName).toBe('Offer for-me');
    expect(offer.description).toBe('سطر العرض');
    expect(offer.url).toBe(`${SITE_URL}/offers/for-me`);
  });

  it('publishes the row’s own price beside the offers, and never one it refused', () => {
    const offers = offersOf(nodes({ price: 1500, currency: 'EGP', offers: ['for-me', 'for-another'] }, { offers: scoped })[0]);
    expect(offers.map((offer) => offer.price)).toEqual([1500, 100]);
    expect(offers.some((offer) => String(offer.name).includes('for-another'))).toBe(false);
  });

  it('publishes no image for a card that shows the brand frame', () => {
    const bare = [offerRow('blank', [KEY], { images: [], image: null })];
    const page = buildServicePage(serviceOfDoc({ ...thin, offers: ['blank'] }, KEY)!, deps({ offers: bare }));
    expect(page.offers[0].image.src).toBe('');
    expect(offersOf(nodes({ offers: ['blank'] }, { offers: bare })[0])[0]).not.toHaveProperty('image');
  });

  it('publishes no campaign price the card does not show', () => {
    expect(nodes({ offers: ['no-currency'] }, { offers: scoped })[0]).not.toHaveProperty('offers');
    const pricey = [offerRow('free', [KEY], { price: Number.NaN })];
    expect(nodes({ offers: ['free'] }, { offers: pricey })[0]).not.toHaveProperty('offers');
  });
});

describe('the questions are the accordion’s', () => {
  const directory: FaqItem[] = [
    { id: 'q1', question: bi('سؤال أول؟', 'First question?'), answer: bi('جواب', 'An answer'), category: 'general' },
    { id: 'q2', question: bi('سؤال ثانٍ؟', 'Second question?'), answer: bi('جواب ثانٍ', 'Another answer'), category: 'general' },
  ];

  it('is absent when the page draws no questions', () => {
    const list = nodes({ faq: ['gone'] }, { faq: directory });
    expect(list).toHaveLength(2);
    expect(one(list, 'FAQPage')).toBeUndefined();
  });

  it('lists exactly the questions rendered, in the list’s own order, then the row’s', () => {
    const faq = one(
      nodes(
        { faq: ['q2', 'q1'], faqInline: [{ question_ar: 'سؤال؟', question_en: 'A third question?', answer_ar: 'جواب', answer_en: 'A third answer' }] },
        { faq: directory },
      ),
      'FAQPage',
    )!;
    expect(faq['@id']).toBe(`${EN_URL}#faq`);
    expect(faq.mainEntity).toEqual([
      { '@type': 'Question', name: 'First question?', acceptedAnswer: { '@type': 'Answer', text: 'An answer' } },
      { '@type': 'Question', name: 'Second question?', acceptedAnswer: { '@type': 'Answer', text: 'Another answer' } },
      { '@type': 'Question', name: 'A third question?', acceptedAnswer: { '@type': 'Answer', text: 'A third answer' } },
    ]);
  });

  it('answers in the language the page is read in', () => {
    const faq = one(nodes({ faq: ['q1'] }, { faq: directory }, 'ar'), 'FAQPage')!;
    expect((faq.mainEntity as Node[])[0].name).toBe('سؤال أول؟');
  });

  it('claims no answer for a question the page leaves blank', () => {
    const page = buildServicePage(
      serviceOfDoc({ ...thin, faq: ['q2'], faqInline: [{ question_ar: 'سؤال؟', question_en: 'A question?' }] }, KEY)!,
      deps({ faq: directory }),
    );
    // The accordion still shows both rows; only a question with an answer is a claim to publish.
    expect(page.questions.map((item) => item.id)).toEqual(['q2', 'inline-0']);
    const faq = one(servicePageJsonLd(page, 'en'), 'FAQPage')!;
    expect(faq.mainEntity).toEqual([
      { '@type': 'Question', name: 'Second question?', acceptedAnswer: { '@type': 'Answer', text: 'Another answer' } },
    ]);
  });
});

describe('the trail is the three links the hero prints', () => {
  it('walks home, the listing and this service, in the order a visitor reads them', () => {
    expect(one(nodes({}, {}, 'en'), 'BreadcrumbList')!.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/en` },
      { '@type': 'ListItem', position: 2, name: 'Treatments', item: `${SITE_URL}/en/services` },
      { '@type': 'ListItem', position: 3, name: 'A test session', item: EN_URL },
    ]);
    expect(one(nodes({}, {}, 'ar'), 'BreadcrumbList')!.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'الخدمات', item: `${SITE_URL}/services` },
      { '@type': 'ListItem', position: 3, name: 'جلسة تجريبيّة', item: AR_URL },
    ]);
  });
});

describe('what ships is what a crawler can read', () => {
  const priced = { price: 1500, currency: 'EGP', faq: ['q1'] };
  const faqDirectory: FaqItem[] = [{ id: 'q1', question: bi('سؤال؟', 'A question?'), answer: bi('جواب', 'An answer'), category: 'general' }];

  it('is one node per thing the page is, and never a node the page did not earn', () => {
    expect(nodes(priced, { faq: faqDirectory }).map((node) => node['@type'])).toEqual([
      ['Service', 'MedicalProcedure'],
      'FAQPage',
      'BreadcrumbList',
    ]);
  });

  it('carries no null or undefined through a JSON round trip', () => {
    const text = JSON.stringify(nodes(priced, { faq: faqDirectory }));
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(JSON.parse(text)).toHaveLength(3);
  });

  it('says nothing a thin page did not publish', () => {
    const text = JSON.stringify(nodes({}, {}, 'en'));
    for (const claim of ['EGP', 'ج.م', 'Offer', 'FAQPage', 'image', 'price']) {
      expect(text, `a page with no price, no photo and no question claimed "${claim}"`).not.toContain(claim);
    }
  });
});
