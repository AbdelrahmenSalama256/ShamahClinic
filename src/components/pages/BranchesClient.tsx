"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { BranchCard } from "@/components/cards/BranchCard";
import type { BranchDetail } from "@/data/branches";
import { images } from "@/lib/images";

export const BranchesClient: React.FC<{ branches: BranchDetail[] }> = ({
  branches,
}) => {
  const { t } = useLanguage();

  return (
    <>
      <PageHero
        title={{ ar: "فروع عيادات شامه", en: "Shamah Clinics branches" }}
        lead={{
          ar: "ثلاثة فروع في القاهرة والجيزة: مدينة نصر، التجمع الخامس، والشيخ زايد. جميعها بطقم نسائي كامل وغرف خاصة.",
          en: "Three branches across Cairo and Giza: Nasr City, Fifth Settlement and Sheikh Zayed. All with an all-female team and private rooms.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/branches", label: { ar: "الفروع", en: "Branches" } },
        ]}
        photo={images.interiors.corridor}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{t("فروعنا", "Our branches")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8 max-lg:[&>*:last-child]:col-span-2">
            {branches.map((b, i) => (
              <Reveal className="h-full" key={b.id} delay={i * 0.1}>
                <BranchCard branch={b} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};
