"use client";

import React, { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useReducedMotion } from "framer-motion";
import { Photo } from "@/components/ui/Photo";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  frameGeometry,
  useCompareSlider,
} from "@/components/ui/compare-slider";
import { GoldLink } from "@/components/shared/Actions";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import {
  CalendarDays,
  ChevronsLeftRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoveHorizontal,
} from "lucide-react";

interface Localized {
  ar: string;
  en: string;
}

/**
 * One case, as the results row states it.
 *
 * `pair` is not optional here even though a stored row can hold a half: the server reader has
 * already dropped every case that cannot be compared, because a slider with one photograph is
 * a claim about a before nobody took. This component therefore never draws a missing picture,
 * and never asks what to do about one.
 */
export interface HomeCompareCase {
  key: string;
  headline: Localized;
  area: Localized;
  sessions: Localized;
  caption: Localized;
  pair: {
    before: string;
    after: string;
    beforeAlt: Localized;
    afterAlt: Localized;
  };
}

interface ResultCompareSectionProps {
  cases: HomeCompareCase[];
  /** The numeral the band carries in Home's editorial sequence. */
  index?: string;
}

/**
 * Before/after comparison on the home page, built only from cases the console published.
 *
 * The band it replaces — the one the original site shipped — held two hard-coded pictures, a
 * pair of files that did not exist, and a handle that could only be dragged. Here the pictures
 * come from a result row, the handle is a slider a keyboard and a screen reader can use, the
 * drag works in both reading directions, and with nothing eligible the band renders no markup
 * at all rather than an empty section and its padding.
 */
