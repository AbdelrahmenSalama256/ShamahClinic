"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "@/components/ui/Reveal";
import { BookButton, GoldLink } from "@/components/shared/Actions";
import {
  Home,
  Sparkles,
  MapPin,
  BookOpen,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

const destinations = [
  {
    href: "/",
    icon: Home,
    label: { ar: "الرئيسية", en: "Home" },
    description: { ar: "ابدئي من جديد", en: "Start over" },
  },
  {
    href: "/treatments",
    icon: Sparkles,
    label: { ar: "خدماتنا", en: "Treatments" },
    description: { ar: "اكتشفي جلساتنا", en: "Explore our services" },
  },
  {
    href: "/branches",
    icon: MapPin,
    label: { ar: "الفروع", en: "Branches" },
    description: { ar: "الأقرب إليكِ", en: "Find us near you" },
  },
  {
    href: "/blogs",
    icon: BookOpen,
    label: { ar: "المقالات", en: "Journal" },
    description: { ar: "مقالات طبية", en: "Medical articles" },
  },
];

export const NotFoundClient: React.FC = () => {
  const { t, language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  return (
    <section className="relative overflow-hidden bg-[var(--bg-dark)] min-h-[80vh] flex items-center">
      {/* Decorative glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -end-40 w-[500px] h-[500px] rounded-full bg-[var(--gold-mid)]/15 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -start-40 w-[400px] h-[400px] rounded-full bg-[var(--gold-mid)]/10 blur-[120px]"
      />

      {/* Giant faint 404 in the background */}
      <span
        aria-hidden="true"
        className="pointer-events-none select-none absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 text-[280px] sm:text-[420px] lg:text-[560px] font-black leading-none text-white/[0.035] tabular-nums"
      >
        404
      </span>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 w-full">
        {/* Centered content */}
        <div className="max-w-2xl mx-auto text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 text-[30px] sm:text-xs font-bold uppercase tracking-[0.3em] text-[var(--gold-start)] mb-6 px-4 py-1.5 rounded-full border border-[var(--gold-start)]/30 bg-[var(--gold-start)]/5">
              <span className="text-[var(--gold-start)] text-[30px]">
                {t("خطأ ٤٠٤", "Error 404")}
              </span>
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="text-[32px] sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-white">
              {t("يبدو أن هذه الصفحة", "This page")}
              <br />
              <span className="text-[var(--gold-start)]">
                {t("غير موجودة", "doesn't exist")}
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-6 text-sm sm:text-base lg:text-lg leading-relaxed text-white/65 max-w-xl mx-auto">
              {t(
                "ربما تغيّر الرابط أو كُتب بطريقة مختلفة. لا تقلقي، كل خدماتنا ومحتوانا في مكانه — اختاري وجهة من الأسفل.",
                "The link may have changed or been typed differently. Nothing is lost — pick a destination below to continue.",
              )}
            </p>
          </Reveal>

          <Reveal
            delay={0.15}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <GoldLink href="/" withArrow>
              {t("العودة للرئيسية", "Back to Home")}
            </GoldLink>
            <BookButton />
          </Reveal>
        </div>

        {/* Destination cards */}
        <Reveal delay={0.2} className="mt-16 lg:mt-20">
          <p className="text-center text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-6">
            {t("أو تصفّحي هذه الوجهات", "Or explore these destinations")}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {destinations.map((d, i) => {
              const Icon = d.icon;
              return (
                <Link
                  key={d.href}
                  href={d.href}
                  className="group relative flex flex-col items-start gap-3 p-5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[var(--gold-start)]/40 hover:-translate-y-1 transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] backdrop-blur-sm"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--gold-start)]/10 border border-[var(--gold-start)]/30 flex items-center justify-center group-hover:bg-[var(--gold-start)]/20 transition-colors duration-300">
                    <Icon className="w-4 h-4 text-[var(--gold-start)]" />
                  </div>

                  <div className="min-w-0">
                    <span className="block text-sm font-black text-white group-hover:text-[var(--gold-start)] transition-colors duration-300">
                      {t(d.label.ar, d.label.en)}
                    </span>
                    <span className="block text-[11px] text-white/50 mt-0.5">
                      {t(d.description.ar, d.description.en)}
                    </span>
                  </div>

                  <Arrow className="absolute top-5 end-5 w-3.5 h-3.5 text-white/30 group-hover:text-[var(--gold-start)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-[transform,color] duration-300" />
                </Link>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
};
