import type { PhotoSlot } from "@/lib/images";

export interface Offer {
  id: string;
  /**
   * The image the card shows: `images[0]` when WooCommerce returns one, and a
   * slot with no src when the product truly has none — `Photo` then renders the
   * brand frame instead of a broken image.
   */
  image: PhotoSlot;
  /** Every image this product's store row carries, in WordPress order. */
  images: PhotoSlot[];
  badge: {
    ar: string;
    en: string;
  };
  title: {
    ar: string;
    en: string;
  };
  subtitle: {
    ar: string;
    en: string;
  };
  includes: {
    ar: string[];
    en: string[];
  };
  originalPrice: number; // minor units converted to decimals, currency below
  discountedPrice: number;
  savingsPercentage: number;
  currency?: string;
  validUntil: {
    ar: string;
    en: string;
  };
  /** Detail page path for each language (the WP slug of that store's row). */
  href: {
    ar: string;
    en: string;
  };
  popular?: boolean;
}
