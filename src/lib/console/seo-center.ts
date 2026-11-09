/**
 * What the SEO screen shows: every address this site serves, the words it shows today,
 * and the override a person has written over them.
 *
 * The row set is derived from the same functions the public pages read, not from a second
 * list of routes. A page that stops being served disappears from this screen, and a new
 * article or service appears without a catalog edit. The inherited title and description
 * are the pair `buildPageMetadata()` receives before it consults an override, which is why
 * the screen can show "what Google gets" rather than a guess at it.
 *
 * A row is keyed by path and language, exactly like `seo_entries`: a slug change is a new
 * address, and the old override belongs to the page that is no longer there.
 */
import { can, type Grant } from '../auth/permissions';
import type { ContentKind, ContentLocale } from '../content/kinds';
import { localizedPath } from '../content/paths';
import { readSeoOverride, readSeoOverrides, seoPathOf, type SeoOverride } from '../content/seo';
import { SITE_SEO } from '../content/seo-defaults';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoStatus, worstStatus, type SeoStatus } from '../content/seo-limits';
import { seoScore } from '../content/seo-score';
import { SITE_PAGES } from '../content/settings-catalog';
import { getAllArticles, getAllOffers, getBranchList, getOffer, getPost } from '../content/site';
import { getMergedTreatment, getMergedTreatments } from '../wp/treatments';

type Bi = { ar: string; en: string };

export const SEO_SECTIONS = ['pages', 'articles', 'offers', 'services', 'branches'] as const;
export type SeoSection = (typeof SEO_SECTIONS)[number];

export interface SeoRow {
  /** Unique in the screen: section plus path is enough, because a path cannot occur twice. */
  key: string;
  section: SeoSection;
  /** The row's own name in the console language. */
  label: string;
  /** The public path without the language prefix; `''` is the home page. */
  path: string;
  /** The same path with the language segment, for a link a person clicks. */
  href: string;
  /** What the site emits today when the override is empty. */
  inherited: SeoOverride;
  override: SeoOverride | null;
  titleStatus: SeoStatus;
  descriptionStatus: SeoStatus;
  status: SeoStatus;
  /**
   * The SEO score from what this screen can see — the result pair, focus keyword, address
   * and share image. Body checks need the page's text and are graded in its own editor.
   */
  score: number;
}

export interface SeoCenterData {
  locale: ContentLocale;
  rows: SeoRow[];
  writable: boolean;
}

export interface EntitySeo {
  path: string | null;
  inherited: SeoOverride;
  override: SeoOverride | null;
}

const other = (locale: ContentLocale): ContentLocale => (locale === 'ar' ? 'en' : 'ar');

/** The pair rule `buildPageMetadata()` uses: the page language, then the other one. */
function pick(pair: Bi, locale: ContentLocale): string {
  return pair[locale] || pair[other(locale)] || '';
}

/**
 * The effective pair for a caller that passed a title/description pair to
 * `buildPageMetadata()`. Only an article or an offer falls back from an empty description
 * to its heading — `publicSeo()` does that before the metadata call.
 */
function pairSeo(title: Bi, description: Bi, locale: ContentLocale, descriptionFallsBackToTitle = false): SeoOverride {
  const heading = pick(title, locale);
  const summary = pick(description, locale) || (descriptionFallsBackToTitle ? heading : '');
  return { title: heading, description: summary };
}

interface Entry {
  section: SeoSection;
  label: string;
  path: string;
  title: Bi;
  description: Bi;
  descriptionFallsBackToTitle?: boolean;
}

function rowOf(entry: Entry, locale: ContentLocale, override: SeoOverride | null): SeoRow {
  const inherited = pairSeo(entry.title, entry.description, locale, entry.descriptionFallsBackToTitle);
  const title = override?.title || inherited.title;
  const description = override?.description || inherited.description;
  const titleStatus = seoStatus(title, SEO_TITLE_MAX);
  const descriptionStatus = seoStatus(description, SEO_DESCRIPTION_MAX);
  return {
    key: `${entry.section}:${entry.path}`,
    section: entry.section,
    label: entry.label,
    path: entry.path,
    href: localizedPath(entry.path, locale),
    inherited,
    override,
    titleStatus,
    descriptionStatus,
    status: worstStatus(titleStatus, descriptionStatus),
    score: seoScore({
      focusKeyword: override?.focusKeyword ?? '',
      title,
      description,
      path: entry.path,
      body: null,
      ogImage: override?.ogImage ?? '',
    }).score,
  };
}

/**
 * Every row, in the order the screen draws it: the route catalog first, then the three
 * content kinds that own a page each, then branches. Results, FAQ and doctor rows are
 * absent on purpose — they are sections of one page, and that page is already a row.
 */
