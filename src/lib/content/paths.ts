/**
 * Where a content row lives on the site — one rule, so the console's preview link and
 * the site's own hrefs cannot disagree.
 *
 * The path returned is the *unprefixed* one (`/blogs/<slug>`), because that is what the
 * site's read path already passes to `publicSeo()` and `buildPageMetadata()`. A console
 * needs the other spelling too: `src/lib/site-routing.ts` rewrites a bare path to `/ar`,
 * so a link handed to someone reading the English tab has to say `/en/`. Hence
 * `localizedPath()`, which prefixes *both* languages rather than leaning on that rewrite.
 *
 * Two kinds have no path of their own, and saying so is the point: a `nav` row is a
 * heading in a menu, and an unpublished draft is not on the site yet. The editor shows
 * the reason instead of a link that 404s.
 */
import type { ContentKind, ContentLocale } from './kinds';

/** A route as the site spells it in a path segment: no surrounding slashes. */
export function pageSlug(route: string): string {
  return route.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * What each registered list's rows are worth on the site: a detail route per row for
 * the three lists the site renders one page from, the page they are sections of for the
 * rest, and nothing at all for the header menu.
 */
const LIST_PATHS: Record<string, (key: string) => string | null> = {
  branches: (key) => `/branches/${key}`,
  services: (key) => `/services/${key}`,
  // A treatment row is one of the services the /services grid renders; the old
  // `/treatments/` segment is gone and redirects here.
  treatments: (key) => `/services/${key}`,
  specialists: () => '/doctors',
  faq: () => '/faq',
  results: () => '/results',
  // testimonials render in the proofs band on Home and on /results
  testimonials: () => '/results',
  nav: () => null,
};

/** The site path a row's public copy is served at, or null when it has no page. */
export function publicPathOf(kind: ContentKind, key: string, listKey?: string): string | null {
  switch (kind) {
    case 'article':
      return `/blogs/${key}`;
    case 'offer':
      return `/offers/${key}`;
    case 'page':
      return `/${pageSlug(key)}`;
    case 'list_item': {
      if (!listKey) return null;
      const rule = LIST_PATHS[listKey];
      return rule ? rule(key) : null;
    }
  }
}

/** The same path with the language spelled out, for a link a person clicks. */
export function localizedPath(path: string, locale: ContentLocale): string {
  const clean = pageSlug(path);
  return clean === '' ? `/${locale}` : `/${locale}/${clean}`;
}
