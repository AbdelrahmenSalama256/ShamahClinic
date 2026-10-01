"use client";

import React, { useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import {
  treatmentsData,
  treatmentCategories,
  type TreatmentCategory,
} from "@/data/treatments";
import { images } from "@/lib/images";

export const TreatmentsClient: React.FC = () => {
  const { t } = useLanguage();
  const [active, setActive] = useState<TreatmentCategory | "all">("all");

  const filtered = useMemo(
    () =>
      active === "all"
        ? treatmentsData
        : treatmentsData.filter((x) => x.category === active),
    [active],
  );

  return (
    <>
      <PageHero
        title={{
          ar: "خدمات عيادات شامه التجميلية",
          en: "Shamah Clinics aesthetic treatments",
        }}
        lead={{
          ar: "جلسات ليزر، عناية بالبشرة، حقن تجميلي، وبروتوكولات نضارة ومكافحة شيخوخة — كلها بإشراف طبي نسائي وبأسعار تبدأ من قيمة واضحة معلنة.",
          en: "Laser, skincare, injectables and rejuvenation protocols — all under female medical supervision with clear starting prices.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/services", label: { ar: "الخدمات", en: "Treatments" } },
        ]}
        photo={images.treatments.laser}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2.5 mb-10">
            {treatmentCategories.map((c) => {
              const isActive = active === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  aria-pressed={isActive}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-[background-color,color,transform,border-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${
                    isActive
                      ? "bg-gold-gradient text-white border-transparent shadow-md"
                      : "bg-white text-[var(--text-secondary)] border-[var(--gold-border)]/60 hover:border-[var(--gold-mid)] hover:text-[var(--gold-end)]"
                  }`}
                >
                  {t(c.name.ar, c.name.en)}
                </button>
              );
            })}
          </div>

          <h2 className="sr-only">{t("خدماتنا", "Our services")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8 max-lg:[&>*:last-child]:col-span-2">
            {filtered.map((tr, i) => (
              <Reveal className="h-full" key={tr.id} delay={(i % 3) * 0.08}>
                <TreatmentCard treatment={tr} />
              </Reveal>
            ))}
          </div>

          <p className="mt-12 text-center text-sm text-[var(--text-secondary)]">
            {t(
              "الأسعار المعروضة استرشادية «تبدأ من» وتختلف حسب المنطقة وعدد الجلسات. الاستشارة الأولى تحدد الخطة والتكلفة بدقة.",
              "Listed prices are 'starting from' guides and vary by area and number of sessions. The first consultation defines the exact plan and cost.",
            )}
          </p>
        </div>
      </section>
    </>
  );
};
