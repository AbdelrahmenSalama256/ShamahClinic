/**
 * The names this site reports. They are the contract between the browser, the ingest
 * endpoint and the aggregate tables, so they live in one list that has no dependencies
 * and can be imported by a client component without dragging the database along.
 */
export const TRACK_EVENTS = [
  'page_view',
  'whatsapp_click',
  'call_click',
  'directions_click',
  'form_start',
  'form_submit',
  'cta_click',
  'nav_click',
  'faq_open',
  'search_query',
  'story_view',
  'offer_view',
] as const;

export type TrackEventName = (typeof TRACK_EVENTS)[number];
