/**
 * The homepage's band order and visibility, as the owner arranges it in Settings. The
 * hero slider is not in the list: it is the page's first screen and has its own console.
 *
 * Stored as one `settings` row (group `home`, key `sections`). Any band the stored list
 * does not mention — a band added in a later release — is appended, shown, so a new
 * section never stays hidden because an older save did not know it.
 */
export const HOME_LAYOUT_GROUP = 'home';
export const HOME_LAYOUT_KEY = 'sections';

export const HOME_BANDS = ['intro', 'proofs', 'compare', 'offers', 'branches', 'articles'] as const;
export type HomeBand = (typeof HOME_BANDS)[number];

export const HOME_BAND_LABELS: Record<HomeBand, { ar: string; en: string }> = {
  intro: { ar: 'لماذا شامه والخدمات المميزة', en: 'Why Shamah & featured services' },
  proofs: { ar: 'آراء المرضى (واتساب وفيديو)', en: 'Patient testimonials (WhatsApp & video)' },
  compare: { ar: 'قبل وبعد', en: 'Before & after' },
  offers: { ar: 'العروض', en: 'Offers' },
  branches: { ar: 'الفروع', en: 'Branches' },
  articles: { ar: 'المدونة', en: 'Blog' },
};

export interface HomeBandState {
  key: HomeBand;
  visible: boolean;
}

export const HOME_LAYOUT_DEFAULTS: HomeBandState[] = HOME_BANDS.map((key) => ({ key, visible: true }));

export function normalizeHomeLayout(value: unknown): HomeBandState[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<HomeBand>();
  const out: HomeBandState[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const { key, visible } = entry as Record<string, unknown>;
    const band = HOME_BANDS.find((candidate) => candidate === key);
    if (!band || seen.has(band)) continue;
    seen.add(band);
    out.push({ key: band, visible: visible !== false });
  }
  for (const band of HOME_BANDS) if (!seen.has(band)) out.push({ key: band, visible: true });
  return out;
}
