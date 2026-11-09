import { describe, expect, it } from 'vitest';
import { BRAND_DEFAULTS, DEFAULT_WHATSAPP_MESSAGE, normalizeBrand } from '../src/lib/content/brand-shape';
import { HOME_BANDS, normalizeHomeLayout } from '../src/lib/content/home-layout-shape';

describe('the brand profile', () => {
  it('keeps the shipped social accounts until a list is saved', () => {
    expect(normalizeBrand({}).socials).toEqual(BRAND_DEFAULTS.socials);
    expect(normalizeBrand({ socials: [] }).socials).toEqual([]);
  });

  it('keeps only known networks with an http(s) address, once each', () => {
    const socials = normalizeBrand({
      socials: [
        { id: 'tiktok', href: 'https://www.tiktok.com/@shamah' },
        { id: 'instagram', href: 'javascript:alert(1)' },
        { id: 'myspace', href: 'https://myspace.com/x' },
        { id: 'tiktok', href: 'https://www.tiktok.com/@other' },
      ],
    }).socials;
    expect(socials).toEqual([{ id: 'tiktok', href: 'https://www.tiktok.com/@shamah', label: 'TikTok' }]);
  });

  it('accepts brand pictures from this site only', () => {
    expect(normalizeBrand({ logo: '/uploads/logo.webp' }).logo).toBe('/uploads/logo.webp');
    expect(normalizeBrand({ logo: 'https://evil.example/logo.png' }).logo).toBe('');
    expect(normalizeBrand({ paymentImage: '//evil.example/p.png' }).paymentImage).toBe('');
  });

  it('falls back to the default WhatsApp words per language', () => {
    expect(normalizeBrand({ whatsappMessage: { ar: 'أهلاً', en: '' } }).whatsappMessage).toEqual({ ar: 'أهلاً', en: DEFAULT_WHATSAPP_MESSAGE.en });
  });
});

describe('the homepage layout', () => {
  it('keeps the saved order and appends any band it did not mention, shown', () => {
    const layout = normalizeHomeLayout([
      { key: 'offers', visible: true },
      { key: 'articles', visible: false },
    ]);
    expect(layout.map((band) => band.key)).toEqual(['offers', 'articles', 'intro', 'proofs', 'compare', 'branches']);
    expect(layout.find((band) => band.key === 'articles')?.visible).toBe(false);
    expect(layout.find((band) => band.key === 'intro')?.visible).toBe(true);
  });

  it('ignores unknown and repeated bands', () => {
    const layout = normalizeHomeLayout([{ key: 'hero' }, { key: 'offers' }, { key: 'offers', visible: false }, 'junk']);
    expect(layout).toHaveLength(HOME_BANDS.length);
    expect(layout[0]).toEqual({ key: 'offers', visible: true });
  });
});
