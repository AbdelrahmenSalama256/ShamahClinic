"use client";

/**
 * One before/after case, and the gallery it opens.
 *
 * This is the card the original site shipped, with the rows behind it swapped: what it drew
 * used to come from a file of stock pairs and now comes from what the console typed and
 * uploaded. The layout, the chips, the slide between cases, the sticky counter and the dark
 * info card are the ones that were already designed — nothing here is a new look.
 *
 * Four things the data model asked for:
 *
 * **A half pair is not a comparison.** A row with one picture has nothing to compare, so the
 * grid and the gallery are skipped and the card is its title and its words. The read path
 * already dropped the pair in data; this only refuses to draw what is not there.
 *
 * **Each picture is described by itself.** The two slots carry the alt text written for them,
 * because a face before a peel and the same face after it are not one sentence.
 *
 * **The gallery is the page.** The counter reads `N / M` over the cases on this page that
 * carry a pair, in the order the console set them — not over a file that never changes.
 *
 * **The article is optional.** A row that names one links to it from its title and from the
 * enlarged view; a row that names none is still a result, and nothing here asks for one.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { getLocalizedHref } from "@/lib/locale";
import type { Locale } from "@/lib/locale";
import type { PhotoSlot } from "@/lib/images";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import { track } from "@/lib/tracking/first-party";
import { motionTransition } from "@/lib/motion";


/** Bilingual text, as the console writes it. */
interface Words {
  ar: string;
  en: string;
}

/** One case, as the page hands it over. */
export interface ResultCaseData {
  key: string;
  headline: Words;
  /** both halves together, or nothing: half a comparison is not one. */
  pair: { before: PhotoSlot; after: PhotoSlot } | null;
  area: Words;
  sessions: Words;
  caption: Words;
  /** the longer text, shown only in the enlarged view. */
  note: Words;
  service: { label: Words; href: Words } | null;
  /** the journal post the row names, when the owner picked one. */
  article: { slug: string } | null;
}

interface Props {
  story: ResultCaseData;
  /** the cases on this page that carry a pair, in the order the console set them. */
  gallery: ResultCaseData[];
  priority: boolean;
}

type Translate = (ar: string, en: string, ...args: (string | number)[]) => string;

/**
 * The three chips a case is summarised by: its service, the area treated, the sessions it took.
 *
 * Each is left out when the row left the field empty — an unnamed area is not a chip that
 * says "—". On the dark info card the same three wear the dark palette, so the enlarged view
 * reads as one surface rather than a light strip inside a dark one.
 */
const Chips: React.FC<{ data: ResultCaseData; dark: boolean; t: Translate; language: Locale }> = ({
  data,
  dark,
  t,
  language,
}) => {
  const pill = dark
    ? "text-[var(--text-on-dark-muted)] bg-white/5 border border-white/10"
    : "text-[var(--text-secondary)] bg-[var(--bg-secondary)]/70 border border-[var(--border-control)]";
  const icon = dark ? "" : "text-[var(--text-gold)]";
  const area = t(data.area.ar, data.area.en);
  const sessions = t(data.sessions.ar, data.sessions.en);

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px]">
      {data.service ? (
        <Link
          href={getLocalizedHref(data.service.href.ar || data.service.href.en, language)}
          className={`inline-flex items-center font-bold rounded-full px-2.5 py-1 transition-colors duration-hover ${
            dark
              ? "text-[var(--gold-start)] bg-[var(--gold-end)]/20 border border-[var(--gold-start)]/30 hover:bg-[var(--gold-end)]/35"
              : "text-[var(--gold-end)] bg-[var(--blush-light)] border border-[var(--border-control)] hover:text-[var(--text-gold)]"
          }`}
        >
          {t(data.service.label.ar, data.service.label.en)}
        </Link>
      ) : null}

      {area ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${pill}`}>
          <MapPin className={`w-3 h-3 shrink-0 ${icon}`} />
          {area}
        </span>
      ) : null}

      {sessions ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${pill}`}>
          <CalendarDays className={`w-3 h-3 shrink-0 ${icon}`} />
          {sessions}
        </span>
      ) : null}
    </div>
  );
};

