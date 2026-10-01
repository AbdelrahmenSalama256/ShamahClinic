"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { WhatsAppButton, CallButton } from "@/components/shared/Actions";
import { faqData, type FaqItem } from "@/data/faq";

const categoryOrder: FaqItem["category"][] = ["laser", "injectables", "skincare", "general"];

const categoryLabels: Record<FaqItem["category"], { ar: string; en: string }> = {
  laser: { ar: "الليزر وإزالة الشعر", en: "Laser & hair removal" },
  injectables: { ar: "الفيلر والبوتوكس", en: "Fillers & Botox" },
  skincare: { ar: "العناية بالبشرة", en: "Skincare" },
  general: { ar: "الحجز والعيادات", en: "Booking & clinics" },
};

export const FaqClient: React.FC = () => {
  const { t } = useLanguage();

  const grouped = categoryOrder
    .map((cat) => ({ cat, items: faqData.filter((f) => f.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHero
        title={{ ar: "الأسئلة الشائعة", en: "Frequently asked questions" }}
        lead={{
          ar: "إجابات مباشرة على أكثر ما تسأل عنه العميلات قبل الحجز. لم تجدي سؤالك؟ راسلينا على واتساب وسنرد خلال دقائق.",
          en: "Direct answers to what clients ask most before booking. Can't find your question? Message us on WhatsApp and we reply within minutes.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/faq", label: { ar: "الأسئلة الشائعة", en: "FAQ" } },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-14">
            {grouped.map((g, gi) => (
              <Reveal className="h-full" key={g.cat} delay={gi * 0.05}>
                <h2 className="text-xl sm:text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                  {t(categoryLabels[g.cat].ar, categoryLabels[g.cat].en)}
                </h2>
                <FaqAccordion items={g.items} />
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-16 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/40 p-8 text-center">
            <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">
              {t("ما زال لديكِ سؤال؟", "Still have a question?")}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-lg mx-auto">
              {t(
                "فريقنا متاح يومياً من ١٠ صباحاً حتى ١٠ مساءً للرد على استفساراتك ومساعدتك في اختيار الجلسة المناسبة.",
                "Our team is available daily from 10am to 10pm to answer your questions and help you choose the right session."
              )}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <WhatsAppButton size="lg" />
              <CallButton size="md" />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
};
