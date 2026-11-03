/**
 * One service page, read from the document a `services` list item stores.
 *
 * The list schema (`./list-schema.ts`) says what an editor may type; this module says what
 * those words mean to a page. It is the single reader the console's preview, the list
 * warnings and the public page all share, because three readers that each decided for
 * themselves what counts as "a FAQ" is how a section appears in the preview and vanishes
 * on the site.
 *
 * Two rules shape everything below:
 *
 * **Nothing is invented.** A missing field is empty, not a default sentence, not a price,
 * not a medical claim. The only fallbacks are structural: an empty primary action means the
 * booking button every service already had, and an empty section list means the catalogue's
 * own order with everything shown — because a row written before section controls existed
 * still has a whole page to draw.
 *
 * **An empty section is not a section.** `filled` is computed from what the row actually
 * holds, and a section whose switch is on but whose fields are blank does not render. That
 * is what keeps a page from printing a heading with nothing under it.
 */
import {
  SERVICE_SECTIONS,
  type Bi,
  type ServiceSectionKey,
} from './list-schema';

type Doc = Record<string, unknown>;

const EMPTY: Bi = { ar: '', en: '' };

const str = (doc: Doc, key: string): string => {
  const value = doc[key];
  return typeof value === 'string' ? value.trim() : '';
};

const strings = (doc: Doc, key: string): string[] => {
  const value = doc[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()) : [];
};

const has = (value: Bi): boolean => value.ar !== '' || value.en !== '';

/**
 * A bilingual value from the flat keys the console writes, a nested pair, or one string an
 * older row holds. Both languages fall back to each other, matching `list-docs.ts`: an
 * Arabic-only sentence shows in the English page rather than a blank line.
 */
const bi = (doc: Doc, stem: string): Bi => {
  const ar = str(doc, `${stem}_ar`);
  const en = str(doc, `${stem}_en`);
  if (ar || en) return { ar: ar || en, en: en || ar };
  const nested = doc[stem];
  if (typeof nested === 'string') {
    const value = nested.trim();
    return { ar: value, en: value };
  }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const pair = nested as Doc;
    const nestedAr = str(pair, 'ar');
    const nestedEn = str(pair, 'en');
    return { ar: nestedAr || nestedEn, en: nestedEn || nestedAr };
  }
  return { ...EMPTY };
};

/** The first of several stems that holds a value — a service is `name`, an older row `title`. */
const biAny = (doc: Doc, stems: readonly string[]): Bi => {
  for (const stem of stems) {
    const value = bi(doc, stem);
    if (has(value)) return value;
  }
  return { ...EMPTY };
};

/** A repeatable value in both languages, from parallel arrays or a nested pair. */
const pairs = (doc: Doc, stem: string): { ar: string[]; en: string[] } => {
  const ar = strings(doc, `${stem}_ar`);
  const en = strings(doc, `${stem}_en`);
  if (ar.length || en.length) return { ar: ar.length ? ar : en, en: en.length ? en : ar };
  const nested = doc[stem];
  if (Array.isArray(nested)) {
    const all = strings(doc, stem);
    return { ar: all, en: all };
  }
  if (nested && typeof nested === 'object') {
    const pair = nested as Doc;
    const nestedAr = strings(pair, 'ar');
    const nestedEn = strings(pair, 'en');
    return { ar: nestedAr.length ? nestedAr : nestedEn, en: nestedEn.length ? nestedEn : nestedAr };
  }
  return { ar: [], en: [] };
};

const flag = (doc: Doc, key: string): boolean => doc[key] === true;

