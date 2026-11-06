"use client";

import React, { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SwiperProps {
  slides: React.ReactNode[];
  label: { ar: string; en: string };

  autoPlayMs?: number;
  loop?: boolean;
  mobilePerView?: number;
  tabletPerView?: number;
  desktopPerView?: number;

  showArrows?: boolean;
  showDots?: boolean;

  gap?: number;
}

const usePerView = (
  mobilePerView: number,
  tabletPerView: number,
  desktopPerView: number,
) => {
  const [perView, setPerView] = useState(desktopPerView);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 639px)");
    const tablet = window.matchMedia("(max-width: 1023px)");

    const update = () => {
      setPerView(
        mobile.matches
          ? mobilePerView
          : tablet.matches
            ? tabletPerView
            : desktopPerView,
      );
    };

    update();

    mobile.addEventListener("change", update);
    tablet.addEventListener("change", update);

    return () => {
      mobile.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, [mobilePerView, tabletPerView, desktopPerView]);

  return perView;
};

export const Swiper: React.FC<SwiperProps> = ({
  slides,
  autoPlayMs = 4000,
  
  mobilePerView = 1,
  tabletPerView = 2,
  desktopPerView = 3,

  showArrows = true,
  showDots = true,

  gap = 12,

  label,
}) => {
  const { t, direction } = useLanguage();
  const reduce = useReducedMotion();

  const perView = usePerView(mobilePerView, tabletPerView, desktopPerView);

  const [rawIndex, setRawIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const maxIndex = Math.max(0, slides.length - perView);
  // Derived, not synced by an effect: a resize can shrink maxIndex mid-render.
  const index = Math.min(rawIndex, maxIndex);
  const goTo = (next: number) => setRawIndex(Math.max(0, Math.min(next, maxIndex)));

  useEffect(() => {
    if (reduce || paused || autoPlayMs === 0 || maxIndex === 0) {
      return;
    }

    const id = setInterval(() => {
      setRawIndex((current) => {
        const clamped = Math.min(current, maxIndex);
        return clamped >= maxIndex ? 0 : clamped + 1;
      });
    }, autoPlayMs);

    return () => clearInterval(id);
  }, [reduce, paused, autoPlayMs, maxIndex]);

  const slideWidth = 100 / perView;

  const offset = (direction === "rtl" ? 1 : -1) * index * slideWidth;

  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight;

  const PrevIcon = direction === "rtl" ? ChevronRight : ChevronLeft;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={t(label.ar, label.en)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-reveal ease-brand"
          style={{
            transform: `translateX(${offset}%)`,
            transitionDuration: reduce ? "0ms" : undefined,
          }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="shrink-0"
              style={{
                width: `${slideWidth}%`,
                paddingLeft: `${gap / 2}px`,
                paddingRight: `${gap / 2}px`,
              }}
              aria-hidden={i < index || i >= index + perView}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {/* Every slide already fits the row, so there is nothing to page through:
          the controls would render as dead buttons (and cost the band their height). */}
      {(showArrows || showDots) && maxIndex > 0 && (
        <div className="mt-5 flex items-center justify-center gap-4">
          {showArrows && (
            <button
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label={t("السابق", "Previous")}
              className="p-2 rounded-full border border-[var(--border-control)] text-[var(--text-secondary)] hover:text-[var(--text-gold)] hover:border-[var(--border-control)] disabled:opacity-40 disabled:pointer-events-none transition-[color,border-color] duration-hover ease-brand cursor-pointer"
            >
              <PrevIcon className="w-4 h-4" />
            </button>
          )}

          {showDots && (
            <div className="flex items-center gap-2">
              {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={t(
                    "الانتقال إلى المجموعة {0}",
                    "Go to group {0}",
                    i + 1,
                  )}
                  aria-current={i === index}
                  // Padding + background-clip keeps the dot the same size and the
                  // row the same height while the tap target reaches 24x24.
                  className={`-m-2 h-6 p-2 bg-clip-content rounded-full transition-[width,background-color] duration-hover ease-brand cursor-pointer ${
                    i === index
                      ? "w-10 bg-[var(--text-gold)]"
                      : "w-6 bg-[var(--border-control)] hover:bg-[var(--gold-mid)]/60"
                  }`}
                />
              ))}
            </div>
          )}

          {showArrows && (
            <button
              onClick={() => goTo(index + 1)}
              disabled={index === maxIndex}
              aria-label={t("التالي", "Next")}
              className="p-2 rounded-full border border-[var(--border-control)] text-[var(--text-secondary)] hover:text-[var(--text-gold)] hover:border-[var(--border-control)] disabled:opacity-40 disabled:pointer-events-none transition-[color,border-color] duration-hover ease-brand cursor-pointer"
            >
              <NextIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
