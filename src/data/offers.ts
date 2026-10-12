export interface Offer {
  id: string;
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
