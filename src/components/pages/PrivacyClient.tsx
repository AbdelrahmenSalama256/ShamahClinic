"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { clinicData } from "@/data/clinic";

interface PolicyBlock {
  heading: { ar: string; en: string };
  body: { ar: string; en: string }[];
}

const policy: PolicyBlock[] = [
  {
    heading: { ar: "نطاق هذه السياسة", en: "Scope of this policy" },
    body: [
      {
        ar: "توضح هذه السياسة كيف يتعامل موقع عيادات شامه مع معلومات زائراته. الموقع تعريفي في الأساس، وهدفه تقديم معلومات عن خدماتنا وفروعنا وطرق التواصل والحجز.",
        en: "This policy explains how the Shamah Clinics website handles visitor information. The site is primarily informational, presenting our services, branches and how to contact and book.",
      },
    ],
  },
  {
    heading: { ar: "البيانات التي نتعامل معها", en: "Data we handle" },
    body: [
      {
        ar: "نماذج الحجز والاستفسار داخل الموقع تُستخدم للعرض وتوجيه طلبكِ فقط؛ فعند الضغط على الإرسال أو التأكيد يتم فتح محادثة واتساب أو اتصال هاتفي بالبيانات التي أدخلتِها، ولا يخزّن الموقع هذه البيانات على خادم خاص به.",
        en: "On-site booking and enquiry forms are used for display and to route your request only; when you submit or confirm, a WhatsApp chat or phone call opens with the details you entered, and the site does not store this data on its own server.",
      },
      {
        ar: "يحفظ متصفحك تفضيل اللغة (العربية أو الإنجليزية) محلياً على جهازك فقط لتظهر لكِ الواجهة بلغتكِ في الزيارات التالية، ولا تُرسل هذه المعلومة إلينا.",
        en: "Your browser stores your language preference (Arabic or English) locally on your device only, so the interface appears in your language on future visits; this is not sent to us.",
      },
    ],
  },
  {
    heading: { ar: "أطراف خارجية", en: "Third parties" },
    body: [
      {
        ar: "عند التواصل عبر واتساب أو الاتصال الهاتفي، تنتقل المحادثة إلى منصة مملوكة لطرف ثالث (واتساب) أو إلى شبكة الاتصالات، وتخضع لشروط الخصوصية الخاصة بها. روابط التواصل الاجتماعي تأخذك أيضاً إلى صفحاتنا على منصات خارجية لها سياساتها المستقلة.",
        en: "When you contact us via WhatsApp or phone, the conversation moves to a third-party platform (WhatsApp) or the telephone network, subject to their own privacy terms. Social links also take you to our pages on external platforms with independent policies.",
      },
    ],
  },
  {
    heading: { ar: "الصور والمحتوى الطبي", en: "Images and medical content" },
    body: [
      {
        ar: "المحتوى المنشور على الموقع للتوعية العامة ولا يُعد تشخيصاً أو وصفة علاجية. أي قرار علاجي يتم بعد استشارة طبية مباشرة. الصور المعروضة تمثيلية ما لم يُذكر خلاف ذلك، ولا نستخدم صور عميلات دون موافقتهن الموثّقة.",
        en: "Content published on the site is for general awareness and is not a diagnosis or prescription. Any treatment decision follows a direct medical consultation. Images shown are representative unless stated otherwise, and we do not use client photos without documented consent.",
      },
    ],
  },
  {
    heading: { ar: "حقوقكِ والتواصل", en: "Your rights & contact" },
    body: [
      {
        ar: "لأي استفسار عن الخصوصية أو لطلب عدم التواصل معكِ، يمكنكِ مراسلتنا عبر القنوات المعلنة، وسنتعامل مع طلبكِ بسرية تامة.",
        en: "For any privacy enquiry or to ask us not to contact you, reach us through the published channels and we will handle your request in full confidence.",
      },
    ],
  },
];

export const PrivacyClient: React.FC = () => {
  const { t, language } = useLanguage();

  return (
    <>
      <PageHero
        title={{ ar: "سياسة الخصوصية", en: "Privacy Policy" }}
        lead={{
          ar: "نحترم خصوصيتكِ. هذه الصفحة توضح ببساطة كيف يتعامل موقعنا مع معلوماتكِ.",
          en: "We respect your privacy. This page explains simply how our site handles your information.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/privacy", label: { ar: "سياسة الخصوصية", en: "Privacy" } },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-xs text-[var(--text-muted)] mb-10">
            {t("آخر تحديث: ٢٩ سبتمبر ٢٠٢٦", "Last updated: 29 September 2026")}
          </p>

          <div className="space-y-10">
            {policy.map((block, i) => (
              <Reveal className="h-full" key={i}>
                <h2 className="text-xl font-black text-[var(--text-primary)] mb-3">{t(block.heading.ar, block.heading.en)}</h2>
                {block.body.map((p, j) => (
                  <p key={j} className="text-base leading-[1.9] text-[var(--text-secondary)] mb-3 last:mb-0" lang={language}>
                    {t(p.ar, p.en)}
                  </p>
                ))}
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/40 p-6">
            <h2 className="text-lg font-black text-[var(--text-primary)] mb-2">{t("للتواصل بشأن الخصوصية", "Privacy contact")}</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t("عيادات شامه — ", "Shamah Clinics — ")}
              <a href={`mailto:${clinicData.email}`} className="text-[var(--gold-end)] hover:underline">{clinicData.email}</a>
              {" • "}
              <a href={`tel:${clinicData.phone.replace(/\s/g, "")}`} dir="ltr" className="text-[var(--gold-end)] hover:underline">{clinicData.phone}</a>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
};
