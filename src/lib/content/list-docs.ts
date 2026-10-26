/**
 * The document each list item stores, and the way back to the site's own type.
 *
 * A list item is one JSON document, so the console, the import and the public reader
 * have to agree on its keys without a column per field. That agreement lives here and
 * nowhere else: the import writes a document through `…DocOf`, the site reads it back
 * through `…OfDoc`, and a renamed key is a compile error on both sides.
 *
 * Two conventions, both there for the console's sake:
 *   - the importer writes a bilingual value as `name_ar`/`name_en`, never a nested
 *     `{ar, en}`, because the console names a row by a flat key (`sampleListSchema`
 *     reads those keys) and a nested object would print an empty title in every list;
 *   - a repeatable value is `features_ar`/`features_en` for the same reason.
 *
 * Rows written before that convention (a list seeded through the old editor) may hold
 * the nested `{ar, en}` shape. Reading accepts both so an edit made yesterday does not
 * disappear when the reader changes today; writing always uses the flat keys.
 *
 * Reading is defensive: an editor can empty a field, and a missing value becomes an
 * empty string or an empty list rather than an exception. Nothing is invented to fill
 * a gap the dashboard did not publish.
 */
import type { BranchDetail } from '@/data/branches';
import type { FaqItem } from '@/data/faq';
import type { NavItem } from '@/data/nav';
import type { Specialist } from '@/data/specialists';
import type { Treatment, TreatmentCategory } from '@/data/treatments';
import { toPhotoSlot } from '../wp/ui-helpers';

type Doc = Record<string, unknown>;

const str = (doc: Doc, key: string): string => {
  const value = doc[key];
  return typeof value === 'string' ? value.trim() : '';
};

const both = (doc: Doc, stem: string): { ar: string; en: string } => {
  const ar = str(doc, `${stem}_ar`);
  const en = str(doc, `${stem}_en`);
  return { ar: ar || en, en: en || ar };
};

/** The flat pair the importer writes, else the nested `{ar, en}` or one string an older row holds. */
const bi = (doc: Doc, stem: string): { ar: string; en: string } => {
  const flat = both(doc, stem);
  if (flat.ar || flat.en) return flat;
  const nested = doc[stem];
  if (typeof nested === 'string') {
    const value = nested.trim();
    return { ar: value, en: value };
  }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const ar = str(nested as Doc, 'ar');
    const en = str(nested as Doc, 'en');
    return { ar: ar || en, en: en || ar };
  }
  return { ar: '', en: '' };
};

const biAny = (doc: Doc, stems: string[]): { ar: string; en: string } => {
  for (const stem of stems) {
    const value = bi(doc, stem);
    if (value.ar || value.en) return value;
  }
  return { ar: '', en: '' };
};

