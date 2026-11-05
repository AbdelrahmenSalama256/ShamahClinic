/**
 * The marketing tags the console can switch on, as data.
 *
 * One registry feeds four readers: the console screen (labels, hints, the pattern a
 * saved ID must match), the server that turns saved rows into an injection plan, the
 * browser that injects the tags after consent, and the tests that assert no provider
 * is loaded twice. An ID is validated here and nowhere else, so the client cannot
 * post a value the server would reject and the server cannot save one the client
 * would print.
 *
 * Deliberately not here: a free-form script box. Every provider contributes a fixed
 * bootstrap built from its own ID; there is no field anywhere that accepts raw
 * JavaScript, because that field is how a tracking screen becomes a way to run code
 * on every visitor's page.
 */

export interface BilingualLabel {
  ar: string;
  en: string;
}

export type ProviderKey = 'gtm' | 'ga4' | 'ads' | 'meta' | 'tiktok' | 'snapchat' | 'clarity' | 'hotjar' | 'bing';

export type ProviderCategory = 'tag-manager' | 'analytics' | 'ads' | 'behavior';

export interface TrackingProvider {
  key: ProviderKey;
  category: ProviderCategory;
  label: BilingualLabel;
  /** The words under the field: what this tag is for, in plain language. */
  hint: BilingualLabel;
  placeholder: string;
  pattern: RegExp;
  /** The value an invalid entry is compared against in the error message. */
  example: string;
  /** Google Ads alone takes a conversion label as well as its ID. */
  hasLabel?: boolean;
  /**
   * A Google tag loaded through Tag Manager is already on the page; loading the direct
   * tag as well would count every visit (and every conversion) twice. Saved, but not
   * injected.
   */
  insideGtm?: boolean;
}

export const TRACKING_PROVIDERS: readonly TrackingProvider[] = [
  {
    key: 'gtm',
    category: 'tag-manager',
    label: { ar: 'Google Tag Manager', en: 'Google Tag Manager' },
    hint: {
      ar: 'معرّف الحاوية. إذا شغّلته، لا نضيف وسوم جوجل المباشرة حتى لا تتكرر الزيارات.',
      en: 'The container ID. When it is on, the direct Google tags are not added, so visits are not counted twice.',
    },
    placeholder: 'GTM-XXXXXXX',
    pattern: /^GTM-[A-Z0-9]{4,12}$/,
    example: 'GTM-ABC1234',
  },
  {
    key: 'ga4',
    category: 'analytics',
    label: { ar: 'Google Analytics 4', en: 'Google Analytics 4' },
    hint: {
      ar: 'معرّف القياس. يظهر في Google Analytics تحت «إدارة ← تدفقات البيانات».',
      en: 'The measurement ID. It is under Google Analytics → Admin → Data streams.',
    },
    placeholder: 'G-XXXXXXXXXX',
    pattern: /^G-[A-Z0-9]{6,14}$/,
    example: 'G-ABC123XYZ9',
    insideGtm: true,
  },
  {
    key: 'ads',
    category: 'ads',
    label: { ar: 'Google Ads — تتبّع التحويلات', en: 'Google Ads — conversion tracking' },
    hint: {
      ar: 'معرّف التحويل يبدأ بـ AW-. وسم التحويل (Label) اختياري ويأتي معه من Google Ads.',
      en: 'The conversion ID starts with AW-. The conversion label is optional and arrives with it from Google Ads.',
    },
    placeholder: 'AW-123456789',
    pattern: /^AW-\d{9,12}$/,
    example: 'AW-123456789',
    hasLabel: true,
    insideGtm: true,
  },
  {
    key: 'meta',
    category: 'ads',
    label: { ar: 'Meta Pixel', en: 'Meta Pixel' },
    hint: { ar: 'رقم البكسل من Events Manager.', en: 'The pixel ID from Events Manager.' },
    placeholder: '123456789012345',
    pattern: /^\d{15,16}$/,
    example: '123456789012345',
  },
  {
    key: 'tiktok',
    category: 'ads',
    label: { ar: 'TikTok Pixel', en: 'TikTok Pixel' },
    hint: { ar: 'معرّف البكسل من TikTok Ads Manager.', en: 'The pixel ID from TikTok Ads Manager.' },
    placeholder: 'CXXXXXXXXXXXXXXX',
    pattern: /^[A-Z0-9]{15,25}$/,
    example: 'CABC123DEF456GHI',
  },
  {
    key: 'snapchat',
    category: 'ads',
    label: { ar: 'Snapchat Pixel', en: 'Snapchat Pixel' },
    hint: { ar: 'معرّف البكسل من Snapchat Ads Manager.', en: 'The pixel ID from Snapchat Ads Manager.' },
    placeholder: '00000000-0000-0000-0000-000000000000',
    pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    example: '4f5c1e2a-8b3d-4c6f-9a1b-2d3e4f5a6b7c',
  },
  {
    key: 'clarity',
    category: 'behavior',
    label: { ar: 'Microsoft Clarity', en: 'Microsoft Clarity' },
    hint: {
      ar: 'معرّف المشروع من إعدادات Clarity. يسجّل جلسات مجهولة لتحسين الصفحات.',
      en: 'The project ID from Clarity settings. It records anonymous sessions for page improvements.',
    },
    placeholder: 'abcdefghij',
    pattern: /^[a-z0-9]{10}$/,
    example: 'k2m9x4p7qd',
  },
  {
    key: 'hotjar',
    category: 'behavior',
    label: { ar: 'Hotjar', en: 'Hotjar' },
    hint: { ar: 'رقم الموقع (Site ID) من إعدادات Hotjar.', en: 'The Site ID from Hotjar settings.' },
    placeholder: '1234567',
    pattern: /^\d{6,9}$/,
    example: '1234567',
  },
  {
    key: 'bing',
    category: 'ads',
    label: { ar: 'Microsoft Advertising (UET)', en: 'Microsoft Advertising (UET)' },
    hint: { ar: 'معرّف UET من Microsoft Advertising.', en: 'The UET tag ID from Microsoft Advertising.' },
    placeholder: '12345678',
    pattern: /^\d{8,10}$/,
    example: '12345678',
  },
];

