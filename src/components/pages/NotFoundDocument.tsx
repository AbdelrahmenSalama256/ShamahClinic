import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "../../app/globals.css";
import { montserrat, readexPro } from "@/lib/fonts";
import { NotFoundClient } from "@/components/pages/NotFoundClient";
import { SiteShell } from "@/components/layout/SiteShell";
import { siteConfig, siteTheme } from "@/config/site";
import { normalizeLang } from "@/lib/route-lang";
import { getBranchList } from "@/lib/wp";
import { getMergedTreatments } from "@/lib/wp/treatments";

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

export default async function NotFoundDocument() {
  const lang = await notFoundLang();
  const [treatments, branches] = await Promise.all([
    getMergedTreatments(),
    getBranchList(),
  ]);

  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      data-scroll-behavior="smooth"
      className={`${readexPro.variable} ${montserrat.variable} h-full scroll-smooth`}
      style={siteTheme.light as React.CSSProperties}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <SiteShell branches={branches} treatments={treatments}>
          <NotFoundClient />
        </SiteShell>
      </body>
    </html>
  );
}
