/**
 * Auth constants and the one secret they need.
 *
 * Errors name the variable, never its value — the same rule the CLI scripts follow.
 */
export const BCRYPT_COST = 12;
/** A console session lives two weeks, then the user types their password again. */
export const SESSION_TTL_DAYS = 14;
/** `last_seen_at` is written at most this often, so a busy session is not one UPDATE per click. */
export const SESSION_TOUCH_MINUTES = 5;
/** A session close to expiry is extended while it is being read. */
export const SESSION_RENEW_DAYS = 2;

export const THROTTLE_WINDOW_MINUTES = 15;
export const MAX_FAILED_LOGINS_PER_EMAIL = 8;
export const MAX_FAILED_LOGINS_PER_IP = 25;

export const SESSION_COOKIE = 'shamah_session';
/** Readable by the SPA on purpose: it echoes back in `x-csrf-token`, and the server keeps only its hash. */
export const CSRF_COOKIE = 'shamah_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function sessionSecret(): string {
  const secret = (process.env.SESSION_SECRET ?? '').trim();
  if (secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Put one in .env.local — see docs/LOCAL-MARIADB.md. Never print or commit its value.',
    );
  }
  return secret;
}
