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
  images: Array<{ src: string; alt: string }>;
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
  image: string | null;
  imageAlt: Bi;
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
