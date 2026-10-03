"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { clinicData } from "@/data/clinic";
import { images } from "@/lib/images";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";
import { Calendar, MessageCircle, Phone } from "lucide-react";

interface LocalizedText {
  ar: string;
  en: string;
}

interface CtaBandProps {
  title?: LocalizedText;
  lead?: LocalizedText;
  compact?: boolean;
}

export const CtaBand: React.FC<CtaBandProps> = ({
  title,
  lead,
  compact = false,
}) => {
  const { t, language } = useLanguage();
  const { openBooking } = useBooking();

  const heading = title ?? {
    ar: "جاهزة تبدأي رحلتكِ نحو بشرة أجمل؟",
    en: "Ready to begin your journey to healthier skin?",
  };
  const sub = lead ?? {
    ar: "احجزي استشارتكِ اليوم في أقرب فرع، أو تحدثي معنا مباشرة عبر واتساب.",
    en: "Book your consultation at the nearest branch, or message us on WhatsApp.",
  };

  const whatsappUrl = `https://wa.me/201121880908?text=${encodeURIComponent(
    language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات."
      : "Hello Shamah Clinics, I would like to inquire about appointments.",
  )}`;

  return (
    <section className="relative overflow-hidden bg-[var(--bg-dark)]">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 items-stretch">
          {/* Image side */}
          <div className="relative h-64 sm:h-80 lg:h-auto lg:min-h-[420px] order-1 lg:order-none">
            <Photo
              slot={images.interiors.consultation}
              ratio="landscape"
              className="!aspect-auto absolute inset-0"
              imgClassName="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {/* Gold accent line */}
            <div className="absolute inset-y-0 end-0 w-px bg-gradient-to-b from-transparent via-[var(--gold-mid)]/40 to-transparent hidden lg:block" />
          </div>

          {/* Content side */}
          <div
            className={`flex flex-col justify-center px-6 sm:px-10 lg:px-14 ${
              compact ? "py-5 lg:py-12" : "py-12 lg:py-16"
            }`}
          >
            <Reveal>
              <span className="inline-block text-[10px] font-bold tracking-[0.3em] uppercase text-[var(--gold-start)] mb-4">
                {t("استشارة مجانية", "Free consultation")}
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-[1.15]">
                {t(heading.ar, heading.en)}
              </h2>
              <p className="mt-4 text-sm sm:text-base text-white/65 leading-relaxed max-w-lg">
                {t(sub.ar, sub.en)}
              </p>
            </Reveal>

            <Reveal
              delay={0.12}
              className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <button
                onClick={() => openBooking()}
                className="bg-gold-gradient text-white font-bold text-sm px-4 py-3.5 rounded-full shadow-lg hover:-translate-y-0.5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>{t("احجزي موعدك", "Book Appointment")}</span>
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-transparent border border-white/25 text-white font-semibold text-sm px-6 py-3.5 rounded-full hover:bg-white/10 transition-colors duration-300 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>{t("واتساب", "WhatsApp")}</span>
              </a>
              <Reveal delay={0.2}>
                <a
                  href={`tel:${clinicData.phone.replace(/\s/g, "")}`}
                  className="bg-transparent border border-white/25 text-white font-semibold text-sm px-6 py-3.5 rounded-full hover:bg-white/10 transition-colors duration-300 flex items-center justify-center gap-2"
                  dir="ltr"
                >
                  <Phone className="w-4 h-4 text-[var(--gold-start)]" />
                  <span>{clinicData.phone}</span>
                </a>
              </Reveal>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
};
