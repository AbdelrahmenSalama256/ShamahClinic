"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { getLocalizedHref } from "@/lib/locale";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  href: string;
  label: { ar: string; en: string };
}

interface BreadcrumbsProps {
  items: Crumb[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  const { t, language } = useLanguage();
  const Arrow = ChevronRight;

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {isLast ? (
                <span
                  className="font-semibold text-[var(--gold-end)]"
                  aria-current="page"
                >
                  {t(item.label.ar, item.label.en)}
                </span>
              ) : (
                <>
                  <Link
                    href={getLocalizedHref(item.href, language)}
                    className="hover:text-[var(--gold-end)] transition-colors duration-300"
                  >
                    {t(item.label.ar, item.label.en)}
                  </Link>
                  <Arrow
                    className={`w-3 h-3 ${language === "ar" ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
