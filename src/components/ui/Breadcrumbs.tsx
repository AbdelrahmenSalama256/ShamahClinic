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

/**
 * One trail, used by every page that opens under a hero.
 *
 * The last crumb is the page itself: plain text with `aria-current="page"`, never a link
 * back to where the reader already is. Everything before it is a link. The chevron is a
 * separator between crumbs, so it sits after a link and points the way the reader travels:
 * rightwards in English, leftwards in Arabic.
 *
 * A service, article or offer name can be one long word. The trail wraps between crumbs and
 * inside the current name, and every row is allowed to shrink (`min-w-0`) so a name never
 * pushes the page wider than a 320px phone — the page must not need horizontal scrolling.
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  const { t, language } = useLanguage();
  const rtl = language === "ar";

  return (
    <nav aria-label={t("مسار التصفح", "Breadcrumb")} className="mb-6 min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--text-muted)]">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.href}-${i}`} className="flex min-w-0 max-w-full items-center gap-1.5">
              {isLast ? (
                <span
                  className="max-w-full font-semibold text-[var(--gold-end)] [overflow-wrap:anywhere]"
                  aria-current="page"
                >
                  {t(item.label.ar, item.label.en)}
                </span>
              ) : (
                <>
                  <Link
                    href={getLocalizedHref(item.href, language)}
                    className="max-w-full rounded transition-colors duration-hover hover:text-[var(--gold-end)] [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2"
                  >
                    {t(item.label.ar, item.label.en)}
                  </Link>
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 ${rtl ? "rotate-180" : ""}`}
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
