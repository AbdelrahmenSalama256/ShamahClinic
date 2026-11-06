"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { BranchCard } from "@/components/cards/BranchCard";
import type { BranchDetail } from "@/data/branches";
import type { PhotoSlot } from "@/lib/images";

export const BranchesClient: React.FC<{ branches: BranchDetail[]; banner: PhotoSlot | null }> = ({
  branches,
  banner,
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
        photo={banner ?? undefined}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{t("فروعنا", "Our branches")}</h2>
          {branches.length === 0 ? (
            <EmptyState
              title={t("لا توجد فروع معروضة الآن", "No branches are listed right now")}
              description={t(
                "تواصلي معنا وسنساعدكِ في معرفة أقرب فرع ومواعيد الزيارة.",
                "Contact us and we’ll help you find the nearest branch and its visiting hours.",
              )}
            />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8 max-lg:[&>*:last-child]:col-span-2">
              {branches.map((b, i) => (
                <Reveal className="h-full" key={b.id} delay={i * 0.1}>
                  <BranchCard branch={b} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};
