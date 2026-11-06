/**
 * The About page, read from the row the console publishes.
 *
 * Every word `/about` prints comes from one place: the `pages` row whose route is
 * `/about`, whose `data` column is the document `ABOUT` in `./list-schema.ts` describes.
 * The console draws that same schema, so what an owner edits and what a visitor reads are
 * two readings of one definition — there is no snapshot file, no hard-coded sentence and
 * no fallback waiting behind either of them.
 *
 * Three rules run through it:
 *
 * **Only the published copy.** `publicRow()` prefers the `pub_*` twin of every column, so
 * saving a draft in the console never changes the page a visitor is served.
 *
 * **An empty block is not a block.** A split with no paragraphs, a list with no lines and a
 * figure with no label are dropped here rather than rendered as a heading over a gap.
 *
 * **A count is counted.** The two figures under the story — branches and services — are
 * read from the lists the site publishes, because a number typed next to a list is a number
 * that goes stale the day the list changes.
 */
import { cache } from 'react';

import type { PhotoSlot } from '../images';
import { toPhotoSlot } from '../wp/ui';
import type { Bi } from './list-schema';
import { publicRow, type PublicRow } from './published';
import { getBranchList, getServiceCards } from './site';

type Doc = Record<string, unknown>;

const EMPTY: Bi = { ar: '', en: '' };
const EMPTY_HOME_REASONS = {
  title: EMPTY,
  lead: EMPTY,
  reasons: [] as Bi[],
};

const str = (doc: Doc, key: string): string => {
  const value = doc[key];
  return typeof value === 'string' ? value.trim() : '';
};

const strings = (doc: Doc, key: string): string[] => {
  const value = doc[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];
};

const has = (value: Bi): boolean => value.ar !== '' || value.en !== '';

/** Both languages stand in for each other, as `parseListDoc` stores them. */
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
    return { ar: str(pair, 'ar') || str(pair, 'en'), en: str(pair, 'en') || str(pair, 'ar') };
  }
  return { ...EMPTY };
};

/** A `list` field as one line per language, zipped so neither side prints a blank. */
const lines = (doc: Doc, stem: string): Bi[] => {
  const ar = strings(doc, `${stem}_ar`);
  const en = strings(doc, `${stem}_en`);
  const size = Math.max(ar.length, en.length);
  return Array.from({ length: size }, (_, index) => ({
    ar: ar[index] || en[index] || '',
    en: en[index] || ar[index] || '',
  })).filter((line) => has(line));
};

/** The rows of a `children` field, in the order the owner arranged them. */
const rows = (doc: Doc, stem: string): Doc[] => {
  const raw = doc[stem];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is Doc => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
};

/** One editorial split of the page: a heading, its paragraphs and its photograph. */
export interface AboutSplit {
  title: Bi;
  paragraphs: Bi[];
  image: PhotoSlot | null;
}

/** One figure the owner entered, with the label and note printed under it. */
export interface AboutNumber {
  value: Bi;
  label: Bi;
  note: Bi;
}

export interface AboutPage {
  title: Bi;
  hero: PhotoSlot | null;
  lead: Bi;
  /** the story and the process, in that order, each one holding at least a paragraph. */
  splits: AboutSplit[];
  /** the third figure under the first split; the other two are counted, not typed. */
  staffValue: Bi;
  branchCount: number;
  treatmentCount: number;
  reasonsTitle: Bi;
  reasonsLead: Bi;
  reasons: Bi[];
  valuesTitle: Bi;
  valuesLead: Bi;
  values: Bi[];
  numbersTitle: Bi;
  numbersLead: Bi;
  numbers: AboutNumber[];
}

/** The counts a page asks for: how many branches and services the site publishes today. */
export interface AboutPageDeps {
  branchCount: number;
  treatmentCount: number;
}

interface AboutDocument {
  title: Bi;
  doc: Doc;
}

function documentOf(row: PublicRow): AboutDocument {
  const title = row.values.title;
  const data = row.values.data;
  return {
    title: title && title.kind === 'bi' ? { ar: title.ar, en: title.en } : { ...EMPTY },
    doc: data && data.kind === 'json' && data.value && typeof data.value === 'object' && !Array.isArray(data.value)
      ? (data.value as Doc)
      : {},
  };
}

const aboutDocument = cache(async (): Promise<AboutDocument | null> => {
  const row = await publicRow('page', '/about');
  return row ? documentOf(row) : null;
});

function split(doc: Doc, stem: string): AboutSplit | null {
  const paragraphs = lines(doc, `${stem}Paragraphs`);
  if (paragraphs.length === 0) return null;
  const image = str(doc, `${stem}Image`);
  return {
    title: bi(doc, `${stem}Title`),
    paragraphs,
    image: image ? toPhotoSlot(image, bi(doc, `${stem}Alt`)) : null,
  };
}

/**
 * The page a published row draws.
 *
 * Pure, so every rule above is testable without a database: the counts arrive in `deps`,
 * and nothing here reaches for a table or a snapshot file.
 */
export function buildAboutPage(title: Bi, doc: Doc, deps: AboutPageDeps): AboutPage {
  const heroImage = str(doc, 'heroImage');
  return {
    title,
    hero: heroImage ? toPhotoSlot(heroImage, bi(doc, 'heroAlt')) : null,
    lead: bi(doc, 'lead'),
    splits: [split(doc, 'story'), split(doc, 'process')].filter((entry): entry is AboutSplit => entry !== null),
    staffValue: bi(doc, 'staffValue'),
    branchCount: deps.branchCount,
    treatmentCount: deps.treatmentCount,
    reasonsTitle: bi(doc, 'reasonsTitle'),
    reasonsLead: bi(doc, 'reasonsLead'),
    reasons: lines(doc, 'reasons'),
    valuesTitle: bi(doc, 'valuesTitle'),
    valuesLead: bi(doc, 'valuesLead'),
    values: lines(doc, 'values'),
    numbersTitle: bi(doc, 'numbersTitle'),
    numbersLead: bi(doc, 'numbersLead'),
    numbers: rows(doc, 'numbers')
      .map((row) => ({ value: bi(row, 'value'), label: bi(row, 'label'), note: bi(row, 'note') }))
      .filter((number) => has(number.value) || has(number.label)),
  };
}

/**
 * The published About page, or null when nothing is published at `/about`.
 *
 * A null answer is the route's `notFound()`: a page with no author's words is a page that
 * needs one, and printing a default sentence instead would hide that from everybody.
 */
export const getAboutPage = cache(async (): Promise<AboutPage | null> => {
  const content = await aboutDocument();
  if (!content) return null;
  const [branches, services] = await Promise.all([getBranchList(), getServiceCards()]);
  return buildAboutPage(content.title, content.doc, { branchCount: branches.length, treatmentCount: services.length });
});

/**
 * The homepage uses the same published reasons the About page editor owns.
 * A missing or unreadable About row leaves this optional band empty, like other
 * homepage content readers, instead of preventing the rest of Home from rendering.
 */
export const getHomeWhyChooseUs = cache(async (): Promise<typeof EMPTY_HOME_REASONS> => {
  try {
    const content = await aboutDocument();
    if (!content) return EMPTY_HOME_REASONS;
    const page = buildAboutPage(content.title, content.doc, { branchCount: 0, treatmentCount: 0 });
    return { title: page.reasonsTitle, lead: page.reasonsLead, reasons: page.reasons };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60);
    console.log(`[site] empty    home reasons (${detail})`);
    return EMPTY_HOME_REASONS;
  }
});
