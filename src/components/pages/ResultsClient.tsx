"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { GoldLink } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { Article } from "@/data/journal";
import type { PhotoSlot } from "@/lib/images";
import { ArrowLeft, ArrowRight, Maximize2, X } from "lucide-react";

/** The two halves of one comparison. */
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
  caption: { ar: string; en: string };
  note: { ar: string; en: string };
  service: { label: { ar: string; en: string }; href: { ar: string; en: string } } | null;
}

/** A story the enlarged view may open: the pair is there, and so are its two halves. */
type PairedStory = ResultStoryView & { pair: Pair };

const HALVES = [
  { key: "before", label: { ar: "قبل", en: "Before" } },
  { key: "after", label: { ar: "بعد", en: "After" } },
] as const;

export const ResultsClient: React.FC<{
  stories: ResultStoryView[];
  page: number;
  totalPages: number;
  total: number;
  banner: PhotoSlot;
}> = ({ stories, page, totalPages, total, banner }) => {
  const { t, language, formatNumber } = useLanguage();
  const router = useRouter();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const Back = language === "ar" ? ArrowRight : ArrowLeft;
  const Forward = language === "ar" ? ArrowLeft : ArrowRight;

  const pageHref = (n: number) => `${getLocalizedHref("/results", language)}?page=${n}`;

  // The enlarged view walks the stories that carry a pair, so the arrows never land on a
  // card with nothing to enlarge. The predicate is what says so to the type as well.
  const paired = useMemo(() => stories.filter((story): story is PairedStory => story.pair !== null), [stories]);
  const [opened, setOpened] = useState<string | null>(null);
  const at = paired.findIndex((story) => story.key === opened);
  const shown = at >= 0 ? paired[at] : null;

  const move = useCallback(
    (offset: number) => setOpened(paired[(at + offset + paired.length) % paired.length].key),
    [paired, at],
  );

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpened(null);
      if (event.key === "ArrowRight") move(language === "ar" ? -1 : 1);
      if (event.key === "ArrowLeft") move(language === "ar" ? 1 : -1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [shown, move, language]);

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

          <Reveal className="mt-8 mb-10 rounded-2xl border border-[var(--border-control)] bg-[var(--blush-light)]/60 p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {t(
                "صورة «قبل وبعد» تظهر فقط حين ترفع العيادة الصورتين معًا لنفس النتيجة: نصف مقارنة لا يعرض مقارنة. وتظهر النتيجة بعنوانها وصورتَيها ولو لم يكن لها مقال، أما حين تكون الصورتان ناقصتين فالبطاقة تبقى نصًّا أو صورة مقالها. تُرفع الصور من جهاز الطبيبة، ولا تُستبدل بصورة نموذجية ولا تُخفى حالة لأنها لم تُرضِ أحدًا — والنتيجة تتفاوت من بشرة لأخرى حسب نوعها وعمق المشكلة والالتزام بالخطة.",
                "A before/after pair shows only when the clinic uploads both halves for the same result: half a comparison is not one. A result stands on its own title and pictures, with no article needed; while the two halves are incomplete the card stays its text, or its article's photo. Pictures are uploaded from the doctor's own device, never replaced with a stock photo and never hidden because a case was unsatisfying — and a result varies with skin type, concern depth and adherence to the plan.",
              )}
            </p>
          </Reveal>

          <h2 className="sr-only">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
              {stories.map((story, i) => (
                <Reveal key={story.key} delay={Math.min(i, 8) * 0.08} className="h-full">
                  {story.pair || !story.article ? (
                    <ResultCase story={story} priority={i < 2} onOpen={() => setOpened(story.key)} />
                  ) : (
                    <ArticleCard article={story.article} priority={i < 2} />
                  )}
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

      {shown
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-4 lg:p-6 backdrop-blur-sm"
              onClick={() => setOpened(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("النتيجة مكبّرة", "Enlarged result")}
                onClick={(event) => event.stopPropagation()}
                className="relative w-full max-w-5xl max-h-[100dvh] overflow-y-auto rounded-none sm:rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-control)] bg-[var(--bg-primary)]/95 px-3 py-2.5 sm:px-5 sm:py-3 backdrop-blur">
                  <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] line-clamp-2" dir="auto">
                    {t(shown.headline.ar, shown.headline.en)}{" "}
                    <span className="text-[var(--text-muted)]">
                      · <span className="num [--num-digits:2]">{formatNumber(at + 1)}</span>/
                      <span className="num [--num-digits:2]">{formatNumber(paired.length)}</span>
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpened(null)}
                    aria-label={t("إغلاق", "Close")}
                    className="shrink-0 rounded-full p-2 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--gold-end)] transition-colors duration-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-3 sm:p-5 lg:p-6">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {HALVES.map((half) => (
                      <figure key={half.key} className="relative">
                        <Photo
                          slot={half.key === "before" ? shown.pair.before : shown.pair.after}
                          ratio="landscape"
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="rounded-lg sm:rounded-xl overflow-hidden"
                        />
                        <figcaption className="absolute top-2 start-2 rounded-full bg-black/75 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-[var(--text-on-dark)] backdrop-blur-sm">
                          {t(half.label.ar, half.label.en)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>

                  {t(shown.caption.ar, shown.caption.en) ? (
                    <p className="mt-3 text-sm font-semibold text-[var(--text-secondary)]" dir="auto">
                      {t(shown.caption.ar, shown.caption.en)}
                    </p>
                  ) : null}

                  {t(shown.note.ar, shown.note.en) ? (
                    <p
                      className="mt-3 whitespace-pre-line text-[13px] sm:text-sm leading-relaxed text-[var(--text-secondary)] border-s-2 border-[var(--gold-start)]/50 ps-3"
                      dir="auto"
                    >
                      {t(shown.note.ar, shown.note.en)}
                    </p>
                  ) : null}

                  {shown.service || shown.article ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      {shown.service ? (
                        <Link
                          href={getLocalizedHref(shown.service.href.ar || shown.service.href.en, language)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300"
                        >
                          {t(shown.service.label.ar, shown.service.label.en)}
                          <Arrow className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span />
                      )}
                      {shown.article ? (
                        <Link
                          href={getLocalizedHref(`/blogs/${shown.article.slug}`, language)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-gold)] transition-colors duration-300"
                        >
                          {t("افتحي مقال النتيجة", "Open the result's article")}
                          <Arrow className="w-3.5 h-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  ) : null}

                  {paired.length > 1 ? (
                    <div className="mt-5 flex items-center justify-between gap-2 rounded-full border border-[var(--border-control)] bg-[var(--bg-card)] p-1.5">
                      <button
                        type="button"
                        onClick={() => move(language === "ar" ? 1 : -1)}
                        aria-label={t("النتيجة السابقة", "Previous result")}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-300"
                      >
                        <Back className="w-3.5 h-3.5" />
                        {t("السابق", "Prev")}
                      </button>
                      <button
                        type="button"
                        onClick={() => move(language === "ar" ? -1 : 1)}
                        aria-label={t("النتيجة التالية", "Next result")}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-300"
                      >
                        {t("التالي", "Next")}
                        <Forward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

/**
 * The card a result row writes for itself.
 *
 * The two halves are buttons, not a link: the pair opens the enlarged view, and the article
 * its row names keeps its own link below, so nothing is asked to do two things at once. With
 * no article behind it the card is its headline, its pictures and its caption — which is a
 * complete result, and the reason neither link here is required.
 */
const ResultCase: React.FC<{
  story: ResultStoryView;
  priority: boolean;
  onOpen: () => void;
}> = ({ story, priority, onOpen }) => {
  const { t, language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const pair = story.pair;
  const headline = t(story.headline.ar, story.headline.en);
  // The line under the pictures is the card's teaser; the article's own excerpt is what
  // stands in until somebody writes one — and a card with no article has nothing to stand in.
  const teaser =
    t(story.caption.ar, story.caption.en) ||
    (story.article ? t(story.article.excerpt.ar, story.article.excerpt.en) : "");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-control)] bg-[var(--bg-card)]">
      {pair ? (
        <div className="grid grid-cols-2">
          {HALVES.map((half) => (
            <button
              key={half.key}
              type="button"
              onClick={onOpen}
              aria-label={t(
                "تكبير صورة {0}",
                "Enlarge the {0} picture",
                language === "ar" ? half.label.ar : half.label.en.toLowerCase(),
              )}
              className="group relative block cursor-zoom-in overflow-hidden text-start"
            >
              <Photo
                slot={half.key === "before" ? pair.before : pair.after}
                ratio="square"
                priority={priority}
                className="!aspect-square"
                imgClassName="transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-105"
                sizes="(max-width:1024px) 50vw, 33vw"
              />
              <span className="pointer-events-none absolute bottom-2 start-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-[var(--text-on-dark)] backdrop-blur-sm">
                {t(half.label.ar, half.label.en)}
              </span>
              <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/15" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-5">
        {story.service ? (
          <Link
            href={getLocalizedHref(story.service.href.ar || story.service.href.en, language)}
            className="w-fit rounded-full bg-[var(--blush-light)] border border-[var(--border-control)] px-2.5 py-1 text-[11px] font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300"
          >
            {t(story.service.label.ar, story.service.label.en)}
          </Link>
        ) : null}

        <h3 className="text-sm sm:text-base lg:text-lg font-black leading-snug line-clamp-2 text-[var(--text-primary)]" dir="auto">
          {story.article ? (
            <Link href={getLocalizedHref(`/blogs/${story.article.slug}`, language)} className="hover:text-[var(--gold-end)] transition-colors duration-300">
              {headline}
            </Link>
          ) : (
            headline
          )}
        </h3>

        {teaser ? (
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2" dir="auto">
            {teaser}
          </p>
        ) : null}

        {story.article || story.pair ? (
          <div className="mt-auto pt-3 flex items-center justify-between gap-2 border-t border-[var(--border-control)]">
            {story.article ? (
              <Link
                href={getLocalizedHref(`/blogs/${story.article.slug}`, language)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300"
              >
                {t("افتحي المقال", "Open the article")}
                <Arrow className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <span className="text-[11px] font-bold text-[var(--text-muted)]">{t("بلا مقال", "No article")}</span>
            )}
            {story.pair ? (
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-gold)] transition-colors duration-300"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                {t("تكبير", "Enlarge")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
};