const strings = (doc: Doc, key: string): string[] => {
  const value = doc[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
};

const bothStrings = (doc: Doc, stem: string): { ar: string[]; en: string[] } => {
  const ar = strings(doc, `${stem}_ar`);
  const en = strings(doc, `${stem}_en`);
  if (ar.length || en.length) return { ar: ar.length ? ar : en, en: en.length ? en : ar };
  const nested = doc[stem];
  if (Array.isArray(nested)) {
    const all = strings(doc, stem);
    return { ar: all, en: all };
  }
  if (nested && typeof nested === 'object') {
    const nestedAr = strings(nested as Doc, 'ar');
    const nestedEn = strings(nested as Doc, 'en');
    return { ar: nestedAr.length ? nestedAr : nestedEn, en: nestedEn.length ? nestedEn : nestedAr };
  }
  return { ar: [], en: [] };
};

const bool = (doc: Doc, key: string, fallback = false): boolean => {
  const value = doc[key];
  return typeof value === 'boolean' ? value : fallback;
};

const num = (doc: Doc, key: string): number | null => {
  const value = doc[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

/**
 * The same readers, for a site reader outside this module. `site.ts` builds a service
 * card and a result index straight from a document, and it must ask the same question
 * the same way: a reader that only understood one shape is how a console save silently
 * blanks a page.
 */
export const docStr = str;
export const docBi = bi;
export const docBiAny = biAny;
export const docStrings = strings;
export const docStringPairs = bothStrings;

/**
 * Which article a result row claims.
 *
 * Two ways to make the same statement, and both are live: the import keyed a row by the
 * WordPress post id, which no editor can rename, while a row added in the console names the
 * article by its slug through the `story` field. A numeric key answers with itself, anything
 * else with nothing — a row that claims no article must not be drawn, and must not be drawn
 * as a broken card either.
 */
export function resultStoryPointer(doc: Doc, rowKey: string): string {
  const slug = str(doc, 'story');
  if (slug) return slug;
  return /^\d+$/.test(rowKey) ? rowKey : '';
}

// --- services ---------------------------------------------------------------

export interface ServiceDoc extends Doc {
  name_ar: string;
  name_en: string;
  intro_ar: string;
  intro_en: string;
  description_ar: string;
  description_en: string;
  benefits_ar: string[];
  benefits_en: string[];
  steps_ar: string[];
  steps_en: string[];
  aftercare_ar: string[];
  aftercare_en: string[];
  ideal_ar: string;
  ideal_en: string;
  duration_ar: string;
  duration_en: string;
  sessions_ar: string;
  sessions_en: string;
  price: number | null;
  image: string;
  alt_ar: string;
  alt_en: string;
  body_ar: string;
  body_en: string;
  /** the card's own link, when its author wrote one; empty means the services page */
  href: string;
}

export function serviceDocOf(treatment: Treatment): ServiceDoc {
  return {
    name_ar: treatment.name.ar,
    name_en: treatment.name.en,
    intro_ar: treatment.tagline.ar,
    intro_en: treatment.tagline.en,
    description_ar: treatment.description.ar,
    description_en: treatment.description.en,
    benefits_ar: treatment.benefits.ar,
    benefits_en: treatment.benefits.en,
    steps_ar: treatment.steps.ar,
    steps_en: treatment.steps.en,
    aftercare_ar: treatment.aftercare.ar,
    aftercare_en: treatment.aftercare.en,
    ideal_ar: treatment.idealFor.ar,
    ideal_en: treatment.idealFor.en,
    duration_ar: treatment.duration.ar,
    duration_en: treatment.duration.en,
    sessions_ar: treatment.sessionsRecommended.ar,
    sessions_en: treatment.sessionsRecommended.en,
    price: treatment.priceStartingAt,
    image: treatment.image.src,
    alt_ar: treatment.image.alt.ar,
    alt_en: treatment.image.alt.en,
    body_ar: treatment.body?.ar ?? '',
    body_en: treatment.body?.en ?? '',
    // Written even when empty, because the console's schema treats both as fields of the
    // service: a re-import must produce the same document a save of the row produces.
    featured: Boolean(treatment.featured),
    category: treatment.category ?? '',
    href: '',
  };
}

const CATEGORIES: TreatmentCategory[] = ['laser', 'injectables', 'skincare', 'anti-aging'];

export function treatmentOfDoc(doc: Doc, id: string): Treatment | null {
  const name = biAny(doc, ['name', 'title']);
  if (!name.ar && !name.en) return null;
  const category = str(doc, 'category');
  const body = bi(doc, 'body');
  return {
    id,
    category: (CATEGORIES as string[]).includes(category) ? (category as TreatmentCategory) : null,
    categoryName: { ar: '', en: '' },
    name,
    tagline: bi(doc, 'intro'),
    description: bi(doc, 'description'),
    benefits: bothStrings(doc, 'benefits'),
    steps: bothStrings(doc, 'steps'),
    aftercare: bothStrings(doc, 'aftercare'),
    idealFor: bi(doc, 'ideal'),
    duration: bi(doc, 'duration'),
    sessionsRecommended: bi(doc, 'sessions'),
    priceStartingAt: num(doc, 'price'),
    image: toPhotoSlot(str(doc, 'image') || null, { ar: str(doc, 'alt_ar') || name.ar, en: str(doc, 'alt_en') || name.en }),
    featured: bool(doc, 'featured'),
    ...(body.ar || body.en ? { body } : {}),
  };
}

// --- branches ---------------------------------------------------------------

export interface BranchDoc extends Doc {
  name_ar: string;
  name_en: string;
  area_ar: string;
  area_en: string;
  address_ar: string;
  address_en: string;
  phone: string;
  image: string;
  intro_ar: string;
  intro_en: string;
  features_ar: string[];
  features_en: string[];
  landmark_ar: string;
  landmark_en: string;
}

export function branchDocOf(branch: BranchDetail): BranchDoc {
  return {
    name_ar: branch.name.ar,
    name_en: branch.name.en,
    area_ar: branch.area.ar,
    area_en: branch.area.en,
    address_ar: branch.address.ar,
    address_en: branch.address.en,
    phone: branch.phone,
    image: branch.image.src,
    intro_ar: branch.intro.ar,
    intro_en: branch.intro.en,
    features_ar: branch.features.ar,
    features_en: branch.features.en,
    landmark_ar: branch.landmark.ar,
    landmark_en: branch.landmark.en,
  };
}

export function branchOfDoc(doc: Doc, id: string): BranchDetail | null {
  const name = bi(doc, 'name');
  if (!name.ar && !name.en) return null;
  return {
    id,
    name,
    area: bi(doc, 'area'),
    address: bi(doc, 'address'),
    phone: str(doc, 'phone'),
    image: toPhotoSlot(str(doc, 'image') || null, name),
    intro: bi(doc, 'intro'),
    features: bothStrings(doc, 'features'),
    landmark: bi(doc, 'landmark'),
  };
}

// --- specialists ------------------------------------------------------------

export interface SpecialistDoc extends Doc {
  name_ar: string;
  name_en: string;
  title_ar: string;
  title_en: string;
  credentials_ar: string;
  credentials_en: string;
  bio_ar: string;
  bio_en: string;
  specialties_ar: string[];
  specialties_en: string[];
  experience: number;
  branches: string[];
  image: string;
  alt_ar: string;
  alt_en: string;
}

export function specialistDocOf(specialist: Specialist): SpecialistDoc {
  return {
    name_ar: specialist.name.ar,
    name_en: specialist.name.en,
    title_ar: specialist.title.ar,
    title_en: specialist.title.en,
    credentials_ar: specialist.credentials.ar,
    credentials_en: specialist.credentials.en,
    bio_ar: specialist.bio.ar,
    bio_en: specialist.bio.en,
    specialties_ar: specialist.specialties.ar,
    specialties_en: specialist.specialties.en,
    experience: specialist.experienceYears,
    branches: specialist.branches,
    image: specialist.image.src,
    alt_ar: specialist.image.alt.ar,
    alt_en: specialist.image.alt.en,
  };
}

export function specialistOfDoc(doc: Doc, id: string): Specialist | null {
  const name = bi(doc, 'name');
  if (!name.ar && !name.en) return null;
  return {
    id,
    name,
    title: bi(doc, 'title'),
    credentials: bi(doc, 'credentials'),
    bio: bi(doc, 'bio'),
    specialties: bothStrings(doc, 'specialties'),
    experienceYears: num(doc, 'experience') ?? num(doc, 'experienceYears') ?? 0,
    branches: strings(doc, 'branches'),
    image: toPhotoSlot(str(doc, 'image') || null, name),
  };
}

// --- questions --------------------------------------------------------------

export interface FaqDoc extends Doc {
  question_ar: string;
  question_en: string;
  answer_ar: string;
  answer_en: string;
  category: FaqItem['category'];
}

export function faqDocOf(item: FaqItem): FaqDoc {
  return {
    question_ar: item.question.ar,
    question_en: item.question.en,
    answer_ar: item.answer.ar,
    answer_en: item.answer.en,
    category: item.category,
  };
}

const FAQ_CATEGORIES: FaqItem['category'][] = ['laser', 'injectables', 'skincare', 'general'];

export function faqOfDoc(doc: Doc, id: string): FaqItem | null {
  const question = bi(doc, 'question');
  const answer = bi(doc, 'answer');
  if (!question.ar && !question.en) return null;
  const category = str(doc, 'category');
  return {
    id,
    question,
    answer,
    category: (FAQ_CATEGORIES as string[]).includes(category) ? (category as FaqItem['category']) : 'general',
  };
}

// --- navigation -------------------------------------------------------------

export interface NavDoc extends Doc {
  label_ar: string;
  label_en: string;
  href: string;
  children: Array<{ href: string; label_ar: string; label_en: string }>;
}

export function navDocOf(item: NavItem): NavDoc {
  return {
    label_ar: item.label.ar,
    label_en: item.label.en,
    href: item.href,
    children: (item.children ?? []).map((child) => ({
      href: child.href,
      label_ar: child.label.ar,
      label_en: child.label.en,
    })),
  };
}

export function navOfDoc(doc: Doc): NavItem | null {
  const label = bi(doc, 'label');
  const href = str(doc, 'href');
  if (!href || (!label.ar && !label.en)) return null;
  const raw = doc.children;
  const children = Array.isArray(raw)
    ? raw
        .filter((child): child is Doc => child !== null && typeof child === 'object')
        .map((child) => ({ href: str(child, 'href'), label: bi(child, 'label') }))
        .filter((child) => child.href !== '' && (child.label.ar !== '' || child.label.en !== ''))
    : [];
  return { href, label, ...(children.length ? { children } : {}) };
}
