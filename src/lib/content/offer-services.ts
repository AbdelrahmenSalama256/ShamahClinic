/**
 * What an offer may be booked through, read the same way by every caller.
 *
 * Three places ask the question — the console's picker, the public booking modal and
 * the lead endpoint that has to refuse an impossible appointment — and they must not
 * answer it from three different readings of one JSON column. This module is the only
 * interpreter, and it imports nothing: a browser bundle and a Node route get the same
 * function body.
 *
 * The column is tri-state, and the two empties are different answers:
 *
 *   NULL      `unconfigured` — nobody has answered the question. The rows imported from
 *             WordPress are all in this state. It is *not* "All services": an offer that
 *             was never linked must not quietly gain a wider booking scope than the owner
 *             meant, and it must not be shown to them as a decision they made.
 *   []        `none`         — the owner answered "No services". Deliberate, and it blocks
 *             booking until they pick something.
 *   ["*"]     `all`          — the owner answered "All services", including the ones
 *             added tomorrow. Explicit, and it is the only value that means everything.
 *   ["uid",…] `some`         — these services, in the order the owner picked them.
 */
import { calendarDay } from './kinds';

/** The one token that means "every service, including ones that do not exist yet". */
export const ALL_SERVICES = '*';

export type OfferServiceScope =
  | { state: 'unconfigured' }
  | { state: 'all' }
  | { state: 'none' }
  | { state: 'some'; serviceUids: string[] };

/**
 * The column as an answer.
 *
 * A value that is not a list of strings — a document written by a hand-edited dump, a
 * future shape this code has not met — is read as `unconfigured`, not as an error. The
 * alternative is a broken column turning a bookable offer into one that refuses every
 * appointment, and a booking lost to a data defect is worse than a restriction nobody
 * intended. The console still draws what the row holds and the save path refuses to
 * write another malformed one.
 */
export function offerServiceScope(raw: unknown): OfferServiceScope {
  if (raw === null || raw === undefined) return { state: 'unconfigured' };
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string')) return { state: 'unconfigured' };
  if (raw.includes(ALL_SERVICES)) return { state: 'all' };
  if (raw.length === 0) return { state: 'none' };
  return { state: 'some', serviceUids: raw };
}

/** The stored document this scope means, or null for "never configured". */
export function scopeToColumn(scope: OfferServiceScope): string[] | null {
  if (scope.state === 'unconfigured') return null;
  if (scope.state === 'all') return [ALL_SERVICES];
  if (scope.state === 'none') return [];
  return scope.serviceUids;
}

/**
 * Whether a service may be booked through this offer.
 *
 * `unconfigured` answers *yes*: it is the state a legacy offer is in, and refusing an
 * appointment the clinic has taken for years because a column was never filled is the
 * wrong kind of careful. Every other state is strict.
 */
export function serviceIsEligible(scope: OfferServiceScope, serviceUid: string): boolean {
  if (scope.state === 'unconfigured' || scope.state === 'all') return true;
  if (scope.state === 'none') return false;
  return scope.serviceUids.includes(serviceUid);
}

/**
 * The services the booking wizard opens with, and which of them the *offer* chose.
 *
 * A visitor who arrived through an offer has already said what they want; making them tick
 * the box again reads as the site not knowing what it just sold. Two rules, in order: a
 * service the caller named — a "Book this service" click, which is a stronger statement than
 * any promotion — wins and is nobody else's doing; otherwise the wizard starts on the first
 * service the offer's own list holds, in the order the owner picked it.
 *
 * `fromOffer` is what the screen badges, and only `some` fills it. An offer that says "all
 * services", or that nobody ever configured, did not choose that first box — the list did —
 * and a badge claiming otherwise would put a promise on the clinic's behalf that no owner
 * made. The visitor can still change either way; this is what is ticked when step 1 appears.
 */
export function autoPickServices(
  scope: OfferServiceScope,
  eligibleIds: readonly string[],
  requestedId?: string,
): { ids: string[]; fromOffer: string[] } {
  if (requestedId && eligibleIds.includes(requestedId)) return { ids: [requestedId], fromOffer: [] };
  const first = eligibleIds[0];
  if (!first) return { ids: [], fromOffer: [] };
  return { ids: [first], fromOffer: scope.state === 'some' ? [first] : [] };
}

/** How many services this offer names, for the console's label. `null` is "not configured". */
export function scopeCount(scope: OfferServiceScope): number | null {
  if (scope.state === 'unconfigured') return null;
  if (scope.state === 'all') return -1;
  if (scope.state === 'none') return 0;
  return scope.serviceUids.length;
}

