import type { Lang } from "./types";

/** Root of the English WordPress install. Arabic is the same host under `/ar`. */
export const WP_ORIGIN = (process.env.WP_BASE_URL || "https://www.shamahclinics.com")
  .replace(/\/+$/, "");

/** REST base per language: EN at root, AR at the `/ar` subsite (TranslatePress). */
export function restBase(lang: Lang): string {
  return lang === "ar" ? `${WP_ORIGIN}/ar/wp-json` : `${WP_ORIGIN}/wp-json`;
}

/** Public site origin per language (used to build canonical + hreflang). */
export function siteOrigin(lang: Lang): string {
  return lang === "ar" ? `${WP_ORIGIN}/ar` : `${WP_ORIGIN}`;
}

export const REVALIDATE = 300;

/** Taxonomy/media reads refresh less often than content so a page render waits on fewer WordPress round trips. */
export const TAXONOMY_REVALIDATE = Number(process.env.WP_TAXONOMY_REVALIDATE || 3600);
export const DEFAULT_PER_PAGE = 9;
export const MAX_PER_PAGE = 30;

/**
 * Hard ceiling for a single live WordPress request, including its one retry.
 * On a slow or stalling origin we abort and serve the committed snapshot instead —
 * a page render must never wait on the client's production host.
 */
export const WP_FETCH_TIMEOUT_MS = Number(process.env.WP_FETCH_TIMEOUT_MS || 8000);

/** Global ceiling on concurrent live WordPress requests (protects the origin). */
export const WP_MAX_INFLIGHT = Number(process.env.WP_MAX_INFLIGHT || 3);

/** Set by Next while prerendering: the build must make zero WordPress requests. */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** One-shot log so the served source (live vs snapshot) is observable. */
const logged = new Set<string>();
export function logSource(kind: string, lang: string, source: "live" | "snapshot", detail?: string) {
  const key = `${kind}:${lang}:${source}:${detail || ""}`;
  if (logged.has(key)) return;
  if (logged.size > 200) logged.clear();
  logged.add(key);
  console.log(`[wp] ${source.padEnd(8)} ${lang} ${kind}${detail ? ` (${detail})` : ""}`);
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
