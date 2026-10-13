"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { getLocalizedHref } from "@/lib/locale";
import type { Treatment } from "@/data/treatments";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const TreatmentCard: React.FC<{ treatment: Treatment }> = ({
  treatment,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const name = t(treatment.name.ar, treatment.name.en);
  const tagline = t(treatment.tagline.ar, treatment.tagline.en);

  return (
    <Link
      href={getLocalizedHref(`/treatments/${treatment.id}`, language)}
      className="group flex flex-col h-full rounded-2xl overflow-hidden border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:shadow-xl hover:-translate-y-1 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
    >
      <div className="relative overflow-hidden">
        <Photo
          slot={treatment.image}
          ratio="landscape"
          imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          sizes="(max-width:1024px) 50vw, 33vw"
        />
        {/* A service WordPress publishes without a category or a price keeps the
            row and the badge absent, not empty — nothing is invented for it. */}
        {(treatment.categoryName.ar || treatment.categoryName.en) && (
          <span className="absolute top-3 start-3 bg-[var(--bg-dark)]/85 text-[var(--gold-start)] text-[10px] sm:text-[11px] font-bold px-3 py-1 rounded-full">
            {t(treatment.categoryName.ar, treatment.categoryName.en)}
          </span>
        )}
      </div>
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        <h3
          className="text-sm sm:text-base lg:text-lg font-black text-[var(--text-primary)] leading-snug line-clamp-2 group-hover:text-[var(--gold-end)] transition-colors duration-300"
          dir="auto"
        >
          {name}
        </h3>
        {/* A two-line slot is reserved whether the intro is one line or none, so
            the price row below lands at the same height on every card. */}
        <p className="mt-1.5 min-h-[2.5rem] sm:min-h-[3rem] text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2" dir="auto">
          {tagline}
        </p>
        <div className="mt-auto pt-3 border-t border-[var(--gold-border)]/40 flex items-center justify-between">
          {treatment.priceStartingAt === null ? (
            <span />
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              {t("يبدأ من", "From")}{" "}
              <strong className="text-[var(--gold-end)] text-sm" dir="ltr">
                {formatNumber(treatment.priceStartingAt)} {t("ج.م", "EGP")}
              </strong>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)]">
            {t("التفاصيل", "Details")}
            <Arrow className="w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
};