/**
 * The console's single form token for the column.
 *
 * The editor holds flat strings, and the three empties have to stay three: `''` is the
 * column being NULL, `'none'` is `[]`, `'*'` is All, and anything else is the picked
 * uids in order. A token is not a wire format — the API still carries a real array, and
 * `canonicalizeOfferServices()` is what the server trusts.
 */
export function scopeToToken(scope: OfferServiceScope): string {
  if (scope.state === 'unconfigured') return '';
  if (scope.state === 'all') return ALL_SERVICES;
  if (scope.state === 'none') return 'none';
  return scope.serviceUids.join(',');
}

export function tokenToScope(token: string): OfferServiceScope {
  const text = String(token ?? '').trim();
  if (text === '') return { state: 'unconfigured' };
  if (text === ALL_SERVICES) return { state: 'all' };
  if (text === 'none') return { state: 'none' };
  return { state: 'some', serviceUids: text.split(',').map((item) => item.trim()).filter(Boolean) };
}

/**
 * What the server will accept for this column, checked against the services that exist.
 *
 * Only the server can ask the database what exists, so a uid typed into the URL, an
 * offer linked to a service in another list, and a half-written document all stop here.
 * An unknown uid is refused rather than dropped: a save that quietly lost three of five
 * services would write over the owner's answer with a smaller one.
 */
export function canonicalizeOfferServices(
  value: unknown,
  knownServiceUids: ReadonlySet<string>,
): { ok: true; column: string[] | null } | { ok: false; message: string } {
  if (value === null) return { ok: true, column: null };
  if (!Array.isArray(value)) return { ok: false, message: 'expected a list of services' };
  if (value.some((item) => typeof item !== 'string')) return { ok: false, message: 'expected a list of services' };
  const items = value as string[];
  if (items.includes(ALL_SERVICES)) {
    if (items.length > 1) return { ok: false, message: '"All services" cannot be combined with named services' };
    return { ok: true, column: [ALL_SERVICES] };
  }
  const seen: string[] = [];
  for (const uid of items) {
    if (uid === '') return { ok: false, message: 'a service id cannot be empty' };
    if (!knownServiceUids.has(uid)) return { ok: false, message: `"${uid}" is not a service in the services list` };
    // The owner's order is the answer; a repeat is the same service named twice and
    // would show as "3 services" for a choice of two.
    if (!seen.includes(uid)) seen.push(uid);
  }
  return { ok: true, column: seen };
}

/**
 * One name, folded to what a person typing into the picker's search box actually means.
 *
 * Arabic arrives in more shapes than one keyboard. An owner types `الاف`, an imported row
 * says `الأسنان`, and the two differ only in marks a reader does not hear — the hamza and
 * maddah written on the alef, the taa marbooṭa at a word's end, the two yaa forms. The
 * console's search box compares both sides through this, so a name stays findable in either
 * spelling, and English stays findable in either case.
 *
 * The order of the steps is the whole function. `NFKD` *decomposes* a composed letter, so
 * `أ` arrives as `ا` + U+0654 and the class that strips marks has to cover U+0653-U+0655 —
 * maddah, hamza above, hamza below — or folding turns a searchable name into a worse one
 * than the letter that went in. The explicit letter replaces after it are not dead code:
 * `ٱ` (alef with wasla) has no decomposition and survives NFKD untouched.
 */
const COMBINING_MARKS = /[\u064B-\u0655\u0670]/g;

export function foldForSearch(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The clinic's calendar day, as the offer's window is written.
 *
 * `starts_at` and `ends_at` are `DATE` columns: a day, with no hour and no timezone. The
 * site decides "is this offer live today" against Cairo's today, because that is the day
 * the owner typed and the day the branch closes on. It matches `dayOf()` in
 * `../tracking/ingest.ts`; that one lives with the event writer and pulls in the database,
 * so this module keeps its own copy and stays importable from a browser.
 */
export const CAIRO_TIME_ZONE = 'Africa/Cairo';

export function cairoDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const of = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${of('year')}-${of('month')}-${of('day')}`;
}

/**
 * Whether an offer's validity window covers a day.
 *
 * Both boundaries are inclusive and both may be missing: no start means it has always
 * been running, no end means it does not expire. A value the column cannot hold is read
 * as no boundary, for the same reason `offerServiceScope()` fails open — a garbled date
 * must not be the reason a patient cannot book.
 */
export function offerLiveOn(startsAt: unknown, endsAt: unknown, today: string = cairoDay()): boolean {
  const first = calendarDay(startsAt);
  const last = calendarDay(endsAt);
  if (first !== null && today < first) return false;
  if (last !== null && today > last) return false;
  return true;
}
