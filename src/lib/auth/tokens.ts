/**
 * Opaque tokens. The raw value only ever exists in the cookie the browser holds;
 * the database stores its SHA-256, so a dump of `sessions` cannot be replayed.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from './env';

/** 32 random bytes, base64url — 43 characters, cookie-safe. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex, because the columns are CHAR(64). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Visitors and abuse are tracked by a keyed hash, never the address itself:
 * rotating SESSION_SECRET makes old hashes uncomputable rather than leaking IPs.
 */
export function hashIp(ip: string): string {
  return createHmac('sha256', sessionSecret()).update(ip).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** The address behind a request, with `x-forwarded-for` honoured for the cPanel proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() ?? '';
}
