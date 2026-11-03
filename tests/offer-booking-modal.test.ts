/**
 * OFFER-1 — what step 1 of the booking wizard says when the visitor arrived from an offer.
 *
 * The owner's complaint was that choosing an offer did nothing: the wizard ticked the first
 * service on its own and the page called that "the services this offer covers". So the proof
 * here is about words as much as about ticks — each render is what a visitor reads, and one of
 * these four sentences must be the true one:
 *
 *   - **the offer named services** → they are the only ones on show, the first arrives ticked,
 *     and it is labelled as chosen from the offer;
 *   - **the offer never answered** → every service is on show and nothing claims the offer
 *     picked it, because the clinic's blank column is not an owner's decision;
 *   - **the offer said "all services"** → same list, and the sentence says the offer's own word;
 *   - **the offer said "no services"** → no list at all, and the reason is on the screen rather
 *     than a wizard that silently books through something the owner excluded.
 *
 * A card that names one service outranks all of this: the visitor's own click is what arrives
 * ticked, and the offer's badge stays off it.
 *
 * What is deliberately not here: real clinic wording, prices or photographs.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BranchLite } from '../src/data/branches';
import type { TreatmentOption } from '../src/data/treatments';
import type { BookingOffer } from '../src/context/BookingContext';

// `useLanguage()` reads the locale off the path, and the wizard's links want a router.
let mockPath = '/offers/test-offer';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => undefined,
  redirect: () => undefined,
}));

const { LanguageProvider } = await import('../src/context/LanguageContext');
const { BookingModal } = await import('../src/components/booking/BookingModal');

const bi = (ar: string, en: string) => ({ ar, en });
const service = (id: string, ar: string, en: string): TreatmentOption => ({ id, name: bi(ar, en), priceStartingAt: 900 });

const peel = service('svc-peel', 'جلسة تقشير', 'Peel session');
const laser = service('svc-laser', 'جلسة ليزر', 'Laser session');
const branch: BranchLite = { id: 'br-1', name: bi('فرع اختبار', 'Test branch'), address: bi('عنوان اختبار', 'Test address'), phone: '+20 2 0000 0000' };

/** The modal as the wizard renders it on the first step, in one named language. */
function drawn(
  offer: BookingOffer | undefined,
  treatments: TreatmentOption[],
  language: 'ar' | 'en' = 'en',
  preSelectedTreatmentId?: string,
): string {
  // The provider reads the language off the path, so this is how a test picks a language.
  mockPath = `/${language}/offers/test-offer`;
  /* eslint-disable react/no-children-prop */
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      children: createElement(BookingModal, {
        isOpen: true,
        onClose: () => {},
        branches: [branch],
        treatments,
        specialists: [],
        offer,
        preSelectedTreatmentId,
      }),
    }),
  );
  /* eslint-enable react/no-children-prop */
}

const offer = (services: string[] | null): BookingOffer => ({ slug: 'test-offer', name: bi('عرض اختبار', 'Test offer'), services });
const ticks = (html: string): number => (html.match(/aria-pressed="true"/g) ?? []).length;

describe('step 1 of a booking that started from an offer', () => {
  it('shows only the services the offer names, and says the first came from it', () => {
    const html = drawn(offer(['svc-peel']), [peel, laser]);
    expect(html).toContain('Peel session');
    // The narrowing is the feature: an offer that covers one service must not offer the other.
    expect(html).not.toContain('Laser session');
    expect(ticks(html)).toBe(1);
    expect(html).toContain('Chosen from your offer');
    expect(html).toContain('These are the services this offer covers');
  });

  it('names the badge once, even across a list the owner ordered', () => {
    // Two services are on show and one tick arrives from the offer; the other waits for
    // the visitor's own click, which is what stops the page from over-claiming.
    const html = drawn(offer(['svc-peel', 'svc-laser']), [peel, laser]);
    expect(html).toContain('Peel session');
    expect(html).toContain('Laser session');
    expect(ticks(html)).toBe(1);
    expect(html.match(/Chosen from your offer/g)).toHaveLength(1);
  });

  it('shows every service and claims nothing when the owner never answered', () => {
    const html = drawn(offer(null), [peel, laser]);
    expect(ticks(html)).toBe(1);
    expect(html).not.toContain('Chosen from your offer');
    expect(html).toContain('no services set for it yet');
    // The Arabic sentence is the one an Arabic visitor reads; both languages must tell the
    // same truth about a blank column.
    expect(drawn(offer(null), [peel, laser], 'ar')).toContain('لم نُحدّد لهذا العرض خدمات بعد');
  });

  it('says “every service” when that is the answer the owner gave', () => {
    const html = drawn(offer(['*']), [peel, laser]);
    expect(ticks(html)).toBe(1);
    expect(html).not.toContain('Chosen from your offer');
    expect(html).toContain('This offer covers every service we list');
  });

  it('gives the visitor no pick, and the reason, when the offer says no services', () => {
    const html = drawn(offer([]), [peel, laser]);
    expect(html).not.toContain('Peel session');
    expect(ticks(html)).toBe(0);
    expect(html).toContain('This offer is not linked to any service yet');
    expect(html).not.toContain('No services are listed right now');
  });

  it('lets the card the visitor clicked outrank the offer’s list', () => {
    // The wizard arrived from a service page, so that service is what step 1 opens with —
    // and it is not the offer's doing, so the badge stays off.
    const html = drawn(offer(['svc-peel', 'svc-laser']), [peel, laser], 'en', 'svc-laser');
    expect(html).not.toContain('Chosen from your offer');
    expect(ticks(html)).toBe(1);
  });

  it('says nothing about an offer when there is no offer', () => {
    // A booking opened from the «احجزي» button has no offer behind it, so the first service
    // is still what it always was — a starting point, not a promise about a promotion.
    const html = drawn(undefined, [peel, laser]);
    expect(ticks(html)).toBe(1);
    expect(html).not.toContain('Chosen from your offer');
    expect(html).not.toContain('This offer covers');
    expect(html).toContain('Select one or more of our specialized treatments');
  });
});
