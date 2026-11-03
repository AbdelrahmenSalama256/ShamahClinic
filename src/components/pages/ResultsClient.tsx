"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ResultCaseCard } from "@/components/cards/ResultCaseCard";
import { GoldLink } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { Article } from "@/data/journal";
import type { PhotoSlot } from "@/lib/images";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** The two halves of one comparison, each carrying the description written for it. */
interface Pair {
  before: PhotoSlot;
  after: PhotoSlot;
}

/**
 * One story as the page draws it.
 *
 * `article` is the journal post the row names, and it is allowed to be absent: a title and a
 * before/after pair are a result the clinic published, with nothing to open. `key` is the row's
 * own identity, which is what the enlarged view and the list keys ride on — an article-less
 * story has no slug to be known by.
 */
export interface ResultStoryView {
  key: string;
  article: Article | null;
  headline: { ar: string; en: string };
  /** the pair only when both halves were uploaded — half a comparison is not one. */
  pair: Pair | null;
  area: { ar: string; en: string };
  sessions: { ar: string; en: string };
  caption: { ar: string; en: string };
  note: { ar: string; en: string };
  service: { label: { ar: string; en: string }; href: { ar: string; en: string } } | null;
}

export const ResultsClient: React.FC<{
  stories: ResultStoryView[];
  page: number;
  totalPages: number;
  total: number;
  banner: PhotoSlot;
}> = ({ stories, page, totalPages, total, banner }) => {
  const { t, language } = useLanguage();
  const router = useRouter();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  const pageHref = (n: number) => `${getLocalizedHref("/results", language)}?page=${n}`;

  // The gallery a card walks is the cases on this page that carry a pair, so its arrows never
  // land on a card with nothing to enlarge. A half case stays on the page as its words and its
  // title; it simply has no gallery to join — the same rule the read path applies to the data.
  const gallery = useMemo(() => stories.filter((story) => story.pair !== null), [stories]);

  return (
    <>
      <PageHero
        title={{ ar: "النتائج وما يمكن توقعه", en: "Results & what to expect" }}
        lead={{
          ar: "نفضّل أن تكوني على بيّنة: كل نتيجة ترفعها العيادة بنفسها — عنوان، وصورة قبل، وصورة بعد. وإن كان للجلسة مقال في المدونة، فتحته البطاقة منه.",
          en: "We prefer you to be informed: every result is uploaded by the clinic itself — a title, a before picture and an after picture. When the session has a journal article, the card opens it.",
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
            title={{ ar: "قصص نتائج من العيادة", en: "Result stories from the clinic" }}
            lead={{
              ar: "كل بطاقة تكتبها العيادة عن نتيجة جلسة بعينها: عنوانها وصورتاها وسطرٌ تحتها. وإن كان لها مقال في المدونة فتحته البطاقة. اضغطي إحدى الصورتين لتكبيرهما معًا وقراءة ما بينهما.",
              en: "Every card is written by the clinic about the result of one session: its headline, its two pictures and the line under them. A result with a journal article opens it from the card. Press either picture to enlarge the pair and read what happened between them.",
            }}
          />



          <h2 className="sr-only ">
            {t("قصص النتائج", "Result stories")}
          </h2>

          {stories.length === 0 ? (
            <Reveal className="rounded-2xl border border-dashed border-[var(--border-control)] bg-[var(--bg-card)] p-8 text-center">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {t(
                  "لم تُنشر أي نتيجة بعد. تضيف العيادة النتيجة من لوحة التحكم: ترفع صورة قبل وأخرى بعد وتكتب عنوانها وسطرًا تحت الصورتين، والمقال الاختياري بعدها.",
                  "No result has been published yet. The clinic adds one from the console: it uploads a before and an after, writes the title and the line under the pictures, and picks an article only if it wants one.",
                )}
              </p>
            </Reveal>
          ) : (
            // 1 col mobile → 2 cols tablet → 3 cols desktop
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 mt-8">
              {stories.map((story, i) => (
                <Reveal key={story.key} delay={Math.min(i, 8) * 0.08} className="h-full">
                  <ResultCaseCard story={story} gallery={gallery} priority={i < 2} />
                </Reveal>
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-col items-center gap-4">
            <p className="text-xs text-[var(--text-muted)]">
              {t("{0} نتيجة", "{0} results", total)}
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
