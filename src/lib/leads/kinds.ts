/**
 * The lead vocabulary, with no database behind it.
 *
 * The console's browser half needs the statuses and the source names to draw its chips;
 * importing them from ./store.ts would pull Kysely and the pool into the browser bundle.
 * So the words live here and the store re-exports them.
 */
export const LEAD_STATUSES = ['new', 'contacted', 'booked', 'done', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The two public forms; an import may carry its own source string. */
export const LEAD_SOURCES = ['booking', 'contact-form'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value);
}
