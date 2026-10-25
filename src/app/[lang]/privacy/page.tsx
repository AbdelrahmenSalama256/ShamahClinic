import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { PrivacyClient } from "@/components/pages/PrivacyClient";
import { getPageTitle } from "@/lib/content/site";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/privacy",
    ...SITE_SEO["/privacy"],
  });
}

export default async function PrivacyPage() {
  await guardPage('privacy');
  const title = await getPageTitle("privacy-policy", {
    ar: "سياسة الخصوصية",
    en: "Privacy Policy",
  });
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "سياسة الخصوصية", en: "Privacy" }, path: "/privacy" },
        ])}
      />
      <PrivacyClient title={title} />
    </>
  );
}