const num = (doc: Doc, key: string): number | null => {
  const value = doc[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const refs = (doc: Doc, key: string): string[] => strings(doc, key);

// --- the shape --------------------------------------------------------------

export type ServiceCta = 'booking' | 'whatsapp' | 'call' | 'none';

const CTAS: readonly string[] = ['booking', 'whatsapp', 'call', 'none'];

const cta = (value: string, fallback: ServiceCta): ServiceCta => (CTAS.includes(value) ? (value as ServiceCta) : fallback);

export interface ServiceBenefit {
  text: Bi;
  title: Bi;
  icon: string | null;
}

export interface ServiceStep {
  text: Bi;
  title: Bi;
  image: string | null;
}

export interface ServiceGalleryItem {
  src: string;
  alt: Bi;
  caption: Bi;
}

export interface ServiceQa {
  question: Bi;
  answer: Bi;
}

/** The numbers a session is described by — each one a sentence the clinic wrote. */
export interface ServiceFacts {
  duration: Bi;
  sessions: Bi;
  frequency: Bi;
  timeline: Bi;
  downtime: Bi;
  anesthesia: Bi;
  technology: Bi;
}

export interface ServicePricing {
  price: number | null;
  priceMax: number | null;
  currency: string;
  note: Bi;
  onRequest: boolean;
  offers: string[];
}

export interface ServiceSeo {
  title: Bi;
  description: Bi;
  focusKeyword: string;
  ogImage: string | null;
  canonical: string;
  noindex: boolean;
}

export interface ServiceContent {
  key: string;
  name: Bi;
  intro: Bi;
  category: string;
  featured: boolean;
  /** the card's own link when its author wrote one; empty means this service's page */
  href: string;
  hero: {
    image: string | null;
    alt: Bi;
    headline: Bi;
    subheadline: Bi;
    ctaPrimary: ServiceCta;
    ctaSecondary: ServiceCta;
  };
  description: Bi;
  benefits: ServiceBenefit[];
  ideal: Bi;
  notFor: { ar: string[]; en: string[] };
  steps: ServiceStep[];
  facts: ServiceFacts;
  prep: { ar: string[]; en: string[] };
  aftercare: { ar: string[]; en: string[] };
  contraindications: { ar: string[]; en: string[] };
  sideEffects: { ar: string[]; en: string[] };
  showDisclaimer: boolean;
  pricing: ServicePricing;
  results: string[];
  videoUrl: string;
  videoPoster: string | null;
  gallery: ServiceGalleryItem[];
  specialists: string[];
  branches: string[];
  faq: { refs: string[]; inline: ServiceQa[] };
  related: { services: string[]; articles: string[] };
  body: Bi;
  seo: ServiceSeo;
  /** the author's order and switches, with anything the row never mentioned appended */
  sections: { key: ServiceSectionKey; visible: boolean }[];
}

// --- repeatable rows --------------------------------------------------------

/**
 * A benefit row, from the object shape the editor writes or the string arrays the import
 * left behind. An entry with no sentence is dropped rather than printed as an empty bullet.
 */
function benefitsOf(doc: Doc): ServiceBenefit[] {
  const raw = doc.benefits;
  if (Array.isArray(raw)) {
    const out: ServiceBenefit[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (text) out.push({ text: { ar: text, en: text }, title: { ...EMPTY }, icon: null });
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Doc;
      const text = bi(record, 'text');
      if (!has(text)) continue;
      const icon = str(record, 'icon');
      out.push({ text, title: bi(record, 'title'), icon: icon || null });
    }
    return out;
  }
  const ar = strings(doc, 'benefits_ar');
  const en = strings(doc, 'benefits_en');
  const size = Math.max(ar.length, en.length);
  return Array.from({ length: size }, (_, index) => ({
    text: { ar: ar[index] || en[index] || '', en: en[index] || ar[index] || '' },
    title: { ...EMPTY },
    icon: null,
  }));
}

function stepsOf(doc: Doc): ServiceStep[] {
  const raw = doc.steps;
  if (Array.isArray(raw)) {
    const out: ServiceStep[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (text) out.push({ text: { ar: text, en: text }, title: { ...EMPTY }, image: null });
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Doc;
      const text = bi(record, 'text');
      if (!has(text)) continue;
      out.push({ text, title: bi(record, 'title'), image: str(record, 'image') || null });
    }
    return out;
  }
  const ar = strings(doc, 'steps_ar');
  const en = strings(doc, 'steps_en');
  const size = Math.max(ar.length, en.length);
  return Array.from({ length: size }, (_, index) => ({
    text: { ar: ar[index] || en[index] || '', en: en[index] || ar[index] || '' },
    title: { ...EMPTY },
    image: null,
  }));
}

function galleryOf(doc: Doc): ServiceGalleryItem[] {
  const raw = doc.gallery;
  if (!Array.isArray(raw)) return [];
  const out: ServiceGalleryItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Doc;
    const src = str(record, 'image');
    if (!src) continue;
    out.push({ src, alt: bi(record, 'alt'), caption: bi(record, 'caption') });
  }
  return out;
}

function inlineFaqOf(doc: Doc): ServiceQa[] {
  const raw = doc.faqInline;
  if (!Array.isArray(raw)) return [];
  const out: ServiceQa[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Doc;
    const question = bi(record, 'question');
    const answer = bi(record, 'answer');
    if (!has(question) && !has(answer)) continue;
    out.push({ question, answer });
  }
  return out;
}

/**
 * The section order the document names, with every section it has never mentioned appended.
 *
 * A row the import wrote carries no `sections` key at all and gets the catalogue's order;
 * a row saved yesterday keeps whatever the owner arranged. A key that is not in the
 * catalogue is ignored here — the parser refuses it on the way in, so the only documents
 * that hold one are older than the schema that could draw it.
 */
function sectionsOf(doc: Doc): { key: ServiceSectionKey; visible: boolean }[] {
  const known = new Map<string, { key: ServiceSectionKey; visible: boolean }>();
  const raw = doc.sections;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Doc;
      const key = str(record, 'key');
      const option = SERVICE_SECTIONS.find((section) => section.key === key);
      if (!option || known.has(key)) continue;
      known.set(key, { key: option.key, visible: record.visible !== false });
    }
  }
  for (const option of SERVICE_SECTIONS) {
    if (!known.has(option.key)) known.set(option.key, { key: option.key, visible: true });
  }
  return [...known.values()];
}

