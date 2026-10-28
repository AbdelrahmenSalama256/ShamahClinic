/**
 * The three things the site reports, and the one sentence each vendor is told.
 *
 * Names are constants, not strings typed at call sites: a campaign reports
 * `lead_submitted` whether it fired from the booking dialog or the contact form, so a
 * dashboard built today still counts tomorrow. Every vendor receives the same event in
 * its own vocabulary, and a vendor that is not on the page is skipped by the optional
 * calls rather than by branching in the component that fires the event.
 */

export const EVENT_NAMES = {
  leadSubmitted: 'lead_submitted',
  phoneClick: 'phone_click',
  whatsappClick: 'whatsapp_click',
} as const;

export type TrackingEvent = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export const TRACKING_EVENTS: readonly TrackingEvent[] = Object.values(EVENT_NAMES);

export type EventParams = Record<string, string | number | boolean | undefined | null>;

/** Snapchat only accepts its own event vocabulary; a lead is its sign-up. */
const SNAPCHAT_EVENTS: Partial<Record<TrackingEvent, string>> = {
  lead_submitted: 'SIGN_UP',
};

/** The handful of globals the providers install; a test supplies a plain object. */
export interface EventSink {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  ttq?: { track?: (...args: unknown[]) => void };
  snaptr?: (...args: unknown[]) => void;
  uetq?: { push?: (...args: unknown[]) => void };
  clarity?: (...args: unknown[]) => void;
  hj?: (...args: unknown[]) => void;
}

/** Drop blanks so a vendor is not sent `{ service: undefined }`. */
export function cleanParams(params: EventParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Push one event everywhere the page is listening. `dataLayer` is always written — that
 * is the layer Tag Manager reads, and the layer the console's own preview reads — while
 * the direct vendors are reached only when their loader has already run.
 */
export function dispatchEvent(sink: EventSink, event: TrackingEvent, params: EventParams = {}): void {
  const clean = cleanParams(params);
  if (Array.isArray(sink.dataLayer)) sink.dataLayer.push({ event, ...clean });
  sink.gtag?.('event', event, clean);
  sink.fbq?.('trackCustom', event, clean);
  sink.ttq?.track?.(event, clean);
  const snap = SNAPCHAT_EVENTS[event];
  if (snap) sink.snaptr?.('track', snap);
  sink.uetq?.push?.('event', event, clean);
  sink.clarity?.('event', event);
  sink.hj?.('event', event);
}
