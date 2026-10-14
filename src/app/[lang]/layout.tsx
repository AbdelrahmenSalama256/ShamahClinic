import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { montserrat, readexPro } from "@/lib/fonts";
import "../globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { siteConfig, siteTheme } from "@/config/site";
import { getLocalizedHref } from "@/lib/locale";
import { langStaticParams, normalizeLang } from "@/lib/route-lang";
import { getBranchList } from "@/lib/wp";
import { getMergedTreatments } from "@/lib/wp/treatments";

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
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: lang === "ar" ? siteConfig.metadata.title : siteConfig.metadata.titleEn,
      template: lang === "ar" ? siteConfig.metadata.titleTemplate : siteConfig.metadata.titleTemplateEn,
    },
    description: lang === "ar" ? siteConfig.metadata.description : siteConfig.metadata.descriptionEn,
    keywords: [...siteConfig.metadata.keywords],
    authors: [{ name: siteConfig.brand.name[lang] }],
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
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
      siteName: siteConfig.brand.name[lang],
      locale: lang === "ar" ? siteConfig.metadata.locale : "en_US",
      alternateLocale: [lang === "ar" ? siteConfig.metadata.alternateLocale : "ar_EG"],
      type: "website",
    },
  };
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
        <JsonLd data={await Promise.all([organizationJsonLd(), webSiteJsonLd()])} />
        <SiteShell branches={branches} treatments={treatments}>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