export async function seoCenterData(input: {
  grants: readonly Grant[];
  locale: ContentLocale;
}): Promise<SeoCenterData | null> {
  if (!can(input.grants, 'seo', 'read', {})) return null;

  const locale = input.locale;
  const [articles, offers, branches, treatments] = await Promise.all([
    getAllArticles(),
    getAllOffers(locale),
    getBranchList(),
    getMergedTreatments(),
  ]);

  const entries: Entry[] = [];

  for (const page of SITE_PAGES) {
    const defaults = SITE_SEO[page.path];
    entries.push({
      section: 'pages',
      label: page.label[locale],
      path: page.path,
      title: defaults?.title ?? page.label,
      description: defaults?.description ?? { ar: '', en: '' },
    });
  }

  for (const article of articles) {
    entries.push({
      section: 'articles',
      label: pick(article.title, locale) || article.slug,
      path: `/blogs/${article.slug}`,
      title: article.title,
      description: article.excerpt,
      descriptionFallsBackToTitle: true,
    });
  }

  for (const offer of offers) {
    entries.push({
      section: 'offers',
      label: pick(offer.name, locale) || offer.slug,
      path: `/offers/${offer.slug}`,
      title: offer.name,
      description: offer.excerpt,
      descriptionFallsBackToTitle: true,
    });
  }

  for (const treatment of treatments) {
    entries.push({
      section: 'services',
      label: pick(treatment.name, locale) || treatment.id,
      path: `/services/${treatment.id}`,
      title: treatment.name,
      description: treatment.tagline,
    });
  }

  for (const branch of branches) {
    const name = branch.name;
    entries.push({
      section: 'branches',
      label: pick(name, locale) || branch.id,
      path: `/branches/${branch.id}`,
      // The branch page's title is the name plus a promise in Arabic; the English page
      // carries the name alone. Reproduced here so the placeholder is the emitted copy.
      title: {
        ar: `${name.ar || name.en} — العنوان والهاتف`,
        en: name.en || name.ar,
      },
      description: branch.intro,
    });
  }

  const overrides = await readSeoOverrides(entries.map((entry) => entry.path), locale);

  return {
    locale,
    rows: entries.map((entry) => rowOf(entry, locale, overrides.get(entry.path) ?? null)),
    writable: can(input.grants, 'seo', 'update', {}),
  };
}

/** The inherited copy for one entity, as the page that serves it would call the builder. */
async function inheritedSeoOf(kind: ContentKind, key: string, listKey: string | null, path: string, locale: ContentLocale): Promise<SeoOverride> {
  switch (kind) {
    case 'article': {
      const post = await getPost(key);
      if (!post) return { title: '', description: '' };
      const meta = locale === 'ar' && post.seo.ar ? post.seo.ar : post.seo.en;
      return { title: meta.title, description: meta.description };
    }
    case 'offer': {
      const offer = await getOffer(key, locale);
      if (!offer) return { title: '', description: '' };
      const meta = locale === 'ar' && offer.seo.ar ? offer.seo.ar : offer.seo.en;
      return { title: meta.title, description: meta.description };
    }
    case 'page': {
      const defaults = SITE_SEO[path];
      return defaults ? pairSeo(defaults.title, defaults.description, locale) : { title: '', description: '' };
    }
    case 'list_item': {
      if (listKey === 'branches') {
        const branch = (await getBranchList()).find((candidate) => candidate.id === key);
        if (!branch) return { title: '', description: '' };
        const name = branch.name;
        return pairSeo(
          { ar: `${name.ar || name.en} — العنوان والهاتف`, en: name.en || name.ar },
          branch.intro,
          locale,
        );
      }
      if (listKey === 'services' || listKey === 'treatments') {
        const treatment = await getMergedTreatment(key);
        if (!treatment) return { title: '', description: '' };
        return pairSeo(treatment.name, treatment.tagline, locale);
      }
      return { title: '', description: '' };
    }
  }
}

/**
 * The SEO panel inside one entity page: its public path, the copy the site would emit
 * today, and whatever override is already stored. A row with no page of its own says so
 * with `path: null`; the editor then draws no fields that could never reach a crawler.
 */
export async function entitySeoOf(
  kind: ContentKind,
  key: string,
  listKey: string | null,
  locale: ContentLocale,
): Promise<EntitySeo> {
  const path = seoPathOf(kind, key, listKey);
  if (path === null) return { path: null, inherited: { title: '', description: '' }, override: null };

  const [inherited, override] = await Promise.all([
    inheritedSeoOf(kind, key, listKey, path, locale),
    readSeoOverride(path, locale),
  ]);
  return { path, inherited, override };
}
