import type { Metadata, Viewport } from "next";
import { Alexandria, Montserrat } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

const alexandria = Alexandria({
  subsets: ["arabic"],
  weight: "variable",
  variable: "--font-alexandria",
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
  themeColor: "#C9A227",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "عيادات شامه | Shamah Clinics — طب التجميل والليزر والعناية بالبشرة",
    template: "%s | عيادات شامه",
  },
  description:
    "عيادات شامه لطب التجميل والليزر والعناية الفائقة بالبشرة بالقاهرة والجيزة. فروعنا في مدينة نصر، التجمع الخامس، والشيخ زايد. أحدث أجهزة الليزر وحقن الفيلر والبوتوكس بإشراف طبي نسائي متكامل.",
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
  authors: [{ name: "Shamah Clinics" }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: "/images/logo.png",
    apple: "/images/logo.png",
  },
  openGraph: {
    title: "عيادات شامه | Shamah Clinics",
    description:
      "عيادات شامه لطب التجميل والليزر والعناية بالبشرة في مصر. ثلاثة فروع بالقاهرة والجيزة.",
    url: SITE_URL,
    siteName: "Shamah Clinics",
    locale: "ar_EG",
    alternateLocale: ["en_US"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${alexandria.variable} ${montserrat.variable} h-full scroll-smooth`}
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
