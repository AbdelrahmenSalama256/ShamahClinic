import type { PhotoSlot } from "@/lib/images";

export interface Offer {
  id: string;
  /**
   * The offer's public slug — the CMS row key, or the WooCommerce slug on the snapshot
   * rung. The booking carries it so a lead names the offer the patient actually clicked
   * instead of only its title, and `/api/v1/lead` can look the offer back up.
   */
  slug: string;
  /**
   * Which services this offer may be booked through, as services list-item uids.
   *
   * `null` means nobody has configured it — the state every offer imported from
   * WordPress starts in — and is deliberately not the same as `[]` ("no services") or
   * `['*']` ("all services"). `@/lib/content/offer-services.ts` is the only reader of
   * the three, and the booking modal asks it rather than testing the array itself.
   */
  services: string[] | null;
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
  /**
   * The line the card prints under the price: the offer's own end date, localised, when
   * the owner typed one — and empty when they did not, because an offer that never
   * expires has nothing to claim.
   */
  validUntil: {
    ar: string;
    en: string;
  };
  /** The raw end day (`YYYY-MM-DD`, Cairo), for the final-week countdown; null when open-ended. */
  endsOn?: string | null;
  /** Detail page path for each language (the WP slug of that store's row). */
  href: {
    ar: string;
    en: string;
  };
  popular?: boolean;
}
