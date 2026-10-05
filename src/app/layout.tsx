import type { Metadata, Viewport } from "next";
import { Readex_Pro, Montserrat } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { siteConfig, siteTheme } from "@/config/site";

const readexPro = Readex_Pro({
  subsets: ["arabic"],
  weight: "variable",
  variable: "--font-readex-pro",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: siteConfig.brand.themeColor,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteConfig.metadata.title,
    template: siteConfig.metadata.titleTemplate,
  },
  description: siteConfig.metadata.description,
  keywords: [...siteConfig.metadata.keywords],
  authors: [{ name: siteConfig.brand.name.en }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: siteConfig.brand.logo,
    apple: siteConfig.brand.logo,
  },
  openGraph: {
    title: siteConfig.metadata.openGraphTitle,
    description: siteConfig.metadata.openGraphDescription,
    url: SITE_URL,
    siteName: siteConfig.brand.name.en,
    locale: siteConfig.metadata.locale,
    alternateLocale: [siteConfig.metadata.alternateLocale],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultDirection =
    siteConfig.defaultLanguage === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={siteConfig.defaultLanguage}
      dir={defaultDirection}
      data-scroll-behavior="smooth"
      className={`${readexPro.variable} ${montserrat.variable} h-full scroll-smooth`}
      style={siteTheme.light as React.CSSProperties}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <JsonLd data={[organizationJsonLd(), webSiteJsonLd()]} />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