export const PROVIDER_KEYS = TRACKING_PROVIDERS.map((provider) => provider.key);

export function providerByKey(key: string): TrackingProvider | null {
  return TRACKING_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

/** One saved row: the ID, whether the owner switched it on, and Ads' extra label. */
export interface ProviderConfig {
  id: string;
  label?: string;
  enabled: boolean;
}

export type TrackingConfig = Partial<Record<ProviderKey, ProviderConfig>>;

const ID_LABEL = /^[A-Za-z0-9_-]{0,80}$/;

export type IdVerdict =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'format' | 'label' };

/**
 * The one place a saved ID is judged. Empty is not an error: clearing a field is how an
 * owner removes a tag, and the provider simply stops being injected.
 */
export function validateId(provider: TrackingProvider, raw: unknown, label?: unknown): IdVerdict {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (id === '') return { ok: false, reason: 'empty' };
  if (!provider.pattern.test(id)) return { ok: false, reason: 'format' };
  if (provider.hasLabel) {
    const text = typeof label === 'string' ? label.trim() : '';
    if (text !== '' && !ID_LABEL.test(text)) return { ok: false, reason: 'label' };
  }
  return { ok: true, value: id };
}

/** Settings rows arrive as `unknown`; only a row this shape can be planned from. */
export function normalizeConfig(raw: unknown): TrackingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TrackingConfig = {};
  for (const provider of TRACKING_PROVIDERS) {
    const entry = (raw as Record<string, unknown>)[provider.key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const id = typeof (entry as { id?: unknown }).id === 'string' ? ((entry as { id: string }).id).trim() : '';
    if (id === '') continue;
    const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
    out[provider.key] = { id, ...(label ? { label } : {}), enabled: (entry as { enabled?: unknown }).enabled === true };
  }
  return out;
}

/**
 * What the browser is actually given. `gtagIds` is one list because Google's loader is
 * one script for every Google tag on the page — loading it twice is the duplicate this
 * plan exists to prevent. `suppressed` names saved tags that a Tag Manager container
 * owns instead, so the console can explain why an enabled row is not injecting.
 */
export interface TagPlan {
  gtm: string | null;
  gtagIds: string[];
  ads: { id: string; label: string } | null;
  vendors: { key: ProviderKey; id: string }[];
  suppressed: ProviderKey[];
  invalid: ProviderKey[];
}

export function planTags(config: TrackingConfig): TagPlan {
  const invalid: ProviderKey[] = [];
  const suppressed: ProviderKey[] = [];
  const gtagIds: string[] = [];
  const vendors: { key: ProviderKey; id: string }[] = [];
  const judged = new Map<ProviderKey, string>();

  for (const provider of TRACKING_PROVIDERS) {
    const row = config[provider.key];
    if (!row || row.id === '') continue;
    const verdict = validateId(provider, row.id, row.label);
    if (verdict.ok) judged.set(provider.key, verdict.value);
    else invalid.push(provider.key);
  }

  const enabled = (key: ProviderKey): boolean => judged.has(key) && config[key]?.enabled === true;
  const gtm = enabled('gtm') ? (judged.get('gtm') ?? null) : null;
  let ads: { id: string; label: string } | null = null;

  for (const provider of TRACKING_PROVIDERS) {
    if (provider.key === 'gtm' || !enabled(provider.key)) continue;
    if (gtm && provider.insideGtm) {
      suppressed.push(provider.key);
      continue;
    }
    const id = judged.get(provider.key) as string;
    if (provider.key === 'ga4' || provider.key === 'ads') {
      if (!gtagIds.includes(id)) gtagIds.push(id);
      if (provider.key === 'ads') ads = { id, label: config.ads?.label?.trim() ?? '' };
      continue;
    }
    vendors.push({ key: provider.key, id });
  }

  return { gtm, gtagIds, ads, vendors, suppressed, invalid };
}

/** Nothing to inject: no tag manager, no Google tag, no vendor. */
export function planIsEmpty(plan: TagPlan): boolean {
  return plan.gtm === null && plan.gtagIds.length === 0 && plan.vendors.length === 0;
}

/** Every host a saved plan can make the visitor's browser contact. */
export const PROVIDER_HOSTS: readonly string[] = [
  'www.googletagmanager.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'sc-static.net',
  'www.clarity.ms',
  'static.hotjar.com',
  'bat.bing.com',
];
