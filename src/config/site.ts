/**
 * The single source of the site's absolute URL. Canonical, og:url, og:image,
 * sitemap, robots `host`/`sitemap`, JSON-LD ids and every hreflang are derived
 * from it (via `SITE_URL` in `lib/site.ts`), so it must never silently default to
 * the WordPress import domain — that would publish the CMS host as our canonical.
 * A production build or `next start` with the variable missing fails with a clear
 * message; only `next dev` falls back to localhost so a fresh clone still runs.
 */
function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. It is the single source of the site's " +
        "absolute URL (canonical, og:url, sitemap, robots, JSON-LD, hreflang). " +
        "Set it in .env.local and in the application's environment before it is " +
        "built or started for production — it must point at the deployed site, " +
        "not the WordPress import origin.",
    );
  }
  return "http://localhost:3000";
}

export const siteConfig = {
  defaultLanguage: "ar" as "ar" | "en",
  enableDarkmoodOption: true,
  siteUrl: resolveSiteUrl(),
  brand: {
    name: {
      ar: "عيادات شامه",
      en: "Shamah Clinics",
    },
    logo: "/images/logo.png",
    themeColor: "#C9A227",
  },
  contact: {
    phone: "+20 112 188 0908",
    whatsapp: "+201121880908",
    email: "info@shamahclinics.com",
    workingHours: {
      ar: "يومياً من ١٠:٠٠ ص إلى ١٠:٠٠ م",
      en: "Daily 10:00 AM – 10:00 PM",
    },
  },
  metadata: {
    title: "عيادات شامه | Shamah Clinics — طب التجميل والليزر والعناية بالبشرة",
    titleTemplate: "%s | عيادات شامه",
    titleEn: "Shamah Clinics — Aesthetic Medicine, Laser & Skincare in Cairo",
    titleTemplateEn: "%s | Shamah Clinics",
    description:
      "عيادات شامه لطب التجميل والليزر والعناية الفائقة بالبشرة بالقاهرة والجيزة. فروعنا في مدينة نصر، التجمع الخامس، والشيخ زايد. أحدث أجهزة الليزر وحقن الفيلر والبوتوكس بإشراف طبي نسائي متكامل.",
    descriptionEn:
      "Shamah Clinics for aesthetic medicine, laser and advanced skincare in Cairo and Giza. Branches in Nasr City, Fifth Settlement and Sheikh Zayed. Latest laser technology, fillers and Botox under full female medical supervision.",
    keywords: [
      "عيادات شامه",
      "ليزر إزالة الشعر",
      "تجميل القاهرة",
      "فيلر وبوتوكس",
      "هيدرافيشل",
      "مدينة نصر",
      "التجمع الخامس",
      "الشيخ زايد",
      "Shamah Clinics",
    ],
    openGraphTitle: "عيادات شامه | Shamah Clinics",
    openGraphDescription:
      "عيادات شامه لطب التجميل والليزر والعناية بالبشرة في مصر. ثلاثة فروع بالقاهرة والجيزة.",
    openGraphTitleEn: "Shamah Clinics | Aesthetic & Laser Clinics",
    openGraphDescriptionEn:
      "Shamah Clinics for aesthetic medicine, laser and skincare in Egypt. Three branches in Cairo and Giza.",
    locale: "ar_EG",
    alternateLocale: "en_US",
  },
  /**
   * The handles the clinic's own Rank Math `sameAs` array publishes on the live
   * homepage (`https://www.shamahclinics.com/#organization`). Nothing else goes
   * here: a profile the dashboard does not name is a link we would be inventing,
   * which is why there is no YouTube row even though the footer has room for one.
   */
  socialLinks: [
    {
      id: "facebook",
      href: "https://www.facebook.com/p/Shamah-Clinic-61572435507530/",
      label: "Facebook",
    },
    {
      id: "instagram",
      href: "https://www.instagram.com/shamahclinic",
      label: "Instagram",
    },
  ],
} as const;

