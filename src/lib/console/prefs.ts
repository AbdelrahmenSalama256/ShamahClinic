/**
 * Console locale, theme and density, decided on the server so the HTML arrives with the
 * right `dir`, the right colour variables and the right spacing — no client script, no
 * flash of the wrong theme.
 *
 * Locale and theme follow the **account** (precedence: stored choice → prefs cookie →
 * `Accept-Language` → Arabic on light), because they are how a person works anywhere.
 * Density follows the **device** (cookie only): a 13-inch laptop and a phone attached to
 * the same account want different amounts of pixels per row, and storing it on the account
 * would have one person's monitor set the layout on another's. So there is no `density`
 * column on `users` — that is deliberate, not an oversight.
 */
import { SITE_LOCALES } from '../auth/roles';

export type ConsoleLocale = (typeof SITE_LOCALES)[number];
export type ConsoleTheme = 'light' | 'dark';
export type ConsoleDensity = 'comfortable' | 'dense';

export const CONSOLE_THEMES: readonly ConsoleTheme[] = ['light', 'dark'];
export const CONSOLE_DENSITIES: readonly ConsoleDensity[] = ['comfortable', 'dense'];
/** Not HttpOnly on purpose: a script that respects the theme needs to read it, and it holds nothing secret. */
export const PREFS_COOKIE = 'shamah_console_prefs';
export const PREFS_TTL_DAYS = 365;

export interface ConsolePrefs {
  locale: ConsoleLocale;
  theme: ConsoleTheme;
  density: ConsoleDensity;
}

export const DEFAULT_PREFS: ConsolePrefs = { locale: 'ar', theme: 'light', density: 'comfortable' };

export function localeOf(value: string | null | undefined): ConsoleLocale | null {
  return (SITE_LOCALES as readonly string[]).includes(value ?? '') ? (value as ConsoleLocale) : null;
}

export function themeOf(value: string | null | undefined): ConsoleTheme | null {
  return (CONSOLE_THEMES as readonly string[]).includes(value ?? '') ? (value as ConsoleTheme) : null;
}

export function densityOf(value: string | null | undefined): ConsoleDensity | null {
  return (CONSOLE_DENSITIES as readonly string[]).includes(value ?? '') ? (value as ConsoleDensity) : null;
}

export function dirOf(locale: ConsoleLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** `ar.light.dense` — legible in DevTools, and a stray value decodes to nothing rather than to garbage. */
export function encodePrefs(prefs: ConsolePrefs): string {
  return `${prefs.locale}.${prefs.theme}.${prefs.density}`;
}

export function decodePrefs(raw: string | null | undefined): Partial<ConsolePrefs> {
  const [locale, theme, density] = (raw ?? '').split('.');
  const out: Partial<ConsolePrefs> = {};
  const knownLocale = localeOf(locale);
  const knownTheme = themeOf(theme);
  const knownDensity = densityOf(density);
  if (knownLocale) out.locale = knownLocale;
  if (knownTheme) out.theme = knownTheme;
  if (knownDensity) out.density = knownDensity;
  return out;
}

/** The first tag in the header that names one of the site's locales, or `null`. */
export function localeFromAcceptLanguage(header: string | null | undefined): ConsoleLocale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const [tag, ...params] = part.trim().split(';');
    if (params.some((p) => /^q=0+(\.0+)?$/i.test(p))) continue;
    const locale = localeOf(tag.split('-')[0]?.toLowerCase());
    if (locale) return locale;
  }
  return null;
}

export interface PrefsSources {
  account?: { locale?: string | null; theme?: string | null } | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}

export function resolvePrefs(sources: PrefsSources): ConsolePrefs {
  const fromCookie = decodePrefs(sources.cookie);
  const locale =
    localeOf(sources.account?.locale) ?? fromCookie.locale ?? localeFromAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_PREFS.locale;
  const theme = themeOf(sources.account?.theme) ?? fromCookie.theme ?? DEFAULT_PREFS.theme;
  // No account term: `users` has no density column, on purpose (see the header).
  const density = fromCookie.density ?? DEFAULT_PREFS.density;
  return { locale, theme, density };
}
