/**
 * Campaign attribution without cookies and without a vendor.
 *
 * The same rules run in the browser (where a visit is captured) and on the server
 * (where a lead or an event is stored), because a lead written from a stale tab must
 * be attributed the same way a page view from a fresh one was. Everything here is a
 * pure function of a URL, a referrer and a self host, so it can be tested without a
 * window and cannot disagree with itself between the two halves.
 *
 * The five UTM terms are kept in their own columns rather than one JSON blob: a report
 * groups and filters on them, and a JSON path in a group-by is the query nobody keeps
 * indexable. `landing` is the page the visit started on, not the page the lead was
 * submitted from — that is `page_path` on the lead.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export interface Attribution {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  gclid: string;
  fbclid: string;
  landing: string;
  referrer: string;
}

export const EMPTY_ATTRIBUTION: Attribution = {
  source: '',
  medium: '',
  campaign: '',
  term: '',
  content: '',
  gclid: '',
  fbclid: '',
  landing: '',
  referrer: '',
};

const MAX_SOURCE = 191;
const MAX_CAMPAIGN = 191;
const MAX_CLICK_ID = 255;
const MAX_URL = 512;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A path the app could serve: never a scheme, never a protocol-relative address. */
function safePath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '';
  return value.slice(0, MAX_URL);
}

/** The host of a referrer, or '' for a missing or malformed one. Never the full URL. */
export function referrerHost(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.slice(0, 191);
  } catch {
    return '';
  }
}

/** True when a referrer names some other site; a same-host referrer is internal navigation. */
export function isExternalReferrer(value: string, selfHost: string): boolean {
  const host = referrerHost(value);
  if (!host) return false;
  const self = selfHost.toLowerCase().replace(/^www\./, '');
  return host.replace(/^www\./, '') !== self;
}

/**
 * What the visit that produced this page says about where it came from.
 *
 * A click id or a referrer is enough to name a channel even when the URL carries no
 * UTM terms: a Google Ads landing always has `gclid`, and a link from another site is
 * still a referral. When none of the three exists the answer is empty — Direct — and
 * nothing is guessed from the path, the language or the device.
 */
export function attributionFrom(input: {
  url: string;
  referrer?: string;
  selfHost?: string;
}): Attribution {
  let url: URL;
  try {
    url = new URL(input.url, `https://${input.selfHost || 'localhost'}`);
  } catch {
    return { ...EMPTY_ATTRIBUTION };
  }

  const param = (name: string, max = MAX_SOURCE): string => clean(url.searchParams.get(name), max);
  const source = param('utm_source');
  const medium = param('utm_medium');
  const campaign = param('utm_campaign', MAX_CAMPAIGN);
  const term = param('utm_term');
  const content = param('utm_content');
  const gclid = param('gclid', MAX_CLICK_ID);
  const fbclid = param('fbclid', MAX_CLICK_ID);
  const referrer = clean(input.referrer ?? '', MAX_URL);
  const selfHost = input.selfHost ?? url.host;

  let derivedSource = source;
  let derivedMedium = medium;
  if (!derivedSource && gclid) {
    derivedSource = 'google';
    derivedMedium = derivedMedium || 'cpc';
  } else if (!derivedSource && fbclid) {
    derivedSource = 'facebook';
    derivedMedium = derivedMedium || 'social';
  } else if (!derivedSource && isExternalReferrer(referrer, selfHost)) {
    derivedSource = referrerHost(referrer);
    derivedMedium = derivedMedium || 'referral';
  }

  return {
    source: derivedSource,
    medium: derivedMedium,
    campaign,
    term,
    content,
    gclid,
    fbclid,
    landing: safePath(`${url.pathname}${url.search}`),
    referrer,
  };
}

/** Whatever a browser or an old client sent, reduced to the columns that exist. */
export function sanitizeAttribution(value: unknown): Attribution {
  if (value === null || typeof value !== 'object') return { ...EMPTY_ATTRIBUTION };
  const row = value as Record<string, unknown>;
  return {
    source: clean(row.source, MAX_SOURCE),
    medium: clean(row.medium, MAX_SOURCE),
    campaign: clean(row.campaign, MAX_CAMPAIGN),
    term: clean(row.term, MAX_SOURCE),
    content: clean(row.content, MAX_SOURCE),
    gclid: clean(row.gclid, MAX_CLICK_ID),
    fbclid: clean(row.fbclid, MAX_CLICK_ID),
    landing: safePath(clean(row.landing, MAX_URL)),
    referrer: clean(row.referrer, MAX_URL),
  };
}

/** True when there is nothing to attribute: the visit was direct. */
export function isDirect(attribution: Attribution): boolean {
  return (
    attribution.source === '' &&
    attribution.medium === '' &&
    attribution.campaign === '' &&
    attribution.gclid === '' &&
    attribution.fbclid === '' &&
    attribution.landing === '' &&
    attribution.referrer === ''
  );
}

/**
 * The words a report prints for a row. A lead written before 010 has no campaign
 * columns and may still carry a referrer; calling that Direct would claim a fact
 * nobody recorded, so it reads Unknown. Only a row that says nothing at all is Direct.
 */
export function sourceLabel(row: { source: string; referrer: string; firstReferrer?: string }): string {
  if (row.source) return row.source;
  if (row.referrer || row.firstReferrer) return 'Unknown';
  return 'Direct';
}
