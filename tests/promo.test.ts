import { describe, expect, it } from 'vitest';
import { inWindow, livePromo, normalizePromo, promoHref } from '../src/lib/content/promo-shape';
import { cairoEndOf } from '../src/components/cards/OfferCountdown';

describe('the promotions document', () => {
  it('stays off until switched on, with a usable default prompt', () => {
    const promo = normalizePromo(null);
    expect(promo.announcement.enabled).toBe(false);
    expect(promo.exitPrompt.enabled).toBe(false);
    expect(promo.exitPrompt.title.ar).not.toBe('');
  });

  it('keeps only safe links and a bounded delay', () => {
    expect(promoHref('/offers')).toBe('/offers');
    expect(promoHref('https://example.com/a')).toBe('https://example.com/a');
    expect(promoHref('javascript:alert(1)')).toBe('');
    expect(promoHref('//evil.example')).toBe('');
    expect(normalizePromo({ exitPrompt: { delaySeconds: 9999 } }).exitPrompt.delaySeconds).toBe(120);
    expect(normalizePromo({ exitPrompt: { delaySeconds: -4 } }).exitPrompt.delaySeconds).toBe(0);
  });

  it('respects the date window, inclusive on both ends', () => {
    expect(inWindow('2026-11-01', '2026-11-30', '2026-11-30')).toBe(true);
    expect(inWindow('2026-11-01', '2026-11-30', '2026-12-01')).toBe(false);
    expect(inWindow('', '', '2026-12-01')).toBe(true);
  });

  it('shows nothing live that is off, out of its dates, or empty', () => {
    const base = normalizePromo({
      announcement: { enabled: true, text: { ar: 'خصم', en: '' }, endsOn: '2026-11-10' },
      exitPrompt: { enabled: true, action: 'link', href: '' },
    });
    expect(livePromo(base, '2026-11-09').announcement.enabled).toBe(true);
    expect(livePromo(base, '2026-11-11').announcement.enabled).toBe(false);
    // A "go to a link" prompt without a link has nowhere to send anyone.
    expect(livePromo(base, '2026-11-09').exitPrompt.enabled).toBe(false);
    const empty = normalizePromo({ announcement: { enabled: true } });
    expect(livePromo(empty, '2026-11-09').announcement.enabled).toBe(false);
  });
});

describe('the offer countdown', () => {
  it('ends an offer at the close of its end day in Cairo, winter and summer', () => {
    expect(new Date(cairoEndOf('2026-01-10')).toISOString()).toBe('2026-01-10T21:59:59.000Z');
    expect(new Date(cairoEndOf('2026-07-10')).toISOString()).toBe('2026-07-10T20:59:59.000Z');
  });
});
