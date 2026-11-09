import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "../../app/globals.css";
import { NotFoundClient } from "@/components/pages/NotFoundClient";
import { SiteShell } from "@/components/layout/SiteShell";
import { siteConfig, siteTheme } from "@/config/site";
import { normalizeLang } from "@/lib/route-lang";
import { getBranchList, getNavList, getSpecialistList } from "@/lib/content/site";
import { hiddenPageHrefs, readPageStates } from "@/lib/content/page-visibility";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { recordNotFound } from "@/lib/content/not-found-log";
import { NotFoundBeacon } from "@/components/pages/NotFoundBeacon";

/**
 * The whole 404 document, shared by `src/app/global-not-found.tsx` (URLs that match
 * no route) and `src/app/not-found.tsx` (a page that calls `notFound()`), because
 * neither render goes through `src/app/[lang]/layout.tsx`. Fonts, `globals.css` and
 * the theme map therefore have to be applied here instead of being inherited.
 *
 * The language cannot come from the path — these renders happen at routing level,
 * below the `[lang]` segment — so `src/proxy.ts` stamps the resolved prefix on the
 * request and it is read back here. Arabic answers when nothing says otherwise.
 */
export async function notFoundLang(): Promise<"ar" | "en"> {
  return normalizeLang((await headers()).get("x-shamah-lang")) ?? "ar";
}

export const notFoundViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: siteConfig.brand.themeColor,
};

export async function notFoundMetadata(): Promise<Metadata> {
  const lang = await notFoundLang();
  return {
    title:
      lang === "ar"
        ? "الصفحة غير موجودة | عيادات شامه"
        : "Page not found | Shamah Clinics",
    description:
      lang === "ar"
        ? "الرابط الذي فتحتيه غير موجود. كل خدماتنا ومقالاتنا وفروعنا ما زالت في مكانها."
        : "That link does not exist. Our services, articles and branches are all still where you left them.",
    robots: { index: false, follow: false },
  };
}

/**
 * The 404 monitor records a miss in one of two ways, because the two renders differ:
 *
 * - `global` (no route matched) renders only for a real miss, so it records on the
 *   server — a crawler that runs no JavaScript, which is most of what finds an old
 *   WordPress address, is counted too.
 * - `boundary` (a page called `notFound()`) is rendered ahead of time on *every* page,
 *   as the fallback the page might need, so recording there would log every visit. Its
 *   beacon is a client effect, which only runs when the fallback is actually shown.
 */
export default async function NotFoundDocument({ source = "boundary" }: { source?: "global" | "boundary" } = {}) {
  const lang = await notFoundLang();
  if (source === "global") {
    const asked = await headers();
    const missed = asked.get("x-shamah-path");
    if (missed) await recordNotFound(missed, asked.get("referer"));
  }
  const [treatments, branches, pages, nav, specialists] = await Promise.all([
    getMergedTreatments(),
    getBranchList(),
    readPageStates(),
    getNavList(),
    getSpecialistList(),
  ]);

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      data-surface="site"
      data-scroll-behavior="smooth"
      className="h-full scroll-smooth"
      style={siteTheme.light as React.CSSProperties}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <SiteShell branches={branches} treatments={treatments} nav={nav} specialists={specialists} hiddenPaths={hiddenPageHrefs(pages)}>
          <NotFoundClient />
          {source === "boundary" && <NotFoundBeacon />}
        </SiteShell>
      </body>
    </html>
  );
}
