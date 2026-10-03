"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import type { PhotoSlot } from "@/lib/images";

interface LText {
  ar: string;
  en: string;
}

interface PageHeroProps {
  index?: string;
  title: LText;
  lead?: LText;
  breadcrumbs: Crumb[];
  photo?: PhotoSlot;
  variant?: "split" | "band";
}

export const PageHero: React.FC<PageHeroProps> = ({
  index,
  title,
  lead,
  breadcrumbs,
  photo,
  variant = "split",
}) => {
  const { t } = useLanguage();

  return (
    <header className="relative bg-[var(--bg-primary)] border-b border-[var(--gold-border)]/25">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 lg:pt-10 lg:pb-16">
        <Breadcrumbs items={breadcrumbs} />

        {variant === "split" ? (
          <div className="mt-8 lg:mt-14 grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">
            <div className={photo ? "lg:col-span-7" : "lg:col-span-9"}>
              <Reveal>
                {index && (
                  <div className="flex items-baseline gap-4 mb-4">
                    <span className="text-4xl sm:text-5xl font-black text-[var(--gold-end)] tabular-nums leading-none">
                      {index}
                    </span>
                    <span className="h-px flex-1 max-w-[80px] bg-[var(--gold-mid)]/40" />
                  </div>
                )}
                <h1 className="text-[28px] sm:text-4xl lg:text-[52px] font-black tracking-tight leading-[1.06] text-[var(--text-primary)]">
                  {t(title.ar, title.en)}
                </h1>
                {lead && (
                  <p className="mt-5 text-[14px] sm:text-base lg:text-lg leading-relaxed text-[var(--text-secondary)] max-w-xl border-s-2 border-[var(--gold-mid)]/30 ps-4">
                    {t(lead.ar, lead.en)}
                  </p>
                )}
              </Reveal>
            </div>
            {photo && (
              <div className="lg:col-span-5">
                <Reveal delay={0.1} direction="start">
                  <Photo
                    slot={photo}
                    ratio="landscape"
                    curtain
                    className="rounded-2xl shadow-lg"
                    sizes="(max-width:1024px) 100vw, 40vw"
                  />
                </Reveal>
              </div>
            )}
          </div>
        ) : (
          <>
            <Reveal className="mt-8 lg:mt-14 max-w-3xl">
              {index && (
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="text-4xl sm:text-5xl font-black text-[var(--gold-end)] tabular-nums leading-none">
                    {index}
                  </span>
                  <span className="h-px flex-1 max-w-[80px] bg-[var(--gold-mid)]/40" />
                </div>
              )}
              <h1 className="text-[28px] sm:text-4xl lg:text-[52px] font-black tracking-tight leading-[1.06] text-[var(--text-primary)]">
                {t(title.ar, title.en)}
              </h1>
              {lead && (
                <p className="mt-5 text-[14px] sm:text-base lg:text-lg leading-relaxed text-[var(--text-secondary)] max-w-2xl border-s-2 border-[var(--gold-mid)]/30 ps-4">
                  {t(lead.ar, lead.en)}
                </p>
              )}
            </Reveal>
            {photo && (
              <Reveal delay={0.12} className="mt-10 lg:mt-14">
                <Photo
                  slot={photo}
                  ratio="wide"
                  curtain
                  className="rounded-2xl shadow-lg"
                  sizes="100vw"
                />
              </Reveal>
            )}
          </>
        )}
      </div>
    </header>
  );
};
