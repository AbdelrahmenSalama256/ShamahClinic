"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { images } from "@/data/images";
import { Sparkles, ChevronsLeftRight } from "lucide-react";

export const BeforeAfterSection: React.FC = () => {
  const { t } = useLanguage();
  const [sliderPosition, setSliderPosition] = useState(50); // percentage 0 to 100
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;
    let percent = (x / width) * 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    
    // In RTL, 0% on left is actually the "after" or "before" depending on orientation.
    // Let's make it consistent regardless of dir:
    setSliderPosition(percent);
  }, []);

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    handleMove(e.clientX);
  };

  const handleStart = () => {
    isDragging.current = true;
  };

  const handleEnd = () => {
    isDragging.current = false;
  };

  return (
    <section id="before-after" className="py-20 lg:py-28 bg-[var(--bg-primary)] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[var(--gold-border)] text-xs font-bold text-[var(--gold-end)] mb-4 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[var(--gold-mid)]" />
            <span>{t("نتائج حقيقية ملموسة", "Real Aesthetic Results")}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4 tracking-tight">
            {t("الفرق يتحدث عن", "The Transformation Speaks")}{" "}
            <span className="text-gold-gradient">{t("نفسه بوضوح", "For Itself")}</span>
          </h2>

          <p className="text-base text-[var(--text-secondary)] leading-relaxed">
            {t(
              "نؤمن في عيادات شامه بأن أجمل النتائج هي الأكثر طبيعية. شاهدي الفرق الملموس في نضارة وشد البشرة قبل وبعد الجلسات المتخصصة.",
              "We believe true aesthetic mastery lies in natural enhancement. Witness the radiant change in skin firmness, luminosity, and texture before and after treatment."
            )}
          </p>
        </div>

        {/* Interactive Comparison Slider */}
        <div className="max-w-4xl mx-auto">
          <div
            ref={containerRef}
            className="relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden shadow-2xl border-2 border-[var(--gold-border)] select-none cursor-ew-resize bg-[#FAF7F2]"
            onMouseDown={(e) => {
              handleStart();
              handleMove(e.clientX);
            }}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onMouseMove={handleMouseMove}
            onTouchStart={(e) => {
              handleStart();
              handleMove(e.touches[0].clientX);
            }}
            onTouchEnd={handleEnd}
            onTouchMove={handleTouchMove}
          >
            {/* Base Layer: AFTER Image (Full container) */}
            <div className="absolute inset-0 w-full h-full">
              <Image
                src={images.beforeAfter.skinGlow.after}
                alt="After treatment radiant skin result"
                fill
                priority
                className="object-cover"
                draggable={false}
              />
              <span className="absolute bottom-6 end-6 bg-[var(--gold-mid)] text-white text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full shadow-md backdrop-blur-sm z-10 pointer-events-none">
                {t("بعد الجلسة ✦ توهج ونضارة", "After ✦ Radiant Glow")}
              </span>
            </div>

            {/* Clipped Layer: BEFORE Image */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                clipPath: `polygon(0% 0%, ${sliderPosition}% 0%, ${sliderPosition}% 100%, 0% 100%)`,
              }}
            >
              <div className="relative w-full h-full">
                <Image
                  src={images.beforeAfter.skinGlow.before}
                  alt="Before treatment skin condition"
                  fill
                  priority
                  className="object-cover"
                  draggable={false}
                />
                <span className="absolute bottom-6 start-6 bg-[var(--bg-dark)]/80 text-white text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full shadow-md backdrop-blur-sm z-10 pointer-events-none">
                  {t("قبل الجلسة", "Before")}
                </span>
              </div>
            </div>

            {/* Vertical Divider Line with Glow */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_15px_rgba(201,162,39,0.9)] z-20 pointer-events-none"
              style={{ left: `${sliderPosition}%` }}
            >
              {/* Circular Drag Handle */}
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-gold-gradient border-2 border-white shadow-xl flex items-center justify-center text-white cursor-pointer pointer-events-auto hover:scale-110 transition-transform">
                <ChevronsLeftRight className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          {/* Slider helper hint */}
          <div className="text-center mt-5 text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--gold-mid)] animate-ping" />
            <span>{t("اسحبي المقبض يميناً ويساراً لمقارنة النتيجة بوضوح", "Drag the handle left or right to compare results")}</span>
          </div>
        </div>

      </div>
    </section>
  );
};
