/**
 * One service page, with its references resolved.
 *
 * `serviceOfDoc` reads what the clinic typed; this answers what those references *point at* —
 * the offers that are still running, the cases with both photographs, the doctors whose rows
 * are enabled — and drops any section whose list turns out to hold nothing. A page that prints
 * «الأسئلة الشائعة» over three questions somebody unpublished is the failure this exists to
 * prevent, and the decision belongs here rather than in the client: it is a decision about the
 * data, and a test can ask it with fixtures.
 *
 * Three rules run through it:
 *
 * **A reference is a request, not a guarantee.** Any id in a row may name a row that was
 * trashed, disabled or never created. The page loses that item and never the visit, so nothing
 * here renders a placeholder for what is missing.
 *
 * **Nothing is invented to fill a gap.** An empty relation is no section. The one addition the
 * page makes on its own is the brief's: a service that names no related services is offered the
 * siblings the listing already used, because a page that ends in a dead link helps nobody.
 *
 * **The list's order is the console's.** Resolved items come back in the order their own list
 * publishes them, not the order the ids were picked, so un-picking one case never reshuffles
 * the rest.
 */
import { cache } from 'react';

import type { BranchDetail } from '../../data/branches';
import type { FaqItem } from '../../data/faq';
import type { Article } from '../../data/journal';
import type { Offer as UIOffer } from '../../data/offers';
import type { Specialist } from '../../data/specialists';
import type { Treatment } from '../../data/treatments';
import type { ArticleCard, Offer as OfferRow } from '../wp/types';
import type { Bi, ServiceSectionKey } from './list-schema';
import type { PhotoSlot } from '../images';
import type { ResultStory } from './site';
import { renderedSections, type ServiceContent, type ServiceSectionState } from './service-doc';
import { cardToUIArticle, offerToUI, toPhotoSlot } from '../wp/ui';
import { getMergedService, getMergedTreatments, serviceDraftOfDoc } from '../wp/treatments';
import { offerServiceScope, serviceIsEligible } from './offer-services';
import { getAllArticles, getAllOffers, getAllResultStories, getBranchList, getFaqList, getSpecialistList } from './site';

/** How many related services the strip shows, suggested or named. */
const RELATED_LIMIT = 3;

/** The numbers a session is described by, in the order the page lists them. */
const FACT_KEYS = ['duration', 'sessions', 'frequency', 'timeline', 'downtime', 'anesthesia', 'technology'] as const;

/** One before/after case, as this page draws it. */
export interface ServiceCase {
  key: string;
  headline: Bi;
  /** both halves, always: the read path already dropped a comparison with one photograph. */
  pair: { before: PhotoSlot; after: PhotoSlot };
  area: Bi;
  sessions: Bi;
  caption: Bi;
  /** the longer text, shown only in the enlarged view. */
  note: Bi;
  /** the journal post the row names, when the owner picked one. */
  article: { slug: string } | null;
}

/** A question the page answers, whether it came from the questions list or from this row. */
export interface ServiceQuestion {
  id: string;
  question: Bi;
  answer: Bi;
}

export interface ServiceGallerySlot {
  slot: PhotoSlot;
  caption: Bi;
}

/** A video the clinic hosts itself — the console's hint says a direct file link, never an embed. */
export interface ServiceVideo {
  url: string;
  poster: string | null;
}

export interface ServicePage {
  content: ServiceContent;
  /** the sections the page draws, in the author's order, each one holding something. */
  sections: ServiceSectionState[];
  hero: PhotoSlot;
  offers: UIOffer[];
  cases: ServiceCase[];
  gallery: ServiceGallerySlot[];
  video: ServiceVideo | null;
  specialists: Specialist[];
  branches: BranchDetail[];
  /** every published branch: a doctor card names the branches *its own* row lists, which is a
   *  wider set than the branches this service names. */
  allBranches: BranchDetail[];
  questions: ServiceQuestion[];
  relatedServices: Treatment[];
  relatedArticles: Article[];
}

