/**
 * The schema.org a service page may say about itself.
 *
 * Every value in here answers one question: *does the page print this?* A crawler reads the
 * JSON-LD as the site's own claim about the page, so a number the clinic never published, a
 * question nobody answered or an offer the row refused would be a claim the visit cannot
 * confirm — and a clinic's medical pages are the last place to guess. So each node is built
 * from what `buildServicePage` already decided to draw, in the language the URL asks for:
 *
 *   - **the service** exists when the page does, and its `description` is the sentence under
 *     the title — the summary line, or the overview paragraph when the row has no summary.
 *     A photograph the page does not show is not mentioned.
 *   - **a price** is only a price when the row holds the number *and* the three-letter code.
 *     «Price on request» is drawn as words and stays words; a currency typed as `ج.م` is the
 *     display word, not an ISO 4217 code, so the number it belongs to is not published.
 *   - **a campaign offer** is only offered here when the pricing section drew its card, which
 *     means it is still published, still inside its dates, and still bookable through this
 *     service.
 *   - **the questions** are exactly the accordion's, in its order. A question whose answer is
 *     blank in both languages is not an answer the page gives.
 *   - **the trail** is the three links the hero prints above the title, with their words.
 *
 * This module takes the locale as an argument and reads no settings, no database and no
 * request: the page it is handed is the whole input, which is what lets a test ask every rule
 * above with fixtures instead of a running server.
 */
import { SITE_URL } from '../site';
import { getLocalizedHref, type Locale } from '../locale';
import { plainText } from './format';
import type { Bi, ServiceSectionKey } from './list-schema';
import type { ServicePage } from './service-page';

type Json = Record<string, unknown>;

/** The tags the rest of the site uses for the same two languages. */
const IN_LANGUAGE: Record<Locale, string> = { ar: 'ar-EG', en: 'en-US' };
const OTHER: Record<Locale, Locale> = { ar: 'en', en: 'ar' };

/** A price is publishable only as a number with an ISO 4217 code beside it. */
const CURRENCY_CODE = /^[A-Z]{3}$/;

const urlOf = (path: string, lang: Locale): string => `${SITE_URL}${getLocalizedHref(path, lang)}`;

/** A site path or an absolute media URL, as a URL a crawler can follow. */
const absolute = (src: string): string => (/^https?:\/\//i.test(src) ? src : `${SITE_URL}${src}`);

/** The sentence in the language the page answers in, stripped of any markup, or nothing. */
const sentence = (pair: Bi, lang: Locale): string => plainText(pair[lang] ?? '');

/**
 * The same words in the other language — an `alternateName` only when the row really holds
 * another name. A row written in one language is read in both (the reader copies the one
 * sentence across), and a translation that repeats the original is not a second name.
 */
function addAlternate(node: Json, pair: Bi, lang: Locale): void {
  const here = sentence(pair, lang);
  const other = sentence(pair, OTHER[lang]);
  if (other !== '' && other !== here) node.alternateName = other;
}

/** The row's own price, as an `Offer` — or nothing when it is not a publishable number. */
function priceOffer(page: ServicePage, url: string): Json | null {
  const pricing = page.content.pricing;
  // The switch is what the page prints instead of a number: «price on request».
  if (pricing.onRequest) return null;
  if (pricing.price === null || !Number.isFinite(pricing.price) || pricing.price < 0) return null;
  if (!CURRENCY_CODE.test(pricing.currency)) return null;

  const offer: Json = { '@type': 'Offer', price: pricing.price, priceCurrency: pricing.currency, url };
  // The page prints «up to» only when the row carries a ceiling, and a range is only a range
  // when both ends are numbers the clinic typed.
  if (pricing.priceMax !== null && Number.isFinite(pricing.priceMax) && pricing.priceMax >= pricing.price) {
    offer.priceSpecification = {
      '@type': 'PriceSpecification',
      minPrice: pricing.price,
      maxPrice: pricing.priceMax,
      priceCurrency: pricing.currency,
    };
  }
  return offer;
}

/** The campaign offers this page's pricing section drew, each with the price its card shows. */
function campaignOffers(page: ServicePage, lang: Locale, serviceId: string): Json[] {
  const nodes: Json[] = [];
  for (const offer of page.offers) {
    const name = sentence(offer.title, lang);
    const currency = offer.currency ?? '';
    if (!name || !Number.isFinite(offer.discountedPrice) || offer.discountedPrice < 0) continue;
    if (!CURRENCY_CODE.test(currency)) continue;

    const node: Json = {
      '@type': 'Offer',
      name,
      price: offer.discountedPrice,
      priceCurrency: currency,
      // The offer's own page is where its terms are written, and the card the section drew is
      // the link to it — in the language this page answers in.
      url: absolute(getLocalizedHref(offer.href[lang], lang)),
      seller: { '@id': `${SITE_URL}/#organization` },
      // The offer is on this page because it is bookable through this service.
      itemOffered: { '@id': serviceId },
    };
    addAlternate(node, offer.title, lang);
    const summary = sentence(offer.subtitle, lang);
    if (summary) node.description = summary;
    // A card with no photograph of its own shows the brand frame, which is not an image to
    // publish.
    if (offer.image.src) node.image = absolute(offer.image.src);
    nodes.push(node);
  }
  return nodes;
}

/** The accordion's questions, or nothing when none of them is both asked and answered. */
function faqNode(page: ServicePage, lang: Locale, url: string): Json | null {
  const mainEntity = page.questions
    .map((item) => ({ question: sentence(item.question, lang), answer: sentence(item.answer, lang) }))
    .filter((item) => item.question !== '' && item.answer !== '')
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    }));
  if (mainEntity.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity,
  };
}

