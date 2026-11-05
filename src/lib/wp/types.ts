export type Lang = "ar" | "en";
export type Bi = { ar: string; en: string };

/** Raw WordPress REST shapes we actually read. */
export interface WPRawTitle {
  rendered: string;
}
export interface WPRawEntity {
  rendered?: string;
}
export interface WPPost {
  id: number;
  slug: string;
  date: string;
  modified?: string;
  link: string;
  title: WPRawTitle;
  excerpt: WPRawEntity;
  content: WPRawEntity;
  categories?: number[];
  featured_media?: number;
}
export interface WPPage {
  id: number;
  slug: string;
  link: string;
  title: WPRawTitle;
  excerpt: WPRawEntity;
  content: WPRawEntity;
}
/** `/wp/v2/media` row, fetched in one batched `include=` call. */
export interface WPMedia {
  id: number;
  source_url: string;
  alt_text?: string;
  media_details?: { sizes?: Record<string, { source_url: string }> };
}
export interface WPTerm {
  id: number;
  name: string;
  slug: string;
  count: number;
  parent?: number;
}
export interface WCStoreProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  short_description: string;
  description: string;
  on_sale: boolean;
  /** The Store API image object, kept as WordPress prints it (id, src, thumbnail, srcset, sizes, name, alt). */
  images: Array<{ id?: number; src: string; thumbnail?: string; name?: string; alt?: string }>;
  prices: {
    price: string;
    regular_price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
}

/** Normalized, bilingual card/detail models consumed by the UI + /api/v1. */
export interface ArticleCard {
  id: number;
  slug: string;
  title: Bi;
  excerpt: Bi;
  image: string | null;
  imageAlt: Bi;
  date: string;
  /** WordPress modified timestamp — the last dashboard edit. */
  modified: string;
  category: Bi | null;
  categorySlug: string | null;
  href: Bi;
}
export interface Article extends ArticleCard {
  content: Bi;
}
export interface Offer {
  id: number;
  slug: string;
  name: Bi;
  excerpt: Bi;
  price: number;
  regularPrice: number;
  currency: string;
  onSale: boolean;
  discountPercent: number | null;
  /**
   * Every image the product's own Store API row carries, in WordPress order and
   * with nothing merged or de-duplicated. `src` already points at the local
   * mirror when `npm run sync:wp` downloaded it, and at the live wp-content URL
   * when it has not, so an upload added after the last sync still renders.
   */
  images: Array<{ src: string; alt: Bi }>;
  /** `images[0]`, or null when the product genuinely has no image. */
  image: string | null;
  imageAlt: Bi;
  /**
   * The services this offer may be booked through, as services list-item uids.
   *
   * `null` is *not configured* — nobody has answered the question — and is what every
   * row imported from WordPress starts as. It is not the same as `[]` ("no services")
   * or `['*']` ("all services"); `../content/offer-services.ts` is the interpreter and
   * a booking treats an unconfigured offer as unrestricted.
   */
  services: string[] | null;
  /** The offer's own validity window as Cairo calendar days; null on either end means no boundary. */
  validFrom: string | null;
  validUntil: string | null;
  href: Bi;
}
export interface OfferDetail extends Offer {
  html: Bi;
}
export interface ServiceCard {
  id: number;
  slug: string;
  title: Bi;
  intro: Bi;
  image: string | null;
  href: Bi;
}
export interface CategoryTerm {
  id: number;
  slug: string;
  name: Bi;
  count: number;
}
export interface PageContent {
  id: number;
  slug: string;
  title: Bi;
  html: Bi;
  href: Bi;
}
export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  ogImage: string | null;
}
export interface Paged<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}
export interface Settings {
  name: string;
  tagline: string;
  currency: string;
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
  branches: number;
}
