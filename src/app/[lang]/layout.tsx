import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import "../globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { siteConfig, siteTheme } from "@/config/site";
import { getLocalizedHref } from "@/lib/locale";
import { langStaticParams, normalizeLang } from "@/lib/route-lang";
import { getBranchList, getBrandWords, getClinicWords, getNavList, getSiteMeta, getSpecialistList } from "@/lib/content/site";
import { hiddenPageHrefs, readPageStates } from "@/lib/content/page-visibility";
import { getSeoConfig } from "@/lib/content/seo-config";
import { readCopy } from "@/lib/copy/store";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { ClinicProvider } from "@/context/ClinicContext";
import { TrackingTags } from "@/components/tracking/TrackingTags";
import { ConsentBanner } from "@/components/tracking/ConsentBanner";
import { planIsEmpty } from "@/lib/tracking/providers";
import { getTrackingPlan } from "@/lib/tracking/server";
import { LoadingSplash } from "@/components/ui/LoadingSplash";
import { EmptyState } from "@/components/ui/EmptyState";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: siteConfig.brand.themeColor,
};

/** Only `/ar…` and `/en…` are served; everything else is a 404. */
export async function generateStaticParams() {
  return langStaticParams();
}

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: segment } = await props.params;
  const lang = normalizeLang(segment);
  if (!lang) return {};
  const home = getLocalizedHref("", lang);
  const meta = await getSiteMeta(lang);
  const brand = await getBrandWords();
  const seo = await getSeoConfig();
  const codes = seo.verification;
  // Bing, Pinterest and Facebook have no key of their own in Next's `verification`; they are
  // the named `<meta>` tags each one documents.
  const otherTags: Record<string, string> = {
    ...(codes.bing ? { "msvalidate.01": codes.bing } : {}),
    ...(codes.pinterest ? { "p:domain_verify": codes.pinterest } : {}),
    ...(codes.facebook ? { "facebook-domain-verification": codes.facebook } : {}),
    ...(seo.facebookAppId ? { "fb:app_id": seo.facebookAppId } : {}),
  };
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: meta.title,
      template: lang === "ar" ? siteConfig.metadata.titleTemplate : siteConfig.metadata.titleTemplateEn,
    },
    description: meta.description,
    verification: {
      ...(codes.google || meta.verification ? { google: codes.google || meta.verification || "" } : {}),
      ...(codes.yandex ? { yandex: codes.yandex } : {}),
      ...(Object.keys(otherTags).length ? { other: otherTags } : {}),
    },
    keywords: [...siteConfig.metadata.keywords],
    authors: [{ name: brand[lang] }],
    robots: {
      index: seo.indexing,
      follow: true,
      googleBot: { index: seo.indexing, follow: true, "max-image-preview": "large" },
    },
    icons: {
      icon: siteConfig.brand.logo,
      apple: siteConfig.brand.logo,
    },
    alternates: {
      canonical: `${SITE_URL}${home}`,
      languages: {
        ar: `${SITE_URL}${getLocalizedHref("", "ar")}`,
        en: `${SITE_URL}${getLocalizedHref("", "en")}`,
        "x-default": `${SITE_URL}${getLocalizedHref("", "ar")}`,
      },
    },
    openGraph: {
      title: lang === "ar" ? siteConfig.metadata.openGraphTitle : siteConfig.metadata.openGraphTitleEn,
      description:
        lang === "ar" ? siteConfig.metadata.openGraphDescription : siteConfig.metadata.openGraphDescriptionEn,
      url: `${SITE_URL}${home}`,
      siteName: brand[lang],
      locale: lang === "ar" ? siteConfig.metadata.locale : "en_US",
      alternateLocale: [lang === "ar" ? siteConfig.metadata.alternateLocale : "ar_EG"],
      type: "website",
    },
  };
}

async function SiteExperience({
  children,
  lang,
}: Readonly<{
  children: React.ReactNode;
  lang: "ar" | "en";
}>) {
  try {
    await db.selectFrom("app_migrations").select("name").limit(1).executeTakeFirst();
  } catch (error) {
    console.error("[site] CMS database unavailable; public content is suppressed", error);
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <EmptyState
          title={lang === "ar" ? "المحتوى غير متاح حاليًا" : "Content is unavailable right now"}
          description={
            lang === "ar"
              ? "سيظهر محتوى الموقع عند الاتصال بنظام إدارة المحتوى."
              : "Site content will appear when the content management system is connected."
          }
        />
      </main>
    );
  }

  const [treatments, branches, pages, nav, specialists, clinic, tracking, copyValues] = await Promise.all([
    getMergedTreatments(),
    getBranchList(),
    readPageStates(),
    getNavList(),
    getSpecialistList(),
    getClinicWords(),
    getTrackingPlan(),
    readCopy(lang),
  ]);
  const hasTracking = !planIsEmpty(tracking);

  return (
    <ClinicProvider value={clinic}>
      <JsonLd data={await Promise.all([organizationJsonLd(), webSiteJsonLd()])} />
      <TrackingTags plan={tracking} />
      <ConsentBanner lang={lang} hasTags={hasTracking} />
      <SiteShell
        branches={branches}
        treatments={treatments}
        nav={nav}
        specialists={specialists}
        hiddenPaths={hiddenPageHrefs(pages)}
        cookieSettings={hasTracking}
        copy={{ locale: lang, values: copyValues }}
      >
        {children}
      </SiteShell>
    </ClinicProvider>
  );
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang: segment } = await params;
  const lang = normalizeLang(segment);
  if (!lang) notFound();

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
        <Suspense fallback={<LoadingSplash />}>
          <SiteExperience lang={lang}>{children}</SiteExperience>
        </Suspense>
      </body>
    </html>
  );
}
