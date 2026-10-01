import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { PrivacyClient } from "@/components/pages/PrivacyClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/privacy",
  title: { ar: "سياسة الخصوصية", en: "Privacy Policy" },
  description: {
    ar: "كيف يتعامل موقع عيادات شامه مع معلومات الزائرات: نماذج الحجز والاستفسار، تفضيل اللغة المحفوظ محلياً، وقنوات التواصل الخارجية. سياسة واضحة ومختصرة بدون تعقيد قانوني.",
    en: "How the Shamah Clinics website handles visitor information: booking and enquiry forms, the locally stored language preference, and external contact channels. Clear and concise.",
  },
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "سياسة الخصوصية", path: "/privacy" },
        ])}
      />
      <PrivacyClient />
    </>
  );
}
