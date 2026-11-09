/**
 * The clinic's brand profile: the logo, the social accounts, the opening WhatsApp message
 * and the trust details the footer shows. One document in `settings` (group `brand`, key
 * `profile`), edited in the Settings screen's "Brand & social" section.
 *
 * Pure, so the console form validates with the same rule the server stores by, and the
 * client components that render the footer can take it through `ClinicContext`.
 */
import { siteConfig } from '@/config/site';

export const BRAND_GROUP = 'brand';
export const BRAND_KEY = 'profile';

export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'snapchat', 'linkedin', 'threads'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  snapchat: 'Snapchat',
  linkedin: 'LinkedIn',
  threads: 'Threads',
};

export interface SocialLink {
  id: SocialNetwork;
  href: string;
  label: string;
}

export interface BrandProfile {
  /** A rooted upload path; empty means the logo shipped with the site. */
  logo: string;
  socials: SocialLink[];
  /** The Google Maps link to the clinic, for structured data and the "reviews" button. */
  mapsUrl: string;
  /** السجل التجاري — shown in the footer when filled. */
  commercialReg: string;
  taxId: string;
  /** A picture of the accepted payment methods (cards, wallets, installments). */
  paymentImage: string;
  /** The first message a WhatsApp button opens with, per language. */
  whatsappMessage: { ar: string; en: string };
}

export const DEFAULT_WHATSAPP_MESSAGE = {
  ar: 'مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات المتاحة لديكم.',
  en: 'Hello Shamah Clinics, I would like to inquire about appointments and services.',
};

export const BRAND_DEFAULTS: BrandProfile = {
  logo: '',
  socials: siteConfig.socialLinks.map((link) => ({ id: link.id as SocialNetwork, href: link.href, label: link.label })),
  mapsUrl: '',
  commercialReg: '',
  taxId: '',
  paymentImage: '',
  whatsappMessage: { ...DEFAULT_WHATSAPP_MESSAGE },
};

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function httpUrl(value: unknown): string {
  const raw = text(value, 500);
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    return new URL(raw).toString();
  } catch {
    return '';
  }
}

/** A rooted path on this site only: brand pictures come from the media library. */
function localImage(value: unknown): string {
  const raw = text(value, 500);
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '';
}

/**
 * Any stored value as a complete profile. A document that never saved its socials keeps
 * the two accounts the site shipped with; one that saved an empty list means "none".
 */
export function normalizeBrand(value: unknown): BrandProfile {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const message = raw.whatsappMessage && typeof raw.whatsappMessage === 'object' ? (raw.whatsappMessage as Record<string, unknown>) : {};
  const socials = Array.isArray(raw.socials)
    ? raw.socials.flatMap((entry): SocialLink[] => {
        if (!entry || typeof entry !== 'object') return [];
        const { id, href } = entry as Record<string, unknown>;
        const network = SOCIAL_NETWORKS.find((candidate) => candidate === id);
        const url = httpUrl(href);
        return network && url ? [{ id: network, href: url, label: SOCIAL_LABELS[network] }] : [];
      })
    : BRAND_DEFAULTS.socials;
  return {
    logo: localImage(raw.logo),
    socials: socials.filter((link, index) => socials.findIndex((other) => other.id === link.id) === index),
    mapsUrl: httpUrl(raw.mapsUrl),
    commercialReg: text(raw.commercialReg, 60),
    taxId: text(raw.taxId, 60),
    paymentImage: localImage(raw.paymentImage),
    whatsappMessage: {
      ar: text(message.ar, 500) || DEFAULT_WHATSAPP_MESSAGE.ar,
      en: text(message.en, 500) || DEFAULT_WHATSAPP_MESSAGE.en,
    },
  };
}
