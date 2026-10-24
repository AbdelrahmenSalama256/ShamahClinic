"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { GoldLink } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { Article } from "@/data/journal";
import type { PhotoSlot } from "@/lib/images";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const ResultsClient: React.FC<{
  stories: Article[];
  page: number;
  totalPages: number;
  total: number;
  banner: PhotoSlot;
}> = ({ stories, page, totalPages, total, banner }) => {
  const { t, language } = useLanguage();
  const router = useRouter();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  const pageHref = (n: number) => `${getLocalizedHref("/results", language)}?page=${n}`;

  return (
    <>
      <PageHero
        title={{ ar: "النتائج وما يمكن توقعه", en: "Results & what to expect" }}
        lead={{
          ar: "نفضّل أن تكوني على بيّنة: هذه مقالات العيادة نفسها عن نتائج جلساتها، بعنوانها ومقتطفها وصورتها كما نشرتها الطبيبات.",
          en: "We prefer you to be informed: these are the clinic's own articles on its treatment results, with the title, excerpt and photo its doctors published.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/results", label: { ar: "النتائج", en: "Results" } },
        ]}
        photo={banner}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title={{ ar: "قصص نتائج من مدونة العيادة", en: "Result stories from the clinic blog" }}
            lead={{
              ar: "كل بطاقة هنا مقال تكتبه العيادة عن نتيجة جلسة بعينها: العنوان والمقتطف والصورة من المقال نفسه، والنقرة تفتح النص كاملاً.",
              en: "Every card is an article the clinic wrote about the result of a specific session: title, excerpt and photo are the article's own, and the link opens the full text.",
            }}
          />

          {/* The dashboard publishes no result photography, so the page shows no
              before/after pair. Stated in the clinic's own terms, not as plumbing. */}
          <Reveal className="mt-8 mb-10 rounded-2xl border border-[var(--border-control)] bg-[var(--blush-light)]/60 p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {t(
                "لا تعرض هذه الصفحة صور «قبل وبعد»: لم تنشر العيادة أي صورة نتيجة لعميلاتها، فالنتيجة التي تُروى هنا مكتوبة في مقالات الطبيبات، وتتفاوت من حالة لأخرى حسب نوع البشرة وعمق المشكلة والالتزام بالخطة.",
                "This page shows no before/after photos: the clinic has published no client result imagery, so the results told here are written in its doctors' articles, and they vary with skin type, concern depth and adherence to the plan.",
              )}
            </p>
          </Reveal>

          <h2 className="sr-only">
            {t("مقالات النتائج", "Result articles")}
          </h2>
          {/* 1 col mobile → 2 cols tablet → 3 cols desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {stories.map((a, i) => (
              <Reveal key={a.slug} delay={Math.min(i, 8) * 0.08} className="h-full">
                <ArticleCard article={a} priority={i < 2} />
              </Reveal>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4">
            <p className="text-xs text-[var(--text-muted)]">
              {t(`${total} مقالاً عن النتائج`, `${total} result articles`)}
            </p>
            {totalPages > 1 && (
              <nav className="flex items-center gap-1" aria-label={t("ترقيم الصفحات", "Pagination")}>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const n = idx + 1;
                  if (totalPages > 7 && n > 3 && n < totalPages - 1 && Math.abs(n - page) > 1) {
                    if (n === 4) return <span key="dots" className="px-2 text-[var(--text-muted)]">…</span>;
                    return null;
                  }
                  return (
                    <button
                      key={n}
                      onClick={() => router.push(pageHref(n), { scroll: false })}
                      aria-current={n === page ? "page" : undefined}
                      className={`min-w-9 h-9 rounded-full text-sm font-bold border transition-colors ${
                        n === page
                          ? "bg-[var(--bg-dark)] text-[var(--text-on-dark)] border-transparent"
                          : "border-[var(--border-control)] text-[var(--text-secondary)] hover:border-[var(--border-control)]"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </nav>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300"
              >
                {t("الصفحة التالية", "Next page")}
                <Arrow className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          <div className="mt-10 text-center">
            <GoldLink href="/services" withArrow>
              {t("تصفحي الخدمات", "Browse treatments")}
            </GoldLink>
          </div>
        </div>
      </section>
    </>
  );
};
