import type { Lang } from "./types";

/**
 * The WordPress host the frozen snapshot was taken from. BK-7.3 removed the last
 * runtime read of it: this is only ever used to *rewrite* URLs already in the
 * snapshot (`mirror.ts` maps them onto `public/wp/*`, `sanitize.ts` recognises
 * them), never to fetch from it.
 */
export const WP_ORIGIN = (process.env.WP_BASE_URL || "https://www.shamahclinics.com")
  .replace(/\/+$/, "");

export const DEFAULT_PER_PAGE = 9;
export const MAX_PER_PAGE = 30;

/** One-shot log of what each kind served, so a stale snapshot is visible in the server output. */
const logged = new Set<string>();
export function logSource(kind: string, lang: Lang, detail?: string) {
  const key = `${kind}:${lang}:${detail || ""}`;
  if (logged.has(key)) return;
  if (logged.size > 200) logged.clear();
  logged.add(key);
  console.log(`[wp] snapshot ${lang} ${kind}${detail ? ` (${detail})` : ""}`);
}

/** Known WordPress page ids (stable across both subsites). */
export const PAGE_IDS = {
  home: 622,
  services: 696,
  about: 32,
  contact: 67,
  booking: 837,
  journal: 62,
  shop: 9,
  faq: 169,
  privacy: 3,
} as const;

/** Contact Form 7 form on the booking page (id 837). */
export const CF7_FORM_ID = Number(process.env.CF7_FORM_ID || 568);
export const CF7_FIELDS = {
  name: "text-1",
  phone: "tel-1",
  date: "date-1",
  subject: "text-3",
  message: "textarea-1",
} as const;

export const LEAD_MODE = (process.env.LEAD_MODE || "whatsapp") as "whatsapp" | "cf7";

export const WHATSAPP = "201121880908";
