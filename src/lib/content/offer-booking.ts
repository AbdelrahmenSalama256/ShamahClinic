/**
 * The one question a booking asks the database: does this offer really cover these services today?
 *
 * The browser answers it from the offer it was served, and that answer is worth having too —
 * it is what keeps a visitor from being shown a service the offer does not cover. But the
 * page's copy of an offer can be an hour old, a request can be typed by hand, and an owner can
 * hide an offer five minutes before the appointment lands. Only here, next to the row, is the
 * answer current.
 *
 * This never refuses a lead. A patient whose enquiry is dropped because a promotion expired
 * thirty seconds ago has lost an appointment the clinic would happily take, and the record is
 * the clinic's to read. So the verdict is *stored with* the lead as `offerState`, and whoever
 * opens the row sees whether the offer they are about to honour is one the CMS still stands
 * behind.
 *
 * A database that does not answer is `unchecked`, which is the same word the read path uses
 * when it falls back to the committed snapshot: not "the offer is fine", and not "the offer is
 * not", and honest about which of the two it is.
 */
import { db } from '../db';
import { offerLiveOn, offerServiceScope, serviceIsEligible } from './offer-services';

export type OfferBookingState =
  /** the offer is live today and covers every service the booking names */
  | 'ok'
  /** the booking named no offer, so there is nothing to check */
  | 'no-offer'
  /** no row has that slug */
  | 'unknown'
  /** never published, in the trash, or switched off for visitors — the same rule the site reads by */
  | 'hidden'
  /** today falls outside the days the owner typed */
  | 'not-live'
  /** the offer is live, but not for the services chosen */
  | 'not-linked'
  /** the check could not run */
  | 'unchecked';

/** A booking's service list, as the lead may carry it: strings only, and never a long one. */
export function bookingServiceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item !== '').slice(0, 20);
}

/**
 * MariaDB stores JSON in a LONGTEXT, so the driver hands this path a string.
 *
 * Without it an offer the owner deliberately narrowed would arrive as `'["uid"]'`, be
 * read as a column nobody answered, and pass every booking — the one failure this check
 * exists to catch. Same reading as `asJsonValue()` in `./published.ts`; a document that
 * will not parse stays a string, which `offerServiceScope()` reads as unconfigured.
 */
function asColumnJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function checkOfferBooking(offerSlug: unknown, serviceIds: readonly string[]): Promise<OfferBookingState> {
  const slug = typeof offerSlug === 'string' ? offerSlug.trim().slice(0, 200) : '';
  if (!slug) return 'no-offer';
  // An appointment with no service named cannot be checked against an offer, and the form
  // will not send one; saying so here keeps `not-linked` meaning what it says.
  if (serviceIds.length === 0) return 'not-linked';

  try {
    const rows = await db
      .selectFrom('offers')
      .select(['status', 'deleted_at', 'enabled', 'starts_at', 'ends_at', 'applicable_services'])
      .where('slug', '=', slug)
      .limit(1)
      .execute();
    const row = rows[0];
    if (!row) return 'unknown';
    if (row.status !== 'published' || row.deleted_at !== null || row.enabled !== 1) return 'hidden';
    if (!offerLiveOn(row.starts_at, row.ends_at)) return 'not-live';

    const scope = offerServiceScope(asColumnJson(row.applicable_services));
    return serviceIds.every((uid) => serviceIsEligible(scope, uid)) ? 'ok' : 'not-linked';
  } catch {
    return 'unchecked';
  }
}
