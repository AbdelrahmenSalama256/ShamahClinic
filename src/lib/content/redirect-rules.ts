/**
 * The redirect rules as plain functions: how an address is compared, what a valid source
 * and target are, and which rule answers a request. No database here, so the proxy's hot
 * path, the console form and the tests all share one definition of "the same address".
 */

export type RedirectStatus = 301 | 302;
export type RedirectMatch = 'exact' | 'prefix';

export interface RedirectRule {
  id: string;
  source: string;
  target: string;
  status: RedirectStatus;
  match: RedirectMatch;
}

/** Paths a redirect may never capture: the console, the API and Next's own files. */
const RESERVED = /^\/(console|api|_next)(\/|$)/;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * One spelling for an address: decoded (so a pasted Arabic URL and its %-escaped form are
 * the same rule), lower-case, no query or fragment, no trailing slash. A full URL on this
 * or any site is reduced to its path, because the browser only ever asks for the path.
 */
export function normalizeRedirectPath(value: string): string | null {
  let text = value.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return null;
    }
  }
  text = decode(text.split(/[?#]/)[0] ?? '');
  if (!text.startsWith('/') || text.startsWith('//')) return null;
  text = text.replace(/\/{2,}/g, '/').toLowerCase();
  if (text.length > 1) text = text.replace(/\/+$/, '');
  if (text.length > 500 || RESERVED.test(text)) return null;
  return text;
}

/** A target is a path on this site or an http(s) address; `//host` and other schemes are refused. */
export function normalizeRedirectTarget(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 500) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).toString();
    } catch {
      return null;
    }
  }
  if (!text.startsWith('/') || text.startsWith('//')) return null;
  return text;
}

/**
 * The rule that answers a request, or null. Exact rules win; then the longest prefix,
 * which carries the rest of the path over to a local target (`/old-blog/x` → `/blogs/x`).
 */
export function matchRedirect(rules: readonly RedirectRule[], pathname: string): { rule: RedirectRule; location: string } | null {
  const path = normalizeRedirectPath(pathname);
  if (!path) return null;
  const exact = rules.find((rule) => rule.match === 'exact' && rule.source === path);
  if (exact) return { rule: exact, location: exact.target };
  let best: RedirectRule | null = null;
  for (const rule of rules) {
    if (rule.match !== 'prefix') continue;
    if (path !== rule.source && !path.startsWith(`${rule.source}/`) && rule.source !== '/') continue;
    if (!best || rule.source.length > best.source.length) best = rule;
  }
  if (!best) return null;
  const rest = path.slice(best.source === '/' ? 0 : best.source.length);
  const local = best.target.startsWith('/');
  const location = local && rest ? `${best.target.replace(/\/+$/, '')}${rest}` : best.target;
  // A prefix rule whose target sits inside its own source would answer itself forever.
  if (local && normalizeRedirectPath(location) === path) return null;
  return { rule: best, location };
}

/** A rule that would send an address to itself, directly or by prefix. */
export function isSelfRedirect(source: string, target: string, match: RedirectMatch): boolean {
  if (!target.startsWith('/')) return false;
  const to = normalizeRedirectPath(target);
  if (!to) return false;
  return to === source || (match === 'prefix' && (to.startsWith(`${source}/`) || source === '/'));
}

/** Addresses a 404 log should not keep: scanners probing for software this site does not run. */
export function isProbePath(path: string): boolean {
  return /(\.(php|asp|aspx|jsp|cgi|env|ini|sql|bak|git)(\/|$))|^\/(wp-admin|wp-login|wp-includes|xmlrpc|cgi-bin|\.well-known|\.git|\.env|vendor|phpmyadmin)/i.test(
    path,
  );
}
