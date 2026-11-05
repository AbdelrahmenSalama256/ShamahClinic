"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { WhatsAppButton, CallButton } from "@/components/shared/Actions";
import { type FaqItem } from "@/data/faq";

const categoryOrder: FaqItem["category"][] = ["laser", "injectables", "skincare", "general"];

const categoryLabels: Record<FaqItem["category"], { ar: string; en: string }> = {
  laser: { ar: "الليزر وإزالة الشعر", en: "Laser & hair removal" },
  injectables: { ar: "الفيلر والبوتوكس", en: "Fillers & Botox" },
  skincare: { ar: "العناية بالبشرة", en: "Skincare" },
  general: { ar: "الحجز والعيادات", en: "Booking & clinics" },
};

/** `title` is the WordPress page 169 heading, with an authored fallback for
 *  Arabic where the TranslatePress subsite never translated it. */
export const FaqClient: React.FC<{
  title: { ar: string; en: string };
  /** The questions the console edits; the snapshot stands in only while no row is published. */
  items: FaqItem[];
}> = ({ title, items }) => {
  const { t } = useLanguage();

  const grouped = categoryOrder
    .map((cat) => ({ cat, items: items.filter((f) => f.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHero
        title={title}
        lead={{
          ar: "إجابات مباشرة على أكثر ما تسأل عنه العميلات قبل الحجز. لم تجدي سؤالك؟ راسلينا على واتساب وسنرد خلال دقائق.",
          en: "Direct answers to what clients ask most before booking. Can't find your question? Message us on WhatsApp and we reply within minutes.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/faq", label: title },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-14">
            {grouped.length === 0 ? (
              <EmptyState
                title={t("لا توجد أسئلة منشورة الآن", "No questions are listed right now")}
                description={t(
                  "إذا كان لديكِ استفسار، تواصلي معنا وسيسعد فريقنا بمساعدتكِ.",
                  "If you have a question, contact us and our team will be happy to help.",
                )}
              />
            ) : (
              grouped.map((g, gi) => (
                <Reveal className="h-full" key={g.cat} delay={gi * 0.05}>
                  <h2 className="text-xl sm:text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                    {t(categoryLabels[g.cat].ar, categoryLabels[g.cat].en)}
                  </h2>
                  <FaqAccordion items={g.items} />
                </Reveal>
              ))
            )}
          </div>

          <Reveal className="mt-16 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--border-control)] p-8 text-center">
            <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">
              {t("ما زال لديكِ سؤال؟", "Still have a question?")}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-lg mx-auto">
              {t(
                "أسئلتكِ عن الحجز وخدمات العيادة موضع ترحيب: تواصلي عبر واتساب أو الاتصال وسنساعدك في اختيار الجلسة المناسبة.",
                "Questions about booking and our services are welcome: reach us on WhatsApp or by phone and we will help you choose the right session."
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