export const ResultCompareSection: React.FC<ResultCompareSectionProps> = ({
  cases,
  index,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const reduce = useReducedMotion();
  const rtl = language === "ar";
  const [position, setPosition] = useState(0);
  const slider = useCompareSlider(rtl);

  // Nothing eligible, nothing drawn: not an empty section, not its padding, not a heading
  // over a hole where a photograph should be.
  if (cases.length === 0) return null;

  const current = cases[position];

  const show = (next: number) => {
    slider.reset();
    setPosition((next + cases.length) % cases.length);
  };

  return (
    <section id="before-after" className="py-4 lg:py-12 bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index={index}
            title={{
              ar: "قبل وبعد، من ملفات الحالات",
              en: "Before and after, from the cases themselves",
            }}
            lead={{
              ar: "كل حالة بصورتَيها من الجلسة: ما كان، وما صار. تتفاوت النتيجة من بشرة لأخرى، ولا تُعرض حالة إلا بصورتَيها.",
              en: "Each case carries its own two pictures: what was there, and what the sessions left. Results vary from one skin to another, and no case shows with fewer than both.",
            }}
          />
          <GoldLink href="/results" withArrow size="sm" className="mb-1">
            {t("كل النتائج", "All results")}
          </GoldLink>
        </div>

        <div className="mt-5 lg:mt-8 grid lg:grid-cols-12 gap-6 lg:gap-10 items-start">
          {/* The comparison. Its aspect ratio lives on the frame, before either picture has
              loaded, which is what keeps the band from shifting the page as photography arrives. */}
          <div className="lg:col-span-8 min-w-0">
            <div
              {...slider.frameProps}
              className={`${slider.frameProps.className} w-full aspect-[4/3] sm:aspect-[16/10] rounded-2xl overflow-hidden border border-[var(--gold-border)] bg-[var(--bg-secondary)]`}
            >
              <div className="absolute inset-0">
                <Photo
                  slot={toPhotoSlot(current.pair.after, current.pair.afterAlt)}
                  className="!aspect-auto h-full w-full"
                  sizes="(max-width: 1024px) 92vw, 900px"
                  imgClassName={
                    reduce
                      ? undefined
                      : "transition-transform duration-fade ease-out"
                  }
                />
                <span className="absolute bottom-3 end-3 rounded-full bg-[var(--bg-dark)]/80 px-3 py-1 text-[11px] font-bold text-[var(--text-on-dark)] pointer-events-none">
                  {t("بعد", "After")}
                </span>
              </div>

              <div
                className="absolute inset-0"
                style={{
                  clipPath: frameGeometry(slider.progress, rtl).clipPath,
                }}
              >
                <div className="absolute inset-0">
                  <Photo
                    slot={toPhotoSlot(
                      current.pair.before,
                      current.pair.beforeAlt,
                    )}
                    className="!aspect-auto h-full w-full"
                    sizes="(max-width: 1024px) 92vw, 900px"
                  />
                  <span className="absolute bottom-3 start-3 rounded-full bg-[var(--bg-dark)]/80 px-3 py-1 text-[11px] font-bold text-[var(--text-on-dark)] pointer-events-none">
                    {t("قبل", "Before")}
                  </span>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-0.5 bg-[var(--bg-card)] shadow-[0_0_12px_var(--gold-glow)] pointer-events-none"
                style={frameGeometry(slider.progress, rtl).line}
              />

              {/* One control, named by what it changes. `aria-valuenow` counts the before
                  picture, so the number a screen reader gives is the share of the older
                  photograph still on screen. */}
              <div
                {...slider.handleProps}
                aria-label={t(
                  "اسحبي لمقارنة صورة قبل بصورة بعد",
                  "Drag to compare the before picture with the after picture",
                )}
                aria-valuetext={t(
                  "{0}٪ من صورة قبل",
                  "{0}% of the before picture",
                  formatNumber(slider.percent),
                )}
                className="absolute top-1/2 z-10 flex h-11 w-11 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-gold-gradient shadow-[var(--elev-2)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={frameGeometry(slider.progress, rtl).handle}
              >
                <ChevronsLeftRight className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-[var(--text-muted)]">
              <MoveHorizontal
                className="h-3.5 w-3.5 shrink-0 text-[var(--text-gold)]"
                aria-hidden="true"
              />
              <span dir="auto">
                {t(
                  "اسحبي المقبض، أو اضغطي عليه ثم استخدمي الأسهم، لتحريك الخط بين الصورتين.",
                  "Drag the handle, or focus it and use the arrow keys, to move the line between the two pictures.",
                )}
              </span>
            </p>

            {cases.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => show(position - 1)}
                  aria-label={t("الحالة السابقة", "Previous case")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-control)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] outline-none"
                >
                  {rtl ? (
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                <span
                  className="text-xs font-bold text-[var(--text-muted)]"
                  dir="auto"
                >
                  {t(
                    "الحالة {0} من {1}",
                    "Case {0} of {1}",
                    formatNumber(position + 1),
                    formatNumber(cases.length),
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => show(position + 1)}
                  aria-label={t("الحالة التالية", "Next case")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-control)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] outline-none"
                >
                  {rtl ? (
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* What the case says about itself. Every word here is the row's own: a headline,
              the part that was treated, how many sessions it took, and the line the owner
              asked for under the pictures. */}
          <div className="lg:col-span-4 min-w-0">
            <h3
              className="text-lg sm:text-xl font-black leading-tight text-[var(--text-primary)]"
              dir="auto"
            >
              {t(current.headline.ar, current.headline.en)}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(current.area.ar || current.area.en) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-control)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
                  <MapPin
                    className="h-3.5 w-3.5 text-[var(--text-gold)]"
                    aria-hidden="true"
                  />
                  <span dir="auto">{t(current.area.ar, current.area.en)}</span>
                </span>
              )}
              {(current.sessions.ar || current.sessions.en) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-control)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
                  <CalendarDays
                    className="h-3.5 w-3.5 text-[var(--text-gold)]"
                    aria-hidden="true"
                  />
                  <span dir="auto">
                    {t(current.sessions.ar, current.sessions.en)}
                  </span>
                </span>
              )}
            </div>
            {(current.caption.ar || current.caption.en) && (
              <p
                className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]"
                dir="auto"
              >
                {t(current.caption.ar, current.caption.en)}
              </p>
            )}
            {cases.length > 1 && (
              <ul className="mt-5 flex flex-wrap gap-2" role="list">
                {cases.map((item, item_position) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => show(item_position)}
                      aria-current={item_position === position}
                      aria-label={t(
                        "اعرض حالة: {0}",
                        "Show case: {0}",
                        t(item.headline.ar, item.headline.en),
                      )}
                      className={`h-2.5 w-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                        item_position === position
                          ? "bg-gold-gradient"
                          : "bg-[var(--border-control)] hover:bg-[var(--border-control-soft)]"
                      }`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
