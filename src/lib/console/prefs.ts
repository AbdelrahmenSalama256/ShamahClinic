/**
 * Console locale and theme, decided on the server so the HTML arrives with the right
 * `dir` and the right colour variables — no client script, no flash of the wrong theme.
 *
 * Both follow the **account** (precedence: stored choice → prefs cookie →
 * `Accept-Language` → Arabic on light), because they are how a person works anywhere.
 * The layout has one comfortable rhythm; there is no density choice to resolve.
 */
import { SITE_LOCALES } from '../auth/roles';

export type ConsoleLocale = (typeof SITE_LOCALES)[number];
export type ConsoleTheme = 'light' | 'dark';

export const CONSOLE_THEMES: readonly ConsoleTheme[] = ['light', 'dark'];
/** Not HttpOnly on purpose: a script that respects the theme needs to read it, and it holds nothing secret. */
export const PREFS_COOKIE = 'shamah_console_prefs';
export const PREFS_TTL_DAYS = 365;

export interface ConsolePrefs {
  locale: ConsoleLocale;
  theme: ConsoleTheme;
}

export const DEFAULT_PREFS: ConsolePrefs = { locale: 'ar', theme: 'light' };

export function localeOf(value: string | null | undefined): ConsoleLocale | null {
  return (SITE_LOCALES as readonly string[]).includes(value ?? '') ? (value as ConsoleLocale) : null;
}

export function themeOf(value: string | null | undefined): ConsoleTheme | null {
  return (CONSOLE_THEMES as readonly string[]).includes(value ?? '') ? (value as ConsoleTheme) : null;
}

export function dirOf(locale: ConsoleLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** `ar.light` — legible in DevTools, and a stray value decodes to nothing rather than to garbage. */
export function encodePrefs(prefs: ConsolePrefs): string {
  return `${prefs.locale}.${prefs.theme}`;
}

/** A third term is ignored: cookies written while the console still had a density still read. */
export function decodePrefs(raw: string | null | undefined): Partial<ConsolePrefs> {
  const [locale, theme] = (raw ?? '').split('.');
  const out: Partial<ConsolePrefs> = {};
  const knownLocale = localeOf(locale);
  const knownTheme = themeOf(theme);
  if (knownLocale) out.locale = knownLocale;
  if (knownTheme) out.theme = knownTheme;
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
  return { locale, theme };
}