/**
 * What the row's references are resolved against — everything the site has published.
 *
 * The two things a page also *says* — the currency word and the number a call button dials —
 * are deliberately not here. They are site-wide words every client control already reads
 * from the provider the layout renders, and carrying them in this page's props would put a
 * currency code into the served HTML of a service the clinic has never priced.
 */
export interface ServicePageDeps {
  offers: OfferRow[];
  cards: Treatment[];
  cases: ResultStory[];
  specialists: Specialist[];
  branches: BranchDetail[];
  faq: FaqItem[];
  articles: ArticleCard[];
}

/** The parts a section is made of, before the page puts them under a heading. */
type ResolvedParts = Omit<ServicePage, 'content' | 'sections'>;

const filled = (value: Bi): boolean => value.ar !== '' || value.en !== '';

const anyFilled = (list: { ar: string[]; en: string[] }): boolean => list.ar.length > 0 || list.en.length > 0;

/** The ids a row names, in its list's own order, skipping any that name nothing. */
function byIds<T>(directory: T[], ids: readonly string[], idOf: (item: T) => string): T[] {
  const wanted = new Set(ids);
  return directory.filter((item) => wanted.has(idOf(item)));
}

/**
 * The services the strip offers when the row names none.
 *
 * This is the rule the detail page has always used — a sibling in the same category, or a
 * service the clinic marks featured — with the page itself left out, because a card that links
 * back to the page you are reading is not a related service.
 *
 * The two readers spell "no category" differently — the card's type has no place for an empty
 * one, so it answers `null`, while the document holds the empty string the console's select
 * leaves behind — so both are read as the same thing here. Left distinct, every service the
 * clinic has not filed under a category would lose the strip it shows today.
 */
function suggestedServices(content: ServiceContent, cards: Treatment[]): Treatment[] {
  const category = content.category || null;
  return cards
    .filter((card) => card.id !== content.key && (card.category === category || Boolean(card.featured)))
    .slice(0, RELATED_LIMIT);
}

/**
 * Which resolved sections still have something under them.
 *
 * `sectionFilled` asks what the row *names*; this asks what those names point at, so this is
 * never more permissive than the reader. Two places the difference is on purpose: a safety
 * switch alone (`showDisclaimer`) asks for wording the site has no shared store for yet, and a
 * FAQ whose every question was unpublished is a heading over a gap.
 */
function resolves(content: ServiceContent, page: ResolvedParts): Record<ServiceSectionKey, boolean> {
  const pricing = content.pricing;
  return {
    overview:
      filled(content.description) || filled(content.body) || content.benefits.length > 0 || filled(content.ideal) || anyFilled(content.notFor),
    how: content.steps.length > 0 || FACT_KEYS.some((key) => filled(content.facts[key])),
    prep: anyFilled(content.prep) || anyFilled(content.aftercare),
    safety: anyFilled(content.contraindications) || anyFilled(content.sideEffects),
    pricing: pricing.price !== null || pricing.priceMax !== null || pricing.onRequest || filled(pricing.note) || page.offers.length > 0,
    proof: page.cases.length > 0 || page.video !== null,
    gallery: page.gallery.length > 0,
    people: page.specialists.length > 0 || page.branches.length > 0,
    faq: page.questions.length > 0,
    related: page.relatedServices.length > 0 || page.relatedArticles.length > 0,
  };
}

/**
 * The page a service row draws.
 *
 * Pure, so every rule above is testable without a database: what the row refers to arrives in
 * `deps`, and nothing here reaches for a table or a snapshot file.
 */