// --- the reader -------------------------------------------------------------

/**
 * One service page, or null when the row has no name — a row that cannot be drawn at all,
 * which the list already refuses to publish for the same reason.
 */
export function serviceOfDoc(doc: Doc, key: string): ServiceContent | null {
  if (!has(biAny(doc, ['name', 'title']))) return null;
  return serviceParts(doc, key);
}

/**
 * The page the document describes, name or no name.
 *
 * Kept apart from `serviceOfDoc` because the completeness meter has to measure a row that
 * has not been titled yet: a fresh row is an empty page, and "empty" is the answer the
 * owner is asking for. Nothing else reads it — every surface that shows content to a
 * visitor goes through the guarded reader above.
 */
function serviceParts(doc: Doc, key: string): ServiceContent {
  const name = biAny(doc, ['name', 'title']);
  const alt = bi(doc, 'alt');
  return {
    key,
    name,
    intro: bi(doc, 'intro'),
    category: str(doc, 'category'),
    featured: flag(doc, 'featured'),
    href: str(doc, 'href'),
    hero: {
      image: str(doc, 'image') || null,
      // A picture with no author-written description is still named by the service itself,
      // which is the only sentence about it the clinic has actually published.
      alt: has(alt) ? alt : name,
      headline: bi(doc, 'heroHeadline'),
      subheadline: bi(doc, 'heroSubheadline'),
      // Empty means the booking button this service has always had; `none` is a choice.
      ctaPrimary: cta(str(doc, 'ctaPrimary'), 'booking'),
      ctaSecondary: cta(str(doc, 'ctaSecondary'), 'none'),
    },
    description: bi(doc, 'description'),
    benefits: benefitsOf(doc),
    ideal: bi(doc, 'ideal'),
    notFor: pairs(doc, 'notFor'),
    steps: stepsOf(doc),
    facts: {
      duration: bi(doc, 'duration'),
      sessions: bi(doc, 'sessions'),
      frequency: bi(doc, 'frequency'),
      timeline: bi(doc, 'timeline'),
      downtime: bi(doc, 'downtime'),
      anesthesia: bi(doc, 'anesthesia'),
      technology: bi(doc, 'technology'),
    },
    prep: pairs(doc, 'prep'),
    aftercare: pairs(doc, 'aftercare'),
    contraindications: pairs(doc, 'contraindications'),
    sideEffects: pairs(doc, 'sideEffects'),
    showDisclaimer: flag(doc, 'showDisclaimer'),
    pricing: {
      price: num(doc, 'price'),
      priceMax: num(doc, 'priceMax'),
      currency: str(doc, 'currency'),
      note: bi(doc, 'priceNote'),
      onRequest: flag(doc, 'priceOnRequest'),
      offers: refs(doc, 'offers'),
    },
    results: refs(doc, 'results'),
    videoUrl: str(doc, 'videoUrl'),
    videoPoster: str(doc, 'videoPoster') || null,
    gallery: galleryOf(doc),
    specialists: refs(doc, 'specialists'),
    branches: refs(doc, 'branches'),
    faq: { refs: refs(doc, 'faq'), inline: inlineFaqOf(doc) },
    related: { services: refs(doc, 'relatedServices'), articles: refs(doc, 'relatedArticles') },
    body: bi(doc, 'body'),
    seo: {
      title: bi(doc, 'seoTitle'),
      description: bi(doc, 'seoDescription'),
      focusKeyword: str(doc, 'focusKeyword'),
      ogImage: str(doc, 'ogImage') || null,
      canonical: str(doc, 'canonical'),
      noindex: flag(doc, 'noindex'),
    },
    sections: sectionsOf(doc),
  };
}

