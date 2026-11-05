/**
 * Login throttling on `login_attempts`, which is the only abuse counters this
 * build needs and it survives a restart (an in-memory map does not).
 *
 * Two independent budgets: the account (so one person cannot be locked out by a
 * neighbour) and the address (so one person cannot spray many accounts).
 */
import { db } from '../db';
import { MAX_FAILED_LOGINS_PER_EMAIL, MAX_FAILED_LOGINS_PER_IP, THROTTLE_WINDOW_MINUTES } from './env';

export interface ThrottleVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

function throttleWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000);
}

async function countFailures(where: 'email_lc' | 'ip_hash', value: string, since: Date): Promise<number> {
  const row = await db
    .selectFrom('login_attempts')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where(where, '=', value)
    .where('success', '=', 0)
    .where('attempted_at', '>', since)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

async function lastSuccess(email: string): Promise<Date | null> {
  const row = await db
    .selectFrom('login_attempts')
    .select('attempted_at')
    .where('email_lc', '=', email)
    .where('success', '=', 1)
    .orderBy('attempted_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.attempted_at ?? null;
}

export async function checkThrottle(email_lc: string, ip_hash: string): Promise<ThrottleVerdict> {
  const windowStart = throttleWindowStart();
  // A successful login clears the account's own history; the address budget does not reset.
  const previous = await lastSuccess(email_lc);
  const emailSince = previous && previous > windowStart ? previous : windowStart;
  const [byEmail, byIp] = await Promise.all([
    countFailures('email_lc', email_lc, emailSince),
    countFailures('ip_hash', ip_hash, windowStart),
  ]);

  const blockedByEmail = byEmail >= MAX_FAILED_LOGINS_PER_EMAIL;
  const blockedByIp = byIp >= MAX_FAILED_LOGINS_PER_IP;
  if (!blockedByEmail && !blockedByIp) return { allowed: true, retryAfterSeconds: 0 };
  // The window slides: the oldest failure in it decides when a retry is next legal.
  return { allowed: false, retryAfterSeconds: THROTTLE_WINDOW_MINUTES * 60 };
}

export async function recordLoginAttempt(input: { email_lc: string; ip_hash: string; success: boolean }): Promise<void> {
  await db
    .insertInto('login_attempts')
    .values({ email_lc: input.email_lc, ip_hash: input.ip_hash, success: input.success ? 1 : 0 })
    .execute();
}
