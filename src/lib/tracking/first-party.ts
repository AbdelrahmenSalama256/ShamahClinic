/**
 * The browser half of first-party tracking.
 *
 * Storage, not cookies: the first campaign a visitor arrived on lives in
 * `localStorage` for 400 days, the tab's id and the campaign it entered on live in
 * `sessionStorage`, and neither is sent to a third party. A visitor who sends DNT or
 * Sec-GPC is never measured, and private-mode failures fall back to memory for the
 * length of the page rather than throwing into a component.
 *
 * `track()` is deliberately fire-and-forget: `sendBeacon` survives a link that unloads
 * the page (a WhatsApp click), and a failed request is not retried because the event
 * it lost is worth less than the page it would block.
 */
import { attributionFrom, isDirect, sanitizeAttribution, type Attribution } from './attribution';
import type { TrackEventName } from './names';

export const FIRST_TOUCH_KEY = 'shamah:first-touch';
export const SESSION_TOUCH_KEY = 'shamah:session-touch';
export const SESSION_ID_KEY = 'shamah:session-id';
export const SEEN_KEY = 'shamah:seen';
export const TOUCH_TTL_DAYS = 400;

const memory = new Map<string, string>();

function readStored(storage: 'local' | 'session', key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
    return value ?? memory.get(`${storage}:${key}`) ?? null;
  } catch {
    return memory.get(`${storage}:${key}`) ?? null;
  }
}

function writeStored(storage: 'local' | 'session', key: string, value: string): void {
  memory.set(`${storage}:${key}`, value);
  if (typeof window === 'undefined') return;
  try {
    (storage === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* private mode: the memory copy still carries this page */
  }
}

/** DNT and GPC are refusals. `msDoNotTrack` is IE/legacy Edge, still honoured. */
export function privacyAllows(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.doNotTrack !== '1' && nav.msDoNotTrack !== '1' && nav.globalPrivacyControl !== true;
}

/** A random id per tab, not per person; the server only ever stores its hash. */
export function sessionId(): string {
  const existing = readStored('session', SESSION_ID_KEY);
  if (existing) return existing;
  let id = '';
  try {
    id = crypto.randomUUID();
  } catch {
    id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
  writeStored('session', SESSION_ID_KEY, id);
  return id;
}

interface StoredTouch {
  attribution: Attribution;
  at: number;
}

function parseTouch(raw: string | null): StoredTouch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { attribution?: unknown; at?: unknown };
    const at = typeof value.at === 'number' ? value.at : 0;
    if (!at || Date.now() - at > TOUCH_TTL_DAYS * 86_400_000) return null;
    return { attribution: sanitizeAttribution(value.attribution), at };
  } catch {
    return null;
  }
}

/**
 * Capture this page as a possible touch point.
 *
 * The session touch is only overwritten by a non-direct arrival: a visitor who lands
 * on a campaign, browses internally, then opens a direct page in the same tab is still
 * the campaign's lead. The first touch is written once per 400 days for the same reason.
 */
export function captureTouch(): Attribution {
  if (typeof window === 'undefined') return sanitizeAttribution(null);
  const here = attributionFrom({
    url: window.location.href,
    referrer: document.referrer,
    selfHost: window.location.host,
  });

  if (!isDirect(here)) {
    const at = Date.now();
    writeStored('session', SESSION_TOUCH_KEY, JSON.stringify({ attribution: here, at }));
    if (!parseTouch(readStored('local', FIRST_TOUCH_KEY))) {
      writeStored('local', FIRST_TOUCH_KEY, JSON.stringify({ attribution: here, at }));
    }
  }

  return here;
}

/** What a lead or an event should carry: this tab's campaign, else the first one. */
export function effectiveAttribution(): Attribution {
  if (typeof window === 'undefined') return sanitizeAttribution(null);
  captureTouch();
  return (
    parseTouch(readStored('session', SESSION_TOUCH_KEY))?.attribution ??
    parseTouch(readStored('local', FIRST_TOUCH_KEY))?.attribution ??
    sanitizeAttribution(null)
  );
}

function seen(key: string): boolean {
  const raw = readStored('session', SEEN_KEY);
  if (!raw) return false;
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) && list.includes(key);
  } catch {
    return false;
  }
}

function rememberSeen(key: string): void {
  const raw = readStored('session', SEEN_KEY);
  let list: string[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) list = parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    list = [];
  }
  list.push(key);
  writeStored('session', SEEN_KEY, JSON.stringify(list.slice(-80)));
}

export interface TrackMeta {
  [key: string]: string | number | undefined;
}

/** One event to our own endpoint. Returns false when nothing was sent. */
export function track(event: TrackEventName, meta: TrackMeta = {}): boolean {
  if (typeof window === 'undefined' || !privacyAllows()) return false;
  const payload = {
    event,
    path: window.location.pathname,
    locale: document.documentElement.lang === 'en' ? 'en' : 'ar',
    referrer: document.referrer,
    attribution: effectiveAttribution(),
    session: sessionId(),
    meta,
  };
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) {
      return true;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** The same event at most once per tab — a form start is a fact, not a count. */
export function trackOnce(event: TrackEventName, key: string, meta: TrackMeta = {}): void {
  if (typeof window === 'undefined' || seen(key)) return;
  rememberSeen(key);
  track(event, meta);
}

/**
 * One page view per path per tab. App Router keeps the tab alive across navigations,
 * so the path is the thing that changed; a revisit in the same tab is not a second
 * view, which is the same rule the session id implies.
 */
export function trackPageView(pathname: string): void {
  if (typeof window === 'undefined' || !pathname) return;
  const key = `page_view:${pathname}`;
  if (seen(key)) return;
  rememberSeen(key);
  track('page_view', {});
}

/** The fields a lead form attaches to its own request. */
export function leadAttribution(): { attribution: Attribution; session: string } {
  return { attribution: effectiveAttribution(), session: sessionId() };
}