export function buildServicePage(content: ServiceContent, deps: ServicePageDeps): ServicePage {
  // The owner's list is narrowed twice. The offer must still be published, enabled and inside
  // its own dates (`getAllOffers`), and it must be bookable through this service. An offer that
  // answers `none` is refused even when the row names it — the offer's own answer wins, because
  // it is the one the clinic set while deciding who may book through it. A row that named it
  // still shows in the console, where B4 reports the mismatch.
  const offers = byIds(deps.offers, content.pricing.offers, (offer) => offer.slug)
    .filter((offer) => serviceIsEligible(offerServiceScope(offer.services), content.key))
    .map(offerToUI);

  const cases: ServiceCase[] = [];
  for (const story of byIds(deps.cases, content.results, (item) => item.key)) {
    const pair = story.pair;
    if (!pair) continue;
    cases.push({
      key: story.key,
      headline: story.headline,
      pair: { before: toPhotoSlot(pair.before, pair.beforeAlt), after: toPhotoSlot(pair.after, pair.afterAlt) },
      area: story.area,
      sessions: story.sessions,
      caption: story.caption,
      note: story.note,
      article: story.card ? { slug: story.card.slug } : null,
    });
  }

  const questions: ServiceQuestion[] = [
    ...byIds(deps.faq, content.faq.refs, (item) => item.id),
    // A question written on the row belongs to this page alone, so it is named by its place in
    // the list the owner arranged — which is the list the accordion walks.
    ...content.faq.inline.map((qa, index) => ({ id: `inline-${index}`, question: qa.question, answer: qa.answer })),
  ];

  const relatedServices = content.related.services.length
    ? byIds(deps.cards, content.related.services, (card) => card.id)
    : suggestedServices(content, deps.cards);

  const page: ResolvedParts = {
    hero: toPhotoSlot(content.hero.image, content.hero.alt),
    offers,
    cases,
    gallery: content.gallery.map((item) => ({ slot: toPhotoSlot(item.src, item.alt), caption: item.caption })),
    video: content.videoUrl ? { url: content.videoUrl, poster: content.videoPoster } : null,
    specialists: byIds(deps.specialists, content.specialists, (specialist) => specialist.id),
    branches: byIds(deps.branches, content.branches, (branch) => branch.id),
    allBranches: deps.branches,
    questions,
    relatedServices,
    relatedArticles: byIds(deps.articles, content.related.articles, (card) => card.slug).map(cardToUIArticle),
  };

  const alive = resolves(content, page);
  return { content, sections: renderedSections(content).filter((section) => alive[section.key]), ...page };
}

/**
 * Everything a row's references are resolved against: the site as it publishes today.
 *
 * A draft preview uses the same list, on purpose. The offers, cases, doctors and questions a
 * row points at are other rows' decisions, so a preview that invented its own answers would
 * show the owner a page no publish button could produce.
 */
async function loadServiceDeps(): Promise<ServicePageDeps> {
  const [offers, cards, cases, specialists, branches, faq, articles] = await Promise.all([
    getAllOffers(),
    getMergedTreatments(),
    getAllResultStories(),
    getSpecialistList(),
    getBranchList(),
    getFaqList(),
    getAllArticles(),
  ]);
  return { offers, cards, cases, specialists, branches, faq, articles };
}

/**
 * The published service page, or null when no row answers to that slug.
 *
 * `getMergedService` is the variant that also takes the dashboard's long-form body when the row
 * holds none of its own, which is the one thing the snapshot still adds to a service page.
 */
export const getServicePage = cache(async (slug: string): Promise<ServicePage | null> => {
  const content = await getMergedService(slug);
  if (!content) return null;
  return buildServicePage(content, await loadServiceDeps());
});

/**
 * The page an unsaved document would draw, or null when it has no name to draw with.
 *
 * This is the console's draft preview, and it is the same three steps the public route takes —
 * read the document, resolve its references, drop the sections that come back empty — with only
 * the first step reading a draft instead of the published copy. A preview that skipped the
 * second would show a heading over a list of rows somebody unpublished.
 */
export async function getDraftServicePage(doc: Record<string, unknown>, key: string): Promise<ServicePage | null> {
  const content = await serviceDraftOfDoc(doc, key);
  if (!content) return null;
  return buildServicePage(content, await loadServiceDeps());
}
