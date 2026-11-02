/**
 * B3.1 — what an offer may be booked through, from the column to the lead.
 *
 * Three readers ask one question — the console's picker, the booking modal and the lead
 * endpoint — and this suite is the proof they mean the same answer. The interesting part
 * is not the list of linked services; it is that the column has *three* empties that say
 * three different things, and that a booking is never refused by the server.
 *
 * What is deliberately not here: real clinic wording, prices or photos. The rows are
 * obviously test copy, and they are deleted by slug prefix at the end of the run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { db, destroyDb } from '../src/lib/db';
import { json } from '../src/lib/db/json';
import { assertTestDb } from '../src/lib/db/guard';
import {
  ALL_SERVICES,
  cairoDay,
  canonicalizeOfferServices,
  foldForSearch,
  offerLiveOn,
  offerServiceScope,
  scopeCount,
  scopeToColumn,
  scopeToToken,
  serviceIsEligible,
  tokenToScope,
  type OfferServiceScope,
} from '../src/lib/content/offer-services';
import { bookingServiceIds, checkOfferBooking } from '../src/lib/content/offer-booking';
import { fieldsFromForm, formOf } from '../src/lib/console/editor-form';
import type { ContentRow, FieldView } from '../src/lib/content/store';

const known = new Set(['svc-peel', 'svc-laser']);

/** A day a few steps from the Cairo today the offers' windows are written against. */
function shift(days: number, from = cairoDay()): string {
  const [year, month, day] = from.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

describe('the column as an answer', () => {
  it('keeps the three empties apart', () => {
    expect(offerServiceScope(null)).toEqual({ state: 'unconfigured' });
    expect(offerServiceScope(undefined)).toEqual({ state: 'unconfigured' });
    expect(offerServiceScope([])).toEqual({ state: 'none' });
    expect(offerServiceScope([ALL_SERVICES])).toEqual({ state: 'all' });
    expect(offerServiceScope(['svc-peel', 'svc-laser'])).toEqual({ state: 'some', serviceUids: ['svc-peel', 'svc-laser'] });
    expect(scopeCount(offerServiceScope(null))).toBeNull();
    expect(scopeCount(offerServiceScope([]))).toBe(0);
    expect(scopeCount(offerServiceScope([ALL_SERVICES]))).toBe(-1);
    expect(scopeCount(offerServiceScope(['svc-peel']))).toBe(1);
  });

  it('reads a column it does not recognise as an unanswered question', () => {
    // A broken column must not turn a bookable offer into one that refuses every
    // appointment, and must not be shown to the owner as a decision they made.
    for (const broken of ['svc-peel', { a: 1 }, [1, 2], [null], 7]) {
      expect(offerServiceScope(broken)).toEqual({ state: 'unconfigured' });
    }
  });

  it('answers eligibility from the state, not from a guess', () => {
    const uid = 'svc-peel';
    expect(serviceIsEligible(offerServiceScope(null), uid)).toBe(true);
    expect(serviceIsEligible(offerServiceScope([ALL_SERVICES]), uid)).toBe(true);
    expect(serviceIsEligible(offerServiceScope([ALL_SERVICES]), 'svc-anything-else')).toBe(true);
    expect(serviceIsEligible(offerServiceScope([]), uid)).toBe(false);
    expect(serviceIsEligible(offerServiceScope(['svc-laser']), uid)).toBe(false);
    expect(serviceIsEligible(offerServiceScope(['svc-laser', uid]), uid)).toBe(true);
  });

  it('writes back the column each state means', () => {
    expect(scopeToColumn({ state: 'unconfigured' })).toBeNull();
    expect(scopeToColumn({ state: 'all' })).toEqual([ALL_SERVICES]);
    expect(scopeToColumn({ state: 'none' })).toEqual([]);
    expect(scopeToColumn({ state: 'some', serviceUids: ['svc-laser', 'svc-peel'] })).toEqual(['svc-laser', 'svc-peel']);
    // Round trip: the order the owner picked is the order that comes back.
    expect(scopeToColumn(offerServiceScope(scopeToColumn({ state: 'some', serviceUids: ['svc-laser', 'svc-peel'] })))).toEqual([
      'svc-laser',
      'svc-peel',
    ]);
  });
});

describe('the console form token', () => {
  it('keeps the three empties apart across a flat string', () => {
    expect(scopeToToken({ state: 'unconfigured' })).toBe('');
    expect(scopeToToken({ state: 'none' })).toBe('none');
    expect(scopeToToken({ state: 'all' })).toBe(ALL_SERVICES);
    expect(scopeToToken({ state: 'some', serviceUids: ['svc-laser', 'svc-peel'] })).toBe('svc-laser,svc-peel');
    for (const state of [
      { state: 'unconfigured' },
      { state: 'none' },
      { state: 'all' },
      { state: 'some', serviceUids: ['svc-laser', 'svc-peel'] },
    ] satisfies OfferServiceScope[]) {
      expect(tokenToScope(scopeToToken(state))).toEqual(state);
    }
  });

  it('reads a hand-typed token without inventing a service', () => {
    expect(tokenToScope('  ')).toEqual({ state: 'unconfigured' });
    expect(tokenToScope('svc-peel,,svc-laser')).toEqual({ state: 'some', serviceUids: ['svc-peel', 'svc-laser'] });
    expect(tokenToScope(' svc-peel , svc-laser ')).toEqual({ state: 'some', serviceUids: ['svc-peel', 'svc-laser'] });
    expect(tokenToScope(undefined as unknown as string)).toEqual({ state: 'unconfigured' });
  });

  it('carries the column through the editor form in both directions', () => {
    const row = (draftJson: unknown): ContentRow => ({
      id: 'r1',
      key: 'ob-window-sale',
      listKey: null,
      kind: 'offer',
      status: 'draft',
      version: 1,
      trashed: false,
      updatedAt: '2026-10-01T08:00:00.000Z',
      publishedAt: null,
      pendingLocales: [],
      fields: {
        applicableServices: { kind: 'json', draftJson, pending: false, immediate: false, multiline: false, max: 0 },
      } as Record<string, FieldView>,
    });

    // The stored column arrives as JSON; the editor holds one token; the save posts it back.
    expect(formOf(row(['svc-laser', 'svc-peel']), 'en').applicableServices).toBe('svc-laser,svc-peel');
    expect(formOf(row(null), 'en').applicableServices).toBe('');
    expect(formOf(row([]), 'en').applicableServices).toBe('none');
    expect(formOf(row([ALL_SERVICES]), 'en').applicableServices).toBe(ALL_SERVICES);
    expect(fieldsFromForm(row(null), { applicableServices: 'svc-peel' }).fields.applicableServices).toEqual(['svc-peel']);
    expect(fieldsFromForm(row(['svc-peel']), { applicableServices: '' }).fields.applicableServices).toBeNull();
    expect(fieldsFromForm(row(null), { applicableServices: 'none' }).fields.applicableServices).toEqual([]);
    expect(fieldsFromForm(row(null), { applicableServices: ALL_SERVICES }).fields.applicableServices).toEqual([ALL_SERVICES]);
    // An untouched picker must not become a decision: the answer that left is the one typed.
    expect(fieldsFromForm(row(['svc-peel']), { applicableServices: 'svc-peel' }).fields.applicableServices).toEqual(['svc-peel']);
  });
});

describe("the picker's search box", () => {
  it('finds a name written with a hamza from a query typed without one', () => {
    // The gap the browser proof found: NFKD decomposes `أ` into `ا` + U+0654, so the mark
    // class has to reach U+0655 or the folded label is unmatchable by the folded query.
    expect(foldForSearch('ألفا للتجميل')).toContain(foldForSearch('الف'));
    expect(foldForSearch('الأسنان')).toBe(foldForSearch('الاسنان'));
    for (const alef of ['أ', 'إ', 'آ', 'ٱ']) {
      expect(foldForSearch(`${alef}لفا`)).toBe('الفا');
    }
  });

  it('strips the marks a reader does not hear', () => {
    expect(foldForSearch('تجميلُ')).toBe('تجميل');
    expect(foldForSearch('تجميلُّ')).toBe('تجميل');
    expect(foldForSearch('خدماتٰ')).toBe('خدمات');
  });

  it('folds the letter forms a typed name and an imported row disagree on', () => {
    expect(foldForSearch('خدمة')).toBe(foldForSearch('خدمه'));
    expect(foldForSearch('كبرى')).toBe(foldForSearch('كبري'));
    expect(foldForSearch('مؤتمر')).toBe(foldForSearch('موتمر'));
    expect(foldForSearch('شاطئ')).toBe(foldForSearch('شاطي'));
  });

  it('reads an English name in either case and any spacing', () => {
    expect(foldForSearch('  Dental   LASERS ')).toBe('dental lasers');
  });

  it('leaves an empty search empty', () => {
    expect(foldForSearch('')).toBe('');
    expect(foldForSearch('   ')).toBe('');
    expect(foldForSearch(undefined as unknown as string)).toBe('');
  });
});

describe('what the server will accept for the column', () => {
  it('refuses a uid that is not a service', () => {
    const result = canonicalizeOfferServices(['svc-peel', 'made-up'], known);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('made-up');
  });

  it('refuses "All services" combined with named ones', () => {
    expect(canonicalizeOfferServices([ALL_SERVICES, 'svc-peel'], known).ok).toBe(false);
    expect(canonicalizeOfferServices([ALL_SERVICES], known)).toEqual({ ok: true, column: [ALL_SERVICES] });
  });

  it('keeps the owner order, drops a repeat and refuses a hole', () => {
    expect(canonicalizeOfferServices(['svc-laser', 'svc-peel', 'svc-laser'], known)).toEqual({
      ok: true,
      column: ['svc-laser', 'svc-peel'],
    });
    expect(canonicalizeOfferServices(['svc-peel', ''], known).ok).toBe(false);
    expect(canonicalizeOfferServices([], known)).toEqual({ ok: true, column: [] });
    expect(canonicalizeOfferServices(null, known)).toEqual({ ok: true, column: null });
  });

  it('refuses a document that is not a list of strings', () => {
    for (const broken of ['svc-peel', { a: 1 }, [1], [null], undefined]) {
      expect(canonicalizeOfferServices(broken, known).ok).toBe(false);
    }
  });
});

describe('the offer window', () => {
  it('uses the clinic calendar day, not the server clock', () => {
    expect(cairoDay(new Date('2026-01-01T22:00:00Z'))).toBe('2026-01-02');
    expect(cairoDay(new Date('2026-01-01T21:59:00Z'))).toBe('2026-01-01');
    // Egypt keeps summer time: the same hour belongs to a different day in July.
    expect(cairoDay(new Date('2026-07-01T21:00:00Z'))).toBe('2026-07-02');
    expect(cairoDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts both ends and no boundary as no boundary', () => {
    const today = cairoDay();
    expect(offerLiveOn(null, null, today)).toBe(true);
    expect(offerLiveOn(today, today, today)).toBe(true);
    expect(offerLiveOn(shift(-2), shift(-1), today)).toBe(false);
    expect(offerLiveOn(shift(1), shift(7), today)).toBe(false);
    expect(offerLiveOn(shift(-7), null, today)).toBe(true);
    expect(offerLiveOn(null, shift(7), today)).toBe(true);
  });

  it('reads a garbled date as no boundary rather than a closed offer', () => {
    const today = cairoDay();
    expect(offerLiveOn('not a day', '', today)).toBe(true);
    expect(offerLiveOn('2026-02-30', today, today)).toBe(true);
  });
});

describe('a booking lead the server can check', () => {
  it('takes only strings, and never a long list', () => {
    expect(bookingServiceIds('svc-peel')).toEqual([]);
    expect(bookingServiceIds(null)).toEqual([]);
    expect(bookingServiceIds(['svc-peel', 7, '', null])).toEqual(['svc-peel']);
    expect(bookingServiceIds(Array.from({ length: 40 }, (_, i) => `svc-${i}`)).length).toBe(20);
  });
});

// --- the row itself -----------------------------------------------------------

const created: string[] = [];

/** A row shaped like the ones the console writes, with the columns this feature added. */
async function offerRow(patch: {
  slug: string;
  services?: string[] | null;
  from?: string | null;
  to?: string | null;
  enabled?: 0 | 1;
  status?: 'draft' | 'published' | 'trash';
  trashed?: boolean;
}): Promise<string> {
  const id = randomUUID();
  created.push(id);
  await db
    .insertInto('offers')
    .values({
      id,
      slug: patch.slug,
      status: patch.status ?? 'published',
      name_ar: 'عرض تجريبي',
      name_en: 'A test offer',
      applicable_services: patch.services === undefined ? null : json(patch.services),
      starts_at: patch.from ?? null,
      ends_at: patch.to ?? null,
      enabled: patch.enabled ?? 1,
      deleted_at: patch.trashed ? new Date('2026-10-01T08:00:00.000Z') : null,
    })
    .execute();
  return patch.slug;
}

beforeAll(async () => {
  assertTestDb();
  await db.deleteFrom('offers').where('slug', 'like', 'ob-%').execute();
  await offerRow({ slug: 'ob-legacy' });
  await offerRow({ slug: 'ob-all', services: [ALL_SERVICES] });
  await offerRow({ slug: 'ob-none', services: [] });
  await offerRow({ slug: 'ob-peel', services: ['svc-peel'] });
  await offerRow({ slug: 'ob-window', services: ['svc-peel'], from: shift(-1), to: shift(1) });
  await offerRow({ slug: 'ob-expired', services: ['svc-peel'], to: shift(-1) });
  await offerRow({ slug: 'ob-future', services: ['svc-peel'], from: shift(1) });
  await offerRow({ slug: 'ob-off', services: ['svc-peel'], enabled: 0 });
  await offerRow({ slug: 'ob-draft', services: ['svc-peel'], status: 'draft' });
  await offerRow({ slug: 'ob-trash', services: ['svc-peel'], trashed: true });
});

afterAll(async () => {
  await db.deleteFrom('offers').where('slug', 'like', 'ob-%').execute();
  await db.deleteFrom('revisions').where('entity_id', 'in', created).execute();
  await destroyDb();
});

describe('the server’s verdict on a booking', () => {
  it('does not refuse an appointment over a column nobody answered', async () => {
    expect(await checkOfferBooking('ob-legacy', ['svc-peel', 'anything'])).toBe('ok');
  });

  it('honours an explicit "all", an explicit "none" and a picked list', async () => {
    expect(await checkOfferBooking('ob-all', ['svc-peel', 'svc-not-in-any-list'])).toBe('ok');
    expect(await checkOfferBooking('ob-none', ['svc-peel'])).toBe('not-linked');
    expect(await checkOfferBooking('ob-peel', ['svc-peel'])).toBe('ok');
    expect(await checkOfferBooking('ob-peel', ['svc-laser'])).toBe('not-linked');
    // Every service must fit, not just the first.
    expect(await checkOfferBooking('ob-peel', ['svc-peel', 'svc-laser'])).toBe('not-linked');
  });

  it('refuses the window the owner closed, on both sides', async () => {
    const today = cairoDay();
    expect(await checkOfferBooking('ob-window', ['svc-peel'])).toBe('ok');
    expect(await checkOfferBooking('ob-expired', ['svc-peel'])).toBe('not-live');
    expect(await checkOfferBooking('ob-future', ['svc-peel'])).toBe('not-live');
    // The day an offer ends is still its day.
    expect(offerLiveOn(null, today, today)).toBe(true);
  });

  it('says what a row that visitors cannot see is', async () => {
    expect(await checkOfferBooking('ob-off', ['svc-peel'])).toBe('hidden');
    expect(await checkOfferBooking('ob-draft', ['svc-peel'])).toBe('hidden');
    expect(await checkOfferBooking('ob-trash', ['svc-peel'])).toBe('hidden');
  });

  it('names a slug that is not an offer, and a booking that named no offer', async () => {
    expect(await checkOfferBooking('ob-does-not-exist', ['svc-peel'])).toBe('unknown');
    expect(await checkOfferBooking('', ['svc-peel'])).toBe('no-offer');
    expect(await checkOfferBooking(undefined, ['svc-peel'])).toBe('no-offer');
    expect(await checkOfferBooking('ob-peel', [])).toBe('not-linked');
  });

  it('says what the offer is when the database cannot answer', async () => {
    // Not "the offer is fine", and not "refuse the booking": `unchecked`, so the lead is
    // still written and the person reading it knows the check did not run.
    const database = process.env.DATABASE_NAME;
    await destroyDb();
    process.env.DATABASE_NAME = 'shamah_cms_no_such_database';
    try {
      expect(await checkOfferBooking('ob-peel', ['svc-peel'])).toBe('unchecked');
    } finally {
      process.env.DATABASE_NAME = database;
      await destroyDb();
    }
    // The pool is rebuilt lazily, and the row is there again.
    expect(await checkOfferBooking('ob-peel', ['svc-peel'])).toBe('ok');
  });
});
