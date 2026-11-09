/**
 * The site-wide SEO settings, as one document: the switches and codes a search
 * specialist sets once for the whole site rather than per page. Kept apart from the
 * database so the console form validates with the same rule the server applies.
 *
 * Stored as a single `settings` row (group `seo`, key `config`): the SEO role edits it
 * through its own `seo.update` grant, without gaining the rest of the Settings screen.
 */
export const SEO_CONFIG_GROUP = 'seo';
export const SEO_CONFIG_KEY = 'config';

export const SITEMAP_SECTIONS = ['services', 'offers', 'articles', 'branches'] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export const VERIFICATION_KEYS = ['google', 'bing', 'yandex', 'pinterest', 'facebook'] as const;
export type VerificationKey = (typeof VERIFICATION_KEYS)[number];

export const TITLE_SEPARATORS = ['|', '-', '–', '—', '•', '·', '/'] as const;

export interface SeoConfig {
  /** Off: every page says noindex and robots.txt disallows the whole site. */
  indexing: boolean;
  /** Between a page's heading and the clinic name in `<title>`. */
  separator: string;
  /** The share image a page without one of its own falls back to. */
  defaultOgImage: string;
  /** `@handle`, emitted as `twitter:site`. */
  twitterSite: string;
  facebookAppId: string;
  verification: Record<VerificationKey, string>;
  /** Extra `Allow:` / `Disallow:` lines for robots.txt, one per line. */
  robotsExtra: string;
  sitemap: Record<SitemapSection, boolean>;
}

export const SEO_CONFIG_DEFAULTS: SeoConfig = {
  indexing: true,
  separator: '|',
  defaultOgImage: '',
  twitterSite: '',
  facebookAppId: '',
  verification: { google: '', bing: '', yandex: '', pinterest: '', facebook: '' },
  robotsExtra: '',
  sitemap: { services: true, offers: true, articles: true, branches: true },
};

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * A verification code as the tag's `content`. An owner pastes whichever they were handed —
 * the bare token or the whole `<meta name="…" content="…">` line — and both mean the token.
 */
export function verificationToken(value: string): string {
  const match = value.match(/content\s*=\s*["']([^"']+)["']/i);
  return (match ? match[1] : value).trim().replace(/[<>"']/g, '').slice(0, 200);
}

/** A share image is a rooted path on this site or an http(s) address; anything else is dropped. */
export function safeImageRef(value: string): string {
  const ref = value.trim();
  if (ref.startsWith('/') && !ref.startsWith('//')) return ref.slice(0, 512);
  if (/^https?:\/\//i.test(ref)) return ref.slice(0, 512);
  return '';
}

/** Any stored value, as a complete document: missing or malformed keys take the default. */
export function normalizeSeoConfig(value: unknown): SeoConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const verification = raw.verification && typeof raw.verification === 'object' ? (raw.verification as Record<string, unknown>) : {};
  const sitemap = raw.sitemap && typeof raw.sitemap === 'object' ? (raw.sitemap as Record<string, unknown>) : {};
  const separator = text(raw.separator, 3);
  const handle = text(raw.twitterSite, 40).replace(/^@?/, '');
  return {
    indexing: raw.indexing !== false,
    separator: (TITLE_SEPARATORS as readonly string[]).includes(separator) ? separator : SEO_CONFIG_DEFAULTS.separator,
    defaultOgImage: safeImageRef(text(raw.defaultOgImage, 512)),
    twitterSite: handle && /^\w{1,30}$/.test(handle) ? `@${handle}` : '',
    facebookAppId: /^\d{5,25}$/.test(text(raw.facebookAppId, 25)) ? text(raw.facebookAppId, 25) : '',
    verification: Object.fromEntries(
      VERIFICATION_KEYS.map((key) => [key, verificationToken(text(verification[key], 400))]),
    ) as Record<VerificationKey, string>,
    robotsExtra: text(raw.robotsExtra, 4000),
    sitemap: Object.fromEntries(SITEMAP_SECTIONS.map((key) => [key, sitemap[key] !== false])) as Record<SitemapSection, boolean>,
  };
}

/**
 * The robots.txt lines an owner may add. Only `Allow:` and `Disallow:` with a rooted path
 * are kept: a stray `User-agent:` or `Sitemap:` line would change who the rules apply to,
 * which is not a thing a settings box should be able to do by accident.
 */
export function robotsExtraRules(value: string): { allow: string[]; disallow: string[] } {
  const allow: string[] = [];
  const disallow: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const match = line.trim().match(/^(allow|disallow)\s*:\s*(\/\S*)$/i);
    if (!match) continue;
    (match[1].toLowerCase() === 'allow' ? allow : disallow).push(match[2]);
  }
  return { allow, disallow };
}
