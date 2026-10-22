/**
 * Cookies without `next/headers`, so the same code runs in a route handler, in a
 * test, and in a CLI smoke check. Next accepts a plain `Response` with
 * `set-cookie` headers, and `req.headers` carries the request cookies.
 */
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './env';

export interface CookieAttributes {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  maxAgeSeconds?: number;
  path?: string;
}

export function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${attrs.path ?? '/'}`];
  if (attrs.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.floor(attrs.maxAgeSeconds)}`);
  if (attrs.httpOnly) parts.push('HttpOnly');
  if (attrs.secure) parts.push('Secure');
  parts.push(`SameSite=${attrs.sameSite === 'strict' ? 'Strict' : 'Lax'}`);
  return parts.join('; ');
}

export function parseCookies(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of headers.get('cookie')?.split(';') ?? []) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const raw = pair.slice(eq + 1).trim();
    try {
      out[pair.slice(0, eq).trim()] = decodeURIComponent(raw);
    } catch {
      out[pair.slice(0, eq).trim()] = raw;
    }
  }
  return out;
}

export function sessionTokenFrom(headers: Headers): string | null {
  return parseCookies(headers)[SESSION_COOKIE] ?? headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
}

/**
 * `SameSite=Lax` blocks a cross-site POST from sending the cookie, but a trusted
 * origin still needs the header check. Nothing is written when it does not match.
 */
export function csrfTokenFrom(headers: Headers): string | null {
  return headers.get(CSRF_HEADER) ?? parseCookies(headers)[CSRF_COOKIE] ?? null;
}

/** HTTPS in production, and localhost over http so the console is usable in development. */
export function cookiesRequireSecure(req: Request): boolean {
  if (process.env.COOKIE_FORCE_SECURE === 'true') return true;
  if (new URL(req.url).protocol === 'https:') return true;
  return process.env.NODE_ENV === 'production';
}
