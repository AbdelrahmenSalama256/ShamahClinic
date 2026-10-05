"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { clinicData } from "@/data/clinic";
import { MessageCircle, Calendar, Phone } from "lucide-react";

/**
 * Conversion affordances: a single floating WhatsApp bubble on desktop
 * (corner-anchored so it never overlaps body text) and a sticky action bar
 * on mobile.
 */
export const FloatingActions: React.FC = () => {
  const { language, t } = useLanguage();
  const { openBooking } = useBooking();

  const whatsappUrl = `${clinicData.whatsappUrl}?text=${encodeURIComponent(
    language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات المتاحة لديكم."
      : "Hello Shamah Clinics, I would like to inquire about appointments and services.",
  )}`;

  return (
    <>
      <aside
        aria-label={t("تواصل سريع", "Quick contact")}
        className="fixed bottom-6 start-6 z-40 hidden sm:block"
      >
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex w-14 h-14 rounded-full bg-emerald-700 text-white shadow-xl items-center justify-center hover:bg-emerald-800 hover:scale-105 transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
          aria-label={t("تواصل عبر واتساب", "Chat on WhatsApp")}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="pointer-events-none p-3 border border-white/20 hover:border-[var(--gold-border)] transition-colors duration-300 absolute start-16 bg-[var(--bg-dark)] text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {t("تواصلي معنا عبر واتساب", "Chat on WhatsApp")}
          </span>
        </a>
      </aside>

      {/* Mobile sticky action bar */}
      <div className="sm:hidden fixed bottom-0 start-0 end-0 z-40 bg-white/95 backdrop-blur-md border-t border-[var(--gold-border)] p-3 shadow-2xl flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-emerald-700 text-white font-bold text-xs py-3 px-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{t("واتساب", "WhatsApp")}</span>
        </a>
        <button
          onClick={() => openBooking()}
          className="flex-[2] bg-gold-gradient text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          <span>{t("احجزي موعدكِ الآن", "Book Appointment")}</span>
        </button>
        <a
          href={`tel:${clinicData.phone.replace(/\s/g, "")}`}
          className="w-11 h-11 rounded-xl bg-gray-100 text-[var(--gold-end)] border border-[var(--gold-border)] flex items-center justify-center shrink-0"
          aria-label={t("اتصال بالعيادة", "Call clinic")}
        >
          <Phone className="w-4 h-4" />
        </a>
      </div>
    </>
  );
};
