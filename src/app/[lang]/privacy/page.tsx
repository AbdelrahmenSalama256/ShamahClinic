import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { PrivacyClient } from "@/components/pages/PrivacyClient";
import { getPageTitle } from "@/lib/content/site";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/privacy",
    title: { ar: "سياسة الخصوصية", en: "Privacy Policy" },
    description: {
      ar: "كيف يتعامل موقع عيادات شامه مع معلومات الزائرات: نماذج الحجز والاستفسار، تفضيل اللغة المحفوظ محلياً، وقنوات التواصل الخارجية. سياسة واضحة ومختصرة بدون تعقيد قانوني.",
      en: "How the Shamah Clinics website handles visitor information: booking and enquiry forms, the locally stored language preference, and external contact channels. Clear and concise.",
    },
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
