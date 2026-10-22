/**
 * The URL rules the proxy enforces, kept out of `src/proxy.ts` so they are
 * testable without a Next request. Nothing else should re-derive them.
 */
import type { Locale } from './locale';

/** The console is its own app; it must never pick up a `/ar` or `/en` prefix. */
export const CONSOLE_PREFIX = '/console';

export function isConsolePath(pathname: string): boolean {
  return pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`);
}

export interface RouteDecision {
  /** `null` on a console path: the console picks its own language per account. */
  lang: Locale | null;
  /** Internal rewrite target, or `null` when the requested path is served as-is. */
  rewriteTo: string | null;
}

export function decideRoute(pathname: string): RouteDecision {
  if (isConsolePath(pathname)) return { lang: null, rewriteTo: null };
  const first = pathname.split('/')[1] ?? '';
  const lang: Locale = first === 'ar' || first === 'en' ? first : 'ar';
  return { lang, rewriteTo: lang === first ? null : `/ar${pathname === '/' ? '' : pathname}` };
}