// --- which sections actually draw --------------------------------------------

export interface ServiceSectionState {
  key: ServiceSectionKey;
  label: Bi;
  /** the author's switch */
  visible: boolean;
  /** the row holds something worth a heading */
  filled: boolean;
  /** the page draws it: both of the above */
  render: boolean;
}

/** Does this section have anything to show? The one place that question is answered. */
export function sectionFilled(content: ServiceContent, key: ServiceSectionKey): boolean {
  switch (key) {
    case 'overview':
      // The long-form body is prose about the service, so it fills the overview — which is
      // where the page prints it, under the same heading as the description.
      return (
        has(content.description) ||
        has(content.body) ||
        content.benefits.length > 0 ||
        has(content.ideal) ||
        content.notFor.ar.length > 0 ||
        content.notFor.en.length > 0
      );

    case 'how':
      return content.steps.length > 0 || FACT_KEYS.some((fact) => has(content.facts[fact]));
    case 'prep':
      return content.prep.ar.length > 0 || content.prep.en.length > 0 || content.aftercare.ar.length > 0 || content.aftercare.en.length > 0;
    case 'safety':
      return (
        content.contraindications.ar.length > 0 ||
        content.contraindications.en.length > 0 ||
        content.sideEffects.ar.length > 0 ||
        content.sideEffects.en.length > 0 ||
        content.showDisclaimer
      );
    case 'pricing':
      return content.pricing.price !== null || content.pricing.onRequest || has(content.pricing.note) || content.pricing.offers.length > 0;
    case 'proof':
      return content.results.length > 0 || content.videoUrl !== '' || content.videoPoster !== null;
    case 'gallery':
      return content.gallery.length > 0;
    case 'people':
      return content.specialists.length > 0 || content.branches.length > 0;
    case 'faq':
      return content.faq.refs.length > 0 || content.faq.inline.length > 0;
    case 'related':
      return content.related.services.length > 0 || content.related.articles.length > 0;

  }
  return false;
}

const FACT_KEYS: readonly (keyof ServiceFacts)[] = ['duration', 'sessions', 'frequency', 'timeline', 'downtime', 'anesthesia', 'technology'];

/** Every hideable section, in the author's order, with its two switches answered. */
export function serviceSections(content: ServiceContent): ServiceSectionState[] {
  return content.sections.map((entry) => {
    const option = SERVICE_SECTIONS.find((section) => section.key === entry.key);
    const filled = sectionFilled(content, entry.key);
    return {
      key: entry.key,
      label: option ? option.label : { ar: entry.key, en: entry.key },
      visible: entry.visible,
      filled,
      render: entry.visible && filled,
    };
  });
}

/** The sections a page actually draws, in order. `hero` is always first and never listed. */
export function renderedSections(content: ServiceContent): ServiceSectionState[] {
  return serviceSections(content).filter((section) => section.render);
}

// --- what the console tells the owner ---------------------------------------

/** The four gaps a list row flags in one glance, each a thing a visitor would miss. */
export type ServiceWarning = 'no_intro' | 'no_hero_image' | 'no_faq' | 'no_primary_cta';

export function serviceWarnings(content: ServiceContent): ServiceWarning[] {
  const out: ServiceWarning[] = [];
  if (!has(content.intro)) out.push('no_intro');
  if (!content.hero.image) out.push('no_hero_image');
  if (content.faq.refs.length === 0 && content.faq.inline.length === 0) out.push('no_faq');
  if (content.hero.ctaPrimary === 'none') out.push('no_primary_cta');
  return out;
}

