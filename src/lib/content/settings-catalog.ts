/**
 * What the Settings screen can edit, as plain data so both the server page and the
 * client workspace read the same list.
 *
 * A public page is one entry: the route the visitor reaches, the key its saved state
 * lives under, and the two labels the console shows. This is deliberately the *site's*
 * pages, not the imported WordPress rows — `cart` and `checkout` are not routes this
 * site renders, and a toggle that controls nothing is worse than no toggle.
 */
export interface BilingualLabel {
  ar: string;
  en: string;
}

export const SITE_PAGES = [
  { key: 'home', path: '', label: { ar: 'الرئيسية', en: 'Home' } },
  { key: 'about', path: '/about', label: { ar: 'من نحن', en: 'About' } },
  { key: 'services', path: '/services', label: { ar: 'الخدمات', en: 'Services' } },
  { key: 'offers', path: '/offers', label: { ar: 'العروض', en: 'Offers' } },
  { key: 'branches', path: '/branches', label: { ar: 'الفروع', en: 'Branches' } },
  { key: 'blogs', path: '/blogs', label: { ar: 'المدونة', en: 'Blog' } },
  { key: 'doctors', path: '/doctors', label: { ar: 'الأطباء', en: 'Doctors' } },
  { key: 'results', path: '/results', label: { ar: 'النتائج', en: 'Results' } },
  { key: 'faq', path: '/faq', label: { ar: 'الأسئلة الشائعة', en: 'FAQ' } },
  { key: 'contact', path: '/contact', label: { ar: 'تواصلي معنا', en: 'Contact' } },
  { key: 'privacy', path: '/privacy', label: { ar: 'سياسة الخصوصية', en: 'Privacy' } },
] as const;

export type SitePage = (typeof SITE_PAGES)[number];
export type SitePageKey = SitePage['key'];

export const PAGE_SETTING_GROUP = 'pages';
export const SEO_SETTING_GROUP = 'seo';
export const SITE_SETTING_GROUP = 'site';

export interface SettingField {
  group: string;
  key: string;
  label: BilingualLabel;
  multiline?: boolean;
  placeholder?: BilingualLabel;
}

/** The identity words the public site already reads from the `site` group. */
export const SITE_SETTING_FIELDS: readonly SettingField[] = [
  { group: SITE_SETTING_GROUP, key: 'name', label: { ar: 'اسم العيادة', en: 'Clinic name' } },
  { group: SITE_SETTING_GROUP, key: 'tagline', label: { ar: 'الشعار', en: 'Tagline' }, multiline: true },
  { group: SITE_SETTING_GROUP, key: 'phone', label: { ar: 'الهاتف', en: 'Phone' }, placeholder: { ar: '+20…', en: '+20…' } },
  { group: SITE_SETTING_GROUP, key: 'whatsapp', label: { ar: 'واتساب', en: 'WhatsApp' }, placeholder: { ar: '+20…', en: '+20…' } },
  { group: SITE_SETTING_GROUP, key: 'email', label: { ar: 'البريد الإلكتروني', en: 'Email' } },
  { group: SITE_SETTING_GROUP, key: 'hours', label: { ar: 'ساعات العمل', en: 'Working hours' }, multiline: true },
];

/**
 * Site-wide metadata. These four words and one verification code are what the layout
 * falls back to when a page publishes no metadata of its own, and what Google reads
 * from the home page.
 */
export const SEO_SETTING_FIELDS: readonly SettingField[] = [
  { group: SEO_SETTING_GROUP, key: 'title.ar', label: { ar: 'عنوان الموقع (عربي)', en: 'Site title (Arabic)' }, multiline: true },
  { group: SEO_SETTING_GROUP, key: 'title.en', label: { ar: 'عنوان الموقع (إنجليزي)', en: 'Site title (English)' }, multiline: true },
  { group: SEO_SETTING_GROUP, key: 'description.ar', label: { ar: 'وصف الموقع (عربي)', en: 'Site description (Arabic)' }, multiline: true },
  { group: SEO_SETTING_GROUP, key: 'description.en', label: { ar: 'وصف الموقع (إنجليزي)', en: 'Site description (English)' }, multiline: true },
  { group: SEO_SETTING_GROUP, key: 'verification.google', label: { ar: 'كود تحقق Google', en: 'Google verification' } },
  // input read only and can copy from it 
  { group: SEO_SETTING_GROUP, key: 'verification.bing', label: { ar: 'كود تحقق Bing', en: 'Bing verification' } },
];

/**
 * A redirect target a server component may follow: a local path or an absolute
 * http(s) URL. `//host` is protocol-relative and would leave the site, so it is
 * refused along with every other scheme.
 *
 * It lives here, beside the page registry, because the settings screen validates
 * with it in the browser and `page-visibility.ts` validates with it on the server;
 * one rule, two callers, and the client bundle never has to import the database.
 */
export function safeRedirect(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  if (/^https?:\/\//i.test(text)) return text;
  return null;
}

export function pageByKey(key: SitePageKey): SitePage {
  const page = SITE_PAGES.find((entry) => entry.key === key);
  if (!page) throw new Error(`unknown site page: ${key}`);
  return page;
}

/** The href a nav item carries for a page, with the home page as `/`. */
export function hrefOfPage(page: SitePage): string {
  return page.path === '' ? '/' : page.path;
}