/** The three links the hero prints above the title, in the order a visitor reads them. */
function breadcrumbNode(page: ServicePage, lang: Locale, url: string): Json {
  const trail: { name: Bi; path: string }[] = [
    { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
    { name: { ar: 'الخدمات', en: 'Treatments' }, path: '/services' },
    { name: page.content.name, path: `/services/${page.content.key}` },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: sentence(crumb.name, lang),
      item: urlOf(crumb.path, lang),
    })),
  };
}

/**
 * Every schema.org node this service page may publish, in the language the URL asks for.
 *
 * The list is what `<JsonLd>` writes as one `<script type="application/ld+json">` per node —
 * the shape the other detail routes already use, so one page describes one thing per entry and
 * a node that has nothing true to say is simply absent.
 */
export function servicePageJsonLd(page: ServicePage, lang: Locale): Json[] {
  const content = page.content;
  const url = urlOf(`/services/${content.key}`, lang);
  const serviceId = `${url}#service`;
  const renders = (key: ServiceSectionKey): boolean => page.sections.some((section) => section.key === key);

  const service: Json = {
    '@context': 'https://schema.org',
    '@type': ['Service', 'MedicalProcedure'],
    '@id': serviceId,
    // A row cannot be published without a name, so this is never an empty claim.
    name: sentence(content.name, lang),
    url,
    inLanguage: IN_LANGUAGE[lang],
    provider: { '@id': `${SITE_URL}/#organization` },
  };
  addAlternate(service, content.name, lang);
  // The line the hero prints under the title, or the paragraph the overview opens with.
  const summary = sentence(content.intro, lang) || sentence(content.description, lang);
  if (summary) service.description = summary;
  if (page.hero.src) service.image = absolute(page.hero.src);
  // The numbers the page prints: the row's own price and the campaign offers under it.
  if (renders('pricing')) {
    const own = priceOffer(page, url);
    const offers = [...(own ? [own] : []), ...campaignOffers(page, lang, serviceId)];
    if (offers.length > 0) service.offers = offers;
  }

  const nodes: Json[] = [service];
  if (renders('faq')) {
    const faq = faqNode(page, lang, url);
    if (faq) nodes.push(faq);
  }
  nodes.push(breadcrumbNode(page, lang, url));
  return nodes;
}
