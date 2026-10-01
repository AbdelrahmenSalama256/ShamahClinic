"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { getLocalizedHref } from "@/lib/locale";
import { getSpecialist } from "@/data/specialists";
import type { Article } from "@/data/journal";
import { Clock } from "lucide-react";

export const ArticleCard: React.FC<{ article: Article }> = ({ article }) => {
  const { t, language, formatNumber } = useLanguage();
  const author = getSpecialist(article.authorId);

  return (
    <Link
      href={getLocalizedHref(`/blogs/${article.slug}`, language)}
      className="group flex flex-col h-full rounded-2xl overflow-hidden border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:shadow-xl hover:-translate-y-1 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
    >
      <div className="relative overflow-hidden">
        <Photo
          slot={article.image}
          ratio="landscape"
          imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          sizes="(max-width:1024px) 50vw, 33vw"
        />
      </div>
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-[var(--text-muted)]">
          <span className="font-bold text-[var(--gold-end)]">
            {t(article.date.ar, article.date.en)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t(
              `${formatNumber(article.readMinutes)} دقائق قراءة`,
              `${article.readMinutes} min read`,
            )}
          </span>
        </div>
        <h3 className="mt-2 text-sm sm:text-base lg:text-lg font-black leading-snug text-[var(--text-primary)] group-hover:text-[var(--gold-end)] transition-colors duration-300">
          {t(article.title.ar, article.title.en)}
        </h3>
        <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
          {t(article.excerpt.ar, article.excerpt.en)}
        </p>
        {author && (
          <p className="mt-3 pt-3 border-t border-[var(--gold-border)]/40 text-[10px] sm:text-xs text-[var(--text-muted)]">
            {t("بقلم", "By")}{" "}
            <span className="font-semibold text-[var(--text-secondary)]">
              {t(author.name.ar, author.name.en)}
            </span>
          </p>
        )}
      </div>
    </Link>
  );
};