export const siteTheme = {
  light: {
    "--bg-primary": "#faf7f2",
    "--bg-secondary": "#f4ece4",
    "--bg-card": "#fffcf8",
    "--bg-card-subtle": "#fdfbf8",
    // The two steps a surface takes — a cursor on it, and the row that is open — as
    // translucent washes, so each composites on whichever card it lands on rather than
    // replacing it with a fixed hex. The dark stops are the same two washes lifted.
    "--bg-hover": "rgba(33, 26, 22, 0.045)",
    "--bg-active": "rgba(33, 26, 22, 0.09)",
    "--bg-dark": "#191412",
    "--bg-dark-card": "#241d1a",
    "--text-primary": "#211a16",
    "--text-secondary": "#6b5e57",
    "--text-muted": "#6e675c",
    "--text-inverse": "#faf7f2",
    "--text-gold": "#85640f",
    "--gold-start": "#d8b237",
    "--gold-mid": "#c9a227",
    "--gold-end": "#85640f",
    "--gold-glow": "rgba(201, 162, 39, 0.25)",
    "--gold-border": "rgba(133, 100, 15, 0.8)",
    // Narrowed so the label stays readable on every stop, shine sweep included.
    "--gold-gradient":
      "linear-gradient(120deg, #c9a227 0%, #e8c766 20%, #f5e6a8 35%, #e8c766 50%, #c9a227 65%, #b08d24 85%, #a8801f 100%)",
    "--blush-light": "#fbf0eb",
    "--blush-accent": "#e8b4b8",
    "--rose-gold": "#c88d83",
    "--btn-gold-fg": "#17120f",
    "--btn-gold-fg-hover": "#17120f",
    "--btn-wa-solid-bg": "#0a6636",
    "--btn-wa-solid-fg": "#ffffff",
    "--btn-wa-solid-bg-hover": "#075e2f",
    "--btn-wa-solid-fg-hover": "#ffffff",
    "--btn-wa-outline-bg": "transparent",
    "--btn-wa-outline-fg": "#0a6636",
    "--btn-wa-outline-border": "#0a6636",
    "--btn-wa-outline-bg-hover": "#0a6636",
    "--btn-wa-outline-fg-hover": "#ffffff",
    "--btn-wa-on-dark-bg": "transparent",
    "--btn-wa-on-dark-fg": "#3ddc84",
    "--btn-wa-on-dark-border": "rgba(61, 220, 132, 0.65)",
    "--btn-wa-on-dark-bg-hover": "rgba(61, 220, 132, 0.16)",
    "--btn-wa-on-dark-fg-hover": "#6ee7a8",
    "--border-control": "#9c7619",
    "--border-control-soft": "rgba(133, 100, 15, 0.55)",
    "--focus-ring": "#85640f",
    "--text-success": "#0a6636",
    "--bg-success-soft": "#e6f2ea",
    "--border-success": "#0a6636",
    "--text-danger": "#b3261e",
    "--bg-danger-soft": "#fbeaea",
    "--border-danger": "#b3261e",
    "--text-success-on-dark": "#3ddc84",
    "--text-danger-on-dark": "#f2a0a0",
    "--focus-ring-offset-surface": "#faf7f2",
    "--text-on-dark": "#ffffff",
    "--text-on-dark-muted": "#d9d2ca",
    "--border-on-dark": "rgba(255, 255, 255, 0.45)",
    "--nav-surface": "rgba(250, 247, 242, 0.94)",
    "--nav-surface-scrolled": "rgba(250, 247, 242, 0.97)",
    "--nav-shadow": "rgba(33, 26, 22, 0.08)",
  },
  dark: {
    "--bg-primary": "#171513",
    "--bg-secondary": "#24211e",
    "--bg-card": "#211e1b",
    "--bg-card-subtle": "#292522",
    // Lifted rather than darkened: on charcoal the only way a hovered row reads as a change
    // is a lighter wash, and the same 4.5% of cream ink is 7% at this depth. The selected
    // row needs its own step because `--bg-secondary` sits 3 units above `--bg-card` here —
    // measured in the built app, and less than the hover, which puts the ladder backwards.
    "--bg-hover": "rgba(245, 238, 230, 0.07)",
    "--bg-active": "rgba(245, 238, 230, 0.13)",
    "--bg-dark": "#100f0e",
    "--bg-dark-card": "#1b1917",
    "--text-primary": "#f5eee6",
    "--text-secondary": "#c9bdb1",
    "--text-muted": "#b8aa9a",
    "--text-inverse": "#211a16",
    "--text-gold": "#e1c15b",
    "--gold-start": "#e0bf58",
    "--gold-mid": "#d5b446",
    "--gold-end": "#c9a441",
    "--gold-glow": "rgba(213, 180, 70, 0.2)",
    "--gold-border": "rgba(213, 180, 70, 0.6)",
    // Same range lifted: charcoal on the old #44330f tail was 1.4:1.
    "--gold-gradient":
      "linear-gradient(120deg, #a4832a 0%, #c29e3c 20%, #e1c15b 35%, #c29e3c 50%, #a4832a 65%, #b5902f 85%, #c9a441 100%)",
    "--blush-light": "#332720",
    "--blush-accent": "#805c61",
    "--rose-gold": "#d19b8e",
    "--btn-gold-fg": "#17120f",
    "--btn-gold-fg-hover": "#17120f",
    "--btn-wa-solid-bg": "#0e8246",
    "--btn-wa-solid-fg": "#ffffff",
    "--btn-wa-solid-bg-hover": "#0a6636",
    "--btn-wa-solid-fg-hover": "#ffffff",
    // The outline variant inverts with the theme: bright green, not bottle green.
    "--btn-wa-outline-bg": "transparent",
    "--btn-wa-outline-fg": "#3ddc84",
    "--btn-wa-outline-border": "rgba(61, 220, 132, 0.65)",
    "--btn-wa-outline-bg-hover": "#0a6636",
    "--btn-wa-outline-fg-hover": "#ffffff",
    "--btn-wa-on-dark-bg": "transparent",
    "--btn-wa-on-dark-fg": "#3ddc84",
    "--btn-wa-on-dark-border": "rgba(61, 220, 132, 0.65)",
    "--btn-wa-on-dark-bg-hover": "rgba(61, 220, 132, 0.16)",
    "--btn-wa-on-dark-fg-hover": "#6ee7a8",
    "--border-control": "#c9a441",
    "--border-control-soft": "rgba(213, 180, 70, 0.5)",
    "--focus-ring": "#e1c15b",
    "--text-success": "#3ddc84",
    "--bg-success-soft": "#173329",
    "--border-success": "#3ddc84",
    "--text-danger": "#f2a0a0",
    "--bg-danger-soft": "#3a1e1b",
    "--border-danger": "#f2a0a0",
    "--text-success-on-dark": "#3ddc84",
    "--text-danger-on-dark": "#f2a0a0",
    "--focus-ring-offset-surface": "#171513",
    "--text-on-dark": "#ffffff",
    "--text-on-dark-muted": "#d9d2ca",
    "--border-on-dark": "rgba(255, 255, 255, 0.45)",
    "--nav-surface": "rgba(23, 21, 19, 0.95)",
    "--nav-surface-scrolled": "rgba(23, 21, 19, 0.97)",
    "--nav-shadow": "rgba(0, 0, 0, 0.55)",
  },
} as const;
