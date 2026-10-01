"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { resultsData, type ResultCase } from "@/data/results";
import {
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
  MapPin,
} from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

export const ResultCaseCard: React.FC<{ result: ResultCase }> = ({
  result,
}) => {
  const { t, direction, formatNumber } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      resultsData.findIndex((item) => item.id === result.id),
    ),
  );
  const [slideDir, setSlideDir] = useState(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeResult = resultsData[activeIndex];

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key === "ArrowRight") {
        setSlideDir(1);
        setActiveIndex((index) => (index + 1) % resultsData.length);
      }
      if (event.key === "ArrowLeft") {
        setSlideDir(-1);
        setActiveIndex(
          (index) => (index - 1 + resultsData.length) % resultsData.length,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const closeGallery = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const move = (step: number) => {
    setSlideDir(step);
    setActiveIndex(
      (index) => (index + step + resultsData.length) % resultsData.length,
    );
  };

  const rtl = direction === "rtl";
  const xIn = (dir: number) => (rtl ? -40 * dir : 40 * dir);
  const xOut = (dir: number) => (rtl ? 40 * dir : -40 * dir);

  return (
    <div className="h-full flex flex-col rounded-2xl overflow-hidden border border-[var(--gold-border)]/50 bg-[var(--bg-card)] transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:shadow-lg hover:border-[var(--gold-mid)]/60">
      {/* ── Before / After grid ── */}
      <div className="grid grid-cols-2">
        {(
          [
            {
              slot: result.before,
              label: { ar: "قبل", en: "Before" },
              style: "bg-[var(--bg-dark)]/85",
              aria: t(
                `عرض نتيجة ${result.treatment.ar}`,
                `View ${result.treatment.en} result`,
              ),
            },
            {
              slot: result.after,
              label: { ar: "بعد", en: "After" },
              style: "bg-[var(--gold-end)]/90",
              aria: t(
                `عرض نتيجة ${result.treatment.ar} بعد الخدمة`,
                `View ${result.treatment.en} after treatment`,
              ),
            },
          ] as const
        ).map((item, i) => (
          <button
            key={i}
            ref={i === 0 ? triggerRef : undefined}
            type="button"
            onClick={() => {
              setActiveIndex(resultsData.findIndex((r) => r.id === result.id));
              setSlideDir(1);
              setIsOpen(true);
            }}
            aria-label={item.aria}
            className="group relative block w-full cursor-zoom-in text-start overflow-hidden"
          >
            <Photo
              slot={item.slot}
              ratio="square"
              className="!aspect-square"
              imgClassName="transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-105"
              sizes="50vw"
            />
            <span className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-500" />
            <span
              className={`absolute bottom-2 start-2 ${item.style} text-white text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm`}
            >
              {t(item.label.ar, item.label.en)}
            </span>
          </button>
        ))}
      </div>

      {/* ── Description ── */}
      <div className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center text-[11px] font-bold text-[var(--gold-end)] bg-[var(--blush-light)] border border-[var(--gold-border)]/40 rounded-full px-2.5 py-1">
            {t(result.treatment.ar, result.treatment.en)}
          </span>

          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/25 rounded-full px-2.5 py-1">
            <MapPin className="w-3 h-3 text-[var(--gold-mid)] shrink-0" />
            {t(result.area.ar, result.area.en)}
          </span>

          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/25 rounded-full px-2.5 py-1">
            <CalendarDays className="w-3 h-3 text-[var(--gold-mid)] shrink-0" />
            {t(result.sessions.ar, result.sessions.en)}
          </span>
        </div>

        {result.note && (
          <p className="text-[13px] sm:text-sm leading-relaxed text-[var(--text-secondary)] ps-3 border-s-2 border-[var(--gold-mid)]/40">
            {t(result.note.ar, result.note.en)}
          </p>
        )}
      </div>

      {/* ══════════════ LIGHTBOX ══════════════ */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                key="lightbox-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-4 lg:p-6 backdrop-blur-sm"
                onClick={closeGallery}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={{ duration: 0.3, ease }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={t(
                    "معرض صور قبل وبعد",
                    "Before and after gallery",
                  )}
                  onClick={(event) => event.stopPropagation()}
                  className="relative w-full max-w-6xl max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-none sm:rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
                >
                  {/* Sticky header */}
                  <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--gold-border)]/40 bg-[var(--bg-primary)]/95 px-3 py-2.5 sm:px-5 sm:py-3 lg:px-6 backdrop-blur">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      {t("معرض النتائج", "Results gallery")}{" "}
                      <span className="text-[var(--text-muted)] tabular-nums">
                        · {formatNumber(activeIndex + 1)} /{" "}
                        {formatNumber(resultsData.length)}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={closeGallery}
                      aria-label={t("إغلاق المعرض", "Close gallery")}
                      className="rounded-full p-1.5 sm:p-2 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--gold-end)] transition-colors duration-300"
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
                          key={activeResult.id}
                          initial={{ opacity: 0, x: xIn(slideDir) }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: xOut(slideDir) }}
                          transition={{ duration: 0.35, ease }}
                          className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:gap-4"
                        >
                          {[activeResult.before, activeResult.after].map(
                            (photo, index) => (
                              <figure
                                className="relative"
                                key={`${activeResult.id}-${index}`}
                              >
                                <Photo
                                  slot={photo}
                                  ratio="landscape"
                                  className="!aspect-[4/3] sm:!aspect-[3/2] rounded-lg sm:rounded-xl overflow-hidden"
                                  sizes="(max-width: 640px) 100vw, 50vw"
                                />
                                <figcaption
                                  className={`absolute top-2 start-2 sm:top-3 sm:start-3 ${
                                    index === 0
                                      ? "bg-black/75"
                                      : "bg-[var(--gold-end)]/90"
                                  } rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-bold text-white backdrop-blur-sm`}
                                >
                                  {index === 0
                                    ? t("قبل", "Before")
                                    : t("بعد", "After")}
                                </figcaption>
                              </figure>
                            ),
                          )}
                        </motion.div>
                      </AnimatePresence>

                      {/* Navigation arrows — hidden on very small screens, replaced by bottom bar */}
                      <button
                        type="button"
                        onClick={() => move(rtl ? 1 : -1)}
                        aria-label={t("النتيجة السابقة", "Previous result")}
                        className="hidden sm:flex absolute start-2 top-1/2 z-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2.5 text-white backdrop-blur transition-[background-color,transform] duration-300 hover:bg-black/80 hover:scale-105"
                      >
                        {rtl ? (
                          <ChevronRight className="h-5 w-5" />
                        ) : (
                          <ChevronLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => move(rtl ? -1 : 1)}
                        aria-label={t("النتيجة التالية", "Next result")}
                        className="hidden sm:flex absolute end-2 top-1/2 z-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2.5 text-white backdrop-blur transition-[background-color,transform] duration-300 hover:bg-black/80 hover:scale-105"
                      >
                        {rtl ? (
                          <ChevronLeft className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {/* Info card */}
                    <div className="mt-2.5 sm:mt-4">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`info-${activeResult.id}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.3, ease, delay: 0.05 }}
                          className="mx-auto w-full max-w-2xl rounded-lg sm:rounded-xl border border-[var(--gold-border)]/40 bg-[var(--bg-dark)]/95 p-3 sm:p-4 lg:p-5 text-white shadow-xl backdrop-blur-md"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px]">
                            <span className="inline-flex items-center font-bold text-[var(--gold-start)] bg-[var(--gold-end)]/20 border border-[var(--gold-start)]/30 rounded-full px-2.5 py-1">
                              {t(
                                activeResult.treatment.ar,
                                activeResult.treatment.en,
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1 text-white/75 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {t(activeResult.area.ar, activeResult.area.en)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-white/75 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                              <CalendarDays className="w-3 h-3 shrink-0" />
                              {t(
                                activeResult.sessions.ar,
                                activeResult.sessions.en,
                              )}
                            </span>
                          </div>

                          <p className="mt-2.5 sm:mt-3 text-[13px] sm:text-sm leading-relaxed text-white/95 border-s-2 border-[var(--gold-start)]/50 ps-3">
                            {t(activeResult.note.ar, activeResult.note.en)}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Mobile navigation bar */}
                    <div className="sm:hidden mt-4 flex items-center justify-between gap-2 rounded-full border border-[var(--gold-border)]/40 bg-[var(--bg-card)] p-1.5">
                      <button
                        type="button"
                        onClick={() => move(rtl ? 1 : -1)}
                        aria-label={t("النتيجة السابقة", "Previous result")}
                        className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-300"
                      >
                        {rtl ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronLeft className="w-3.5 h-3.5" />
                        )}
                        {t("السابق", "Prev")}
                      </button>
                      <span className="text-[11px] font-bold text-[var(--text-muted)] tabular-nums">
                        {formatNumber(activeIndex + 1)} /{" "}
                        {formatNumber(resultsData.length)}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(rtl ? -1 : 1)}
                        aria-label={t("النتيجة التالية", "Next result")}
                        className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors duration-300"
                      >
                        {t("التالي", "Next")}
                        {rtl ? (
                          <ChevronLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
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