/**
 * The same four gaps, read off a stored document instead of a built page.
 *
 * The list cannot afford the guarded reader: a row nobody has named yet still has to appear
 * in it, and `serviceOfDoc` answers that row with `null`. So the badge pass measures the
 * document the way the meter does — through `serviceParts`, which never refuses.
 */
export function serviceWarningsOfDoc(doc: Doc, key: string): ServiceWarning[] {
  return serviceWarnings(serviceParts(doc, key));
}

/**
 * The completeness checks, and the rule each one states.
 *
 * Every check is worth the same: there is no honest reason to say a description matters
 * more than the price, and a weighted score would be a number the owner cannot act on.
 * The name is not a check because a row without one cannot exist. A check is *done* only
 * when the row holds the words itself — a toggle, a default, or a borrowed sentence does
 * not count, so the meter cannot claim a page is complete because of something the owner
 * never wrote.
 */
export const SERVICE_CHECKS = [
  'intro',
  'hero_image',
  'description',
  'benefits',
  'how',
  'safety',
  'pricing',
  'proof',
  'people',
  'faq',
  'related',
  'primary_cta',
  'seo',
] as const;

export type ServiceCheckKey = (typeof SERVICE_CHECKS)[number];

/**
 * The four checks a page cannot do its job without, and the reason they are listed twice.
 *
 * They are the identity and hero content: the line under the name, the picture the card is
 * cut from, the body a visitor reads, and the one button that books. A row missing one of
 * these is not a page with a section left out — the services grid itself shows the gap.
 * Every other check adds a section to a page that already works, so the meter names the two
 * kinds apart and a save waits for neither.
 */
export const SERVICE_CORE_CHECKS: readonly ServiceCheckKey[] = ['intro', 'hero_image', 'description', 'primary_cta'];

const isCoreCheck = (key: ServiceCheckKey): boolean => SERVICE_CORE_CHECKS.includes(key);

export interface ServiceCompleteness {
  /** 0–100, rounded; the console draws it as a ring or a bar, never as a gate */
  score: number;
  done: ServiceCheckKey[];
  missing: ServiceCheckKey[];
  /** the missing checks that hold the page's identity and hero up */
  missingCore: ServiceCheckKey[];
  /** the missing checks that only add an optional section to a page that already reads */
  missingOptional: ServiceCheckKey[];
  total: number;
}

export function serviceCompleteness(content: ServiceContent): ServiceCompleteness {
  const checks: Record<ServiceCheckKey, boolean> = {
    intro: has(content.intro),
    hero_image: content.hero.image !== null,
    description: has(content.description),
    benefits: content.benefits.length > 0,
    how: content.steps.length > 0 || FACT_KEYS.some((fact) => has(content.facts[fact])),
    // The clinic's own safety words only; the shared disclaimer is a setting, not content.
    safety: content.contraindications.ar.length > 0 || content.contraindications.en.length > 0 || content.sideEffects.ar.length > 0 || content.sideEffects.en.length > 0,
    pricing: content.pricing.price !== null || content.pricing.onRequest || content.pricing.offers.length > 0,
    proof: content.results.length > 0 || content.gallery.length > 0 || content.videoUrl !== '',
    people: content.specialists.length > 0 || content.branches.length > 0,
    faq: content.faq.refs.length > 0 || content.faq.inline.length > 0,
    related: content.related.services.length > 0 || content.related.articles.length > 0,
    primary_cta: content.hero.ctaPrimary !== 'none',
    seo: has(content.seo.title) && has(content.seo.description),
  };
  const done = SERVICE_CHECKS.filter((key) => checks[key]);
  const missing = SERVICE_CHECKS.filter((key) => !checks[key]);
  return {
    score: Math.round((done.length / SERVICE_CHECKS.length) * 100),
    done,
    missing,
    missingCore: missing.filter(isCoreCheck),
    missingOptional: missing.filter((key) => !isCoreCheck(key)),
    total: SERVICE_CHECKS.length,
  };
}

/** The meter's read of the document an editor is holding, titled or not. */
export function serviceCompletenessOfDoc(doc: Doc, key: string): ServiceCompleteness {
  return serviceCompleteness(serviceParts(doc, key));
}
