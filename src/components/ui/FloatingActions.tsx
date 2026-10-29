"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { useClinic } from "@/context/ClinicContext";
import { MessageCircle, Calendar, Phone } from "lucide-react";

/**
 * Conversion affordances: a single floating WhatsApp bubble on desktop
 * (corner-anchored so it never overlaps body text) and a sticky action bar
 * on mobile.
 */
export const FloatingActions: React.FC = () => {
  const { language, t } = useLanguage();
  const clinic = useClinic();
  const { openBooking, isBookingOpen } = useBooking();

  // The wizard owns the screen once it is open; two stacked CTAs compete for
  // the same thumb reach and the bubble ends up under the modal.
  if (isBookingOpen) return null;

  const whatsappUrl = `${clinic.whatsappUrl}?text=${encodeURIComponent(
    language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات المتاحة لديكم."
      : "Hello Shamah Clinics, I would like to inquire about appointments and services.",
  )}`;

  return (
    <>
      <aside
        aria-label={t("تواصل سريع", "Quick contact")}
        className="fixed bottom-[calc(var(--floating-control-gap)+env(safe-area-inset-bottom))] start-6 z-[45] hidden sm:block"
      >
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex w-14 h-14 rounded-full bg-[var(--btn-wa-solid-bg)] text-[var(--btn-wa-solid-fg)] shadow-xl items-center justify-center hover:bg-[var(--btn-wa-solid-bg-hover)] hover:text-[var(--btn-wa-solid-fg-hover)] hover:scale-105 transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
          aria-label={t("تواصل عبر واتساب", "Chat on WhatsApp")}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="pointer-events-none p-3 border border-[var(--border-on-dark)] transition-colors duration-300 absolute start-16 bg-[var(--bg-dark)] text-[var(--text-on-dark)] text-xs font-bold py-1.5 px-3 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {t("تواصلي معنا عبر واتساب", "Chat on WhatsApp")}
          </span>
        </a>
      </aside>

      {/* Mobile sticky action bar */}
      <div className="sm:hidden fixed bottom-0 start-0 end-0 z-[45] bg-[var(--bg-card)]/95 backdrop-blur-md border-t border-[var(--gold-border)] p-3 shadow-2xl flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-[var(--btn-wa-solid-bg)] text-[var(--btn-wa-solid-fg)] font-bold text-xs py-3 px-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{t("واتساب", "WhatsApp")}</span>
        </a>
        <button
          onClick={() => openBooking()}
          data-cta="floating-bar"
          className="flex-[2] bg-gold-gradient font-bold text-xs py-3 px-4 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          <span>{t("احجزي موعدكِ الآن", "Book Appointment")}</span>
        </button>
        <a
          href={`tel:${clinic.phone.replace(/\s/g, "")}`}
          className="w-11 h-11 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-gold)] border border-[var(--border-control)] flex items-center justify-center shrink-0"
          aria-label={t("اتصال بالعيادة", "Call clinic")}
        >
          <Phone className="w-4 h-4" />
        </a>
      </div>
    </>
  );
};
