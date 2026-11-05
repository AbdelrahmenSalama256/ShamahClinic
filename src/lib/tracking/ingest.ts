/**
 * The server half of first-party tracking: what may be written, and what is never
 * written.
 *
 * Rules, in the order they are applied:
 *   1. A request that sends DNT or Sec-GPC is answered and dropped. No row, no hash.
 *   2. Only the twelve names in `TRACK_EVENTS` are accepted. Anything else is a 400,
 *      so a compromised page cannot turn this table into a free-form log.
 *   3. A bot is recorded with `bot = 1` and no visitor hash; every aggregate filters
 *      those rows out, and the row stays so a scraping spike is visible.
 *   4. The IP is used for two things and stored for neither: the per-instance rate
 *      limit, and a visitor hash that is keyed with SESSION_SECRET and salted with the
 *      day. Tomorrow the same address is a different hash, so a visitor cannot be
 *      followed across days even from a database dump.
 *   5. The city comes from a proxy header only (`cf-ipcity`, `x-vercel-ip-city`, …).
 *      With no proxy it is empty and every report says Unknown. No lookup is called.
 *
 * The day boundary is Cairo's, not the server's: the clinic reads yesterday as the day
 * it closed, and a UTC boundary would move three hours of evening traffic into the
 * wrong column every night.
 */
import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { json } from '../db/json';
import { sessionSecret } from '../auth/env';
import { sanitizeAttribution, type Attribution } from './attribution';
import { TRACK_EVENTS } from './names';

export { TRACK_EVENTS, type TrackEventName } from './names';

export const TRACK_TIME_ZONE = 'Africa/Cairo';

export const RETENTION_DAYS = 400;

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|headlesschrome|phantomjs|lighthouse|pagespeed|gtmetrix|pingdom|uptime|curl|wget|python-requests|axios|node-fetch|go-http-client|java\/|okhttp|scrapy/i;

export function isBot(userAgent: string): boolean {
  return BOT_PATTERN.test(userAgent);
}

export function deviceOf(userAgent: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown';
  if (/ipad|tablet|kindle|silk|playbook/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** DNT is a refusal, not a preference to count anonymously. */
export function privacyRefused(headers: Headers): boolean {
  const dnt = (headers.get('dnt') ?? '').trim();
  const gpc = (headers.get('sec-gpc') ?? '').trim();
  return dnt === '1' || gpc === '1';
}

/** A date in the clinic's timezone, as the DATE columns store it. */
export function dayOf(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRACK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The clinic's clock hour, 0–23, for the heatmap. */
export function hourOf(date: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TRACK_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(date),
  );
}

/** The first proxy header that names a city; '' when none does. */
export function cityOf(headers: Headers): string {
  for (const name of ['cf-ipcity', 'x-vercel-ip-city', 'x-geo-city', 'x-appengine-city', 'x-city']) {
    const value = headers.get(name)?.trim();
    if (!value) continue;
    try {
      return decodeURIComponent(value).slice(0, 96);
    } catch {
      return value.slice(0, 96);
    }
  }
  return '';
}

/**
 * A keyed, day-salted hash. A missing secret yields null rather than an error: a site
 * whose secret is misconfigured should still serve pages, and an unhashed visitor is
 * worse than no visitor column.
 */
export function visitorHash(ip: string, userAgent: string, day: string): string | null {
  if (!ip) return null;
  try {
    return createHmac('sha256', sessionSecret()).update(`${day}|${ip}|${userAgent}`).digest('hex');
  } catch {
    return null;
  }
}

/** The client's random tab id, one-way. An arbitrary string is not an id. */
export function sessionHash(session: string): string | null {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(session)) return null;
  return createHash('sha256').update(session).digest('hex');
}

const MAX_META_KEYS = 8;
const MAX_META_VALUE = 120;

function cleanMeta(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_META_KEYS) break;
    if (!/^[a-z][a-z0-9_]{0,31}$/i.test(key)) continue;
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const text = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_META_VALUE);
    if (text) out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const trackSchema = z.object({
  event: z.enum(TRACK_EVENTS),
  path: z.string().max(1024),
  locale: z.string().max(8).optional(),
  referrer: z.string().max(1024).optional(),
  attribution: z.unknown().optional(),
  session: z.string().max(64).optional(),
  meta: z.unknown().optional(),
});

export type TrackInput = z.output<typeof trackSchema>;

export interface TrackContext {
  userAgent: string;
  ip: string;
  city: string;
  day: string;
  hour: number;
}

/** Only a path this app could serve; a query string is dropped, not stored. */
function pathOnly(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  const query = value.indexOf('?');
  const path = query === -1 ? value : value.slice(0, query);
  return path.slice(0, 512) || '/';
}

export function readTrackContext(headers: Headers, now: Date = new Date()): TrackContext {
  return {
    userAgent: headers.get('user-agent')?.slice(0, 400) ?? '',
    ip: headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip')?.trim() || '',
    city: cityOf(headers),
    day: dayOf(now),
    hour: hourOf(now),
  };
}

/**
 * Write one event. The caller has already decided the request deserves an answer; this
 * function never throws to the visitor, because tracking must not be able to fail a
 * page load.
 */
export async function recordEvent(input: TrackInput, ctx: TrackContext): Promise<void> {
  const bot = isBot(ctx.userAgent);
  const attribution: Attribution = sanitizeAttribution(input.attribution);
  const meta = cleanMeta(input.meta);
  const event = input.event;
  const ctaKey = event === 'cta_click' && meta?.cta ? meta.cta.slice(0, 120) : '';

  await db
    .insertInto('stats_events')
    .values({
      day: ctx.day,
      hour: ctx.hour,
      event_type: event,
      path: pathOnly(input.path),
      locale: input.locale === 'ar' || input.locale === 'en' ? input.locale : '',
      referrer_host: (() => {
        const raw = attribution.referrer || input.referrer || '';
        try {
          return new URL(raw).hostname.toLowerCase().slice(0, 191);
        } catch {
          return '';
        }
      })(),
      utm_source: attribution.source,
      utm_medium: attribution.medium,
      utm_campaign: attribution.campaign,
      utm_term: attribution.term,
      utm_content: attribution.content,
      gclid: attribution.gclid,
      fbclid: attribution.fbclid,
      landing: attribution.landing,
      session_hash: input.session ? sessionHash(input.session) : null,
      city: ctx.city,
      meta: meta ? json(meta) : null,
      device: deviceOf(ctx.userAgent),
      cta_key: ctaKey,
      visitor_hash: bot ? null : visitorHash(ctx.ip, ctx.userAgent, ctx.day),
      bot: bot ? 1 : 0,
    })
    .execute();
}

/**
 * A per-instance limit, like the lead route's. A page view plus a few clicks is well
 * under it; a script hammering the endpoint is not. Entries expire after the window.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rate = new Map<string, number[]>();

export function rateLimited(key: string, now: number = Date.now()): boolean {
  const list = (rate.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  list.push(now);
  rate.set(key, list);
  if (rate.size > 5_000) {
    for (const [name, hits] of rate) {
      if (!hits.length || now - hits[hits.length - 1] > RATE_WINDOW_MS) rate.delete(name);
    }
  }
  return list.length > RATE_MAX;
}
