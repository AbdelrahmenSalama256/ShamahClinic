"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { OfferCard } from "@/components/cards/OfferCard";
import { WhatsAppButton } from "@/components/shared/Actions";
import { offersData } from "@/data/offers";
import { images } from "@/lib/images";

export const OffersClient: React.FC = () => {
  const { t } = useLanguage();

  return (
    <>
      <PageHero
        title={{ ar: "باقات وعروض الموسم", en: "Seasonal packages & offers" }}
        lead={{
          ar: "باقات تجمع أكثر من جلسة بتوفير حقيقي، سارية في الفروع الثلاثة. الأسعار نهائية بدون رسوم خفية، والاستشارة تحدد ملاءمة الباقة لحالتكِ.",
          en: "Packages combining several sessions at a real saving, valid across all three branches. Prices are final with no hidden fees; a consultation confirms suitability.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/offers", label: { ar: "العروض", en: "Offers" } },
        ]}
        photo={images.interiors.treatmentRoom}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{t("العروض والباقات", "Offers and packages")}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-lg:[&>*:last-child]:col-span-2">
            {offersData.map((o, i) => (
              <Reveal className="h-full" key={o.id} delay={i * 0.08}>
                <OfferCard offer={o} />
              </Reveal>
            ))}
          </div>

          {/* Terms */}
          <Reveal className="mt-10 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/40 p-6">
            <h2 className="text-lg font-black text-[var(--text-primary)] mb-3">
              {t("شروط الباقات", "Package terms")}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2.5 text-sm text-[var(--text-secondary)]">
              {[
                {
                  ar: "الأسعار بالجنيه المصري وتشمل الجلسة والاستشارة.",
                  en: "Prices are in EGP and include the session and consultation.",
                },
                {
                  ar: "الباقات سارية في الفروع الثلاثة حسب التوافر.",
                  en: "Packages are valid across all three branches subject to availability.",
                },
                {
                  ar: "يمكن ترقية أو تعديل الباقة بعد الاستشارة.",
                  en: "Packages can be upgraded or adjusted after consultation.",
                },
                {
                  ar: "يُفضّل الحجز المسبق خاصة للعروض الموسمية.",
                  en: "Advance booking is advised, especially for seasonal offers.",
                },
              ].map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--gold-end)] shrink-0" aria-hidden="true">•</span>
                  {t(s.ar, s.en)}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-center sm:justify-start">
              <WhatsAppButton />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
};