export const ResultCaseCard: React.FC<Props> = ({ story, gallery, priority }) => {
  const { t, language, direction, formatNumber } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      gallery.findIndex((item) => item.key === story.key),
    ),
  );
  const [slideDir, setSlideDir] = useState(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeResult = gallery[activeIndex] ?? story;

  const rtl = direction === "rtl";
  // The keyboard walks the cases on this page, so the effect can depend on the count rather
  // than on the array: re-subscribing when the page changes is enough.
  const total = gallery.length;

  const closeGallery = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGallery();
      // Onward is always index + 1, in either direction: the arrows say so with their words,
      // the counter counts that way, and mirroring the step is what made the two disagree.
      if (event.key === "ArrowRight") {
        setSlideDir(1);
        setActiveIndex((index) => (index + 1) % total);
      }
      if (event.key === "ArrowLeft") {
        setSlideDir(-1);
        setActiveIndex((index) => (index - 1 + total) % total);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, total, closeGallery]);

  const move = (step: number) => {
    setSlideDir(step);
    setActiveIndex((index) => (index + step + total) % total);
  };

  const open = () => {
    setActiveIndex(Math.max(0, gallery.findIndex((item) => item.key === story.key)));
    setSlideDir(1);
    setIsOpen(true);
    track("story_view", { story: story.key });
  };

  const xIn = (dir: number) => (rtl ? -40 * dir : 40 * dir);
  const xOut = (dir: number) => (rtl ? 40 * dir : -40 * dir);

  const headline = t(story.headline.ar, story.headline.en);
  const caption = t(story.caption.ar, story.caption.en);
  const articleHref = story.article ? getLocalizedHref(`/blogs/${story.article.slug}`, language) : null;

  return (
    <div className="h-full flex flex-col rounded-2xl overflow-hidden border border-[var(--border-control)] bg-[var(--bg-card)] transition-[box-shadow,border-color] duration-fade ease-brand hover:shadow-lg hover:border-[var(--border-control)]">
      {/* ── Title, above the two pictures ── */}
      <h3 className="px-4 pt-4 text-sm sm:px-5 sm:pt-5 sm:text-base lg:text-lg font-black leading-snug line-clamp-2 text-[var(--text-primary)]" dir="auto">
        {articleHref ? (
          <Link href={articleHref} className="hover:text-[var(--gold-end)] transition-colors duration-hover">
            {headline}
          </Link>
        ) : (
          headline
        )}
      </h3>

      {/* ── Before / After grid ── */}
      {story.pair ? (
        <div className="mt-3 grid grid-cols-2">
          {(
            [
              {
                slot: story.pair.before,
                label: { ar: "قبل", en: "Before" },
                style: "bg-[var(--bg-dark)]/85 text-[var(--text-on-dark)]",
                aria: t("عرض نتيجة {0}", "View {1} result", story.headline.ar, story.headline.en),
              },
              {
                slot: story.pair.after,
                label: { ar: "بعد", en: "After" },
                style: "bg-[var(--gold-end)] text-[var(--text-inverse)]",
                aria: t("عرض نتيجة {0} بعد الخدمة", "View {1} after treatment", story.headline.ar, story.headline.en),
              },
            ] as const
          ).map((item, i) => (
            <button
              key={i}
              ref={i === 0 ? triggerRef : undefined}
              type="button"
              onClick={open}
              aria-label={item.aria}
              className="group relative block w-full cursor-zoom-in text-start overflow-hidden"
            >
              <Photo
                slot={item.slot}
                ratio="square"
                priority={priority}
                className="!aspect-square"
                imgClassName="transition-transform duration-reveal ease-brand group-hover:scale-105"
                sizes="50vw"
              />
              <span className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-fade" />
              <span className={`absolute bottom-2 start-2 ${item.style} text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm`}>
                {t(item.label.ar, item.label.en)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Description ── */}
      <div className="p-4 sm:p-5 flex flex-1 flex-col gap-3">
        <Chips data={story} dark={false} t={t} language={language} />

        {caption ? (
          <p className="text-[13px] sm:text-sm font-semibold leading-relaxed text-[var(--text-secondary)]" dir="auto">
            {caption}
          </p>
        ) : null}
      </div>

      {/* ══════════════ LIGHTBOX ══════════════ */}
      {story.pair && typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                key="lightbox-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionTransition("ui")}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-4 lg:p-6 backdrop-blur-sm"
                onClick={closeGallery}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={motionTransition("hover")}
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("معرض صور قبل وبعد", "Before and after gallery")}
                  onClick={(event) => event.stopPropagation()}
                  className="relative w-full max-w-6xl max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-none sm:rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
                >
                  {/* Sticky header */}
                  <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--border-control)] bg-[var(--bg-primary)]/95 px-3 py-2.5 sm:px-5 sm:py-3 lg:px-6 backdrop-blur">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] line-clamp-2" dir="auto">
                      {t(activeResult.headline.ar, activeResult.headline.en)}{" "}
                      <span className="text-[var(--text-muted)]">
                        ·{" "}
                        {/* Only the numerator changes, so only the numerator needs a cell. */}
                        <span className="num [--num-digits:2]">{formatNumber(activeIndex + 1)}</span> /{" "}
                        {formatNumber(total)}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={closeGallery}
                      aria-label={t("إغلاق المعرض", "Close gallery")}
                      className="rounded-full p-1.5 sm:p-2 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--gold-end)] transition-colors duration-hover"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-2.5 sm:p-4 lg:p-6">
                    {/* Before / After images */}
                    <div className="relative">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={activeResult.key}
                          initial={{ opacity: 0, x: xIn(slideDir) }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: xOut(slideDir) }}
                          transition={motionTransition("settle")}
                          className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4"
                        >
                          {(activeResult.pair ? [activeResult.pair.before, activeResult.pair.after] : []).map((photo, index) => (
                            <figure className="relative" key={`${activeResult.key}-${index}`}>
                              <Photo
                                slot={photo}
                                ratio="landscape"
                                className="!aspect-[3/2] rounded-lg sm:rounded-xl overflow-hidden"
                                imgClassName="object-contain"
                                sizes="(max-width: 640px) 100vw, 50vw"
                              />
                              <figcaption
                                className={`absolute top-2 start-2 sm:top-3 sm:start-3 ${
                                  index === 0 ? "bg-black/75" : "bg-[var(--gold-end)]/90"
                                } rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-bold text-[var(--text-on-dark)] backdrop-blur-sm`}
                              >
                                {index === 0 ? t("قبل", "Before") : t("بعد", "After")}
                              </figcaption>
                            </figure>
                          ))}
                        </motion.div>
                      </AnimatePresence>

                      {/* Navigation arrows — hidden on very small screens, replaced by bottom bar */}
                      <button
                        type="button"
                        onClick={() => move(-1)}
                        aria-label={t("النتيجة السابقة", "Previous result")}
                        className="hidden sm:flex absolute start-2 top-1/2 z-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2.5 text-[var(--text-on-dark)] backdrop-blur transition-[background-color,transform] duration-hover hover:bg-black/80 hover:scale-105"
                      >
                        {rtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => move(1)}
                        aria-label={t("النتيجة التالية", "Next result")}
                        className="hidden sm:flex absolute end-2 top-1/2 z-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2.5 text-[var(--text-on-dark)] backdrop-blur transition-[background-color,transform] duration-hover hover:bg-black/80 hover:scale-105"
                      >
                        {rtl ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </button>
                    </div>

                    {/* Info card */}
                    <div className="mt-2.5 sm:mt-4">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`info-${activeResult.key}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ ...motionTransition("hover"), delay: 0.05 }}
                          className="on-dark mx-auto w-full max-w-2xl rounded-lg sm:rounded-xl border border-[var(--border-control)] bg-[var(--bg-dark)]/95 p-3 sm:p-4 lg:p-5 text-[var(--text-on-dark)] shadow-xl backdrop-blur-md"
                        >
                          <Chips data={activeResult} dark t={t} language={language} />

                          {t(activeResult.caption.ar, activeResult.caption.en) ? (
                            <p className="mt-2.5 sm:mt-3 text-[13px] sm:text-sm font-bold leading-relaxed text-[var(--text-on-dark)]" dir="auto">
                              {t(activeResult.caption.ar, activeResult.caption.en)}
                            </p>
                          ) : null}

                          {t(activeResult.note.ar, activeResult.note.en) ? (
                            <p className="mt-2.5 sm:mt-3 whitespace-pre-line text-[13px] sm:text-sm leading-relaxed text-[var(--text-on-dark)] border-s-2 border-[var(--gold-start)]/50 ps-3" dir="auto">
                              {t(activeResult.note.ar, activeResult.note.en)}
                            </p>
                          ) : null}

                          {activeResult.article ? (
                            <Link
                              href={getLocalizedHref(`/blogs/${activeResult.article.slug}`, language)}
                              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-start)] hover:text-[var(--text-gold)] transition-colors duration-hover"
                            >
                              {t("افتحي مقال النتيجة", "Open the result's article")}
                              {rtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </Link>
                          ) : null}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Mobile navigation bar */}
                    <div className="sm:hidden mt-4 flex items-center justify-between gap-2 rounded-full border border-[var(--border-control)] bg-[var(--bg-card)] p-1.5">
                      <button
                        type="button"
                        onClick={() => move(-1)}
                        aria-label={t("النتيجة السابقة", "Previous result")}
                        className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-hover"
                      >
                        {rtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                        {t("السابق", "Prev")}
                      </button>
                      <span className="text-[11px] font-bold text-[var(--text-muted)]">
                        <span className="num [--num-digits:2]">{formatNumber(activeIndex + 1)}</span> / {formatNumber(total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(1)}
                        aria-label={t("النتيجة التالية", "Next result")}
                        className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-hover"
                      >
                        {t("التالي", "Next")}
                        {rtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
};
