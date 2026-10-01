"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { getLocalizedHref } from "@/lib/locale";
import type { BranchDetail } from "@/data/branches";
import { MapPin, Phone, ArrowLeft, ArrowRight } from "lucide-react";

export const BranchCard: React.FC<{ branch: BranchDetail }> = ({ branch }) => {
  const { t, language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  return (
    <article className="group flex flex-col h-full rounded-2xl overflow-hidden border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:shadow-xl transition-[box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]">
      <div className="relative overflow-hidden">
        <Photo
          slot={branch.image}
          ratio="landscape"
          imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          sizes="(max-width:1024px) 50vw, 33vw"
        />
      </div>
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        <h3 className="text-sm sm:text-base lg:text-lg font-black text-[var(--text-primary)]">
          {t(branch.name.ar, branch.name.en)}
        </h3>
        <p className="mt-1.5 flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
          <span>{t(branch.address.ar, branch.address.en)}</span>
        </p>
        <div className="mt-3 pt-3 border-t border-[var(--gold-border)]/40 flex items-center justify-between gap-2">
          <a
            href={`tel:${branch.phone}`}
            dir="ltr"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300"
          >
            <Phone className="w-4 h-4" />
            {branch.phone}
          </a>
          <Link
            href={getLocalizedHref(`/branches/${branch.id}`, language)}
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--gold-end)] transition-colors duration-300"
          >
            {t("الصفحة", "View")}
            <Arrow className="w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
          </Link>
        </div>
      </div>
    </article>
  );
};
