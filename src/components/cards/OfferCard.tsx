"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { whatsappHref } from "@/components/shared/Actions";
import type { Offer } from "@/data/offers";
import { Check, Calendar, MessageCircle } from "lucide-react";

export const OfferCard: React.FC<{ offer: Offer }> = ({ offer }) => {
  const { t, language, formatNumber } = useLanguage();
  const { openBooking } = useBooking();

  const waMsg =
    language === "ar"
      ? `مرحباً عيادات شامه، أرغب في حجز عرض: ${offer.title.ar}.`
      : `Hello Shamah Clinics, I would like to book the offer: ${offer.title.en}.`;

  return (
    <article
      className={`relative flex flex-col h-full rounded-2xl border bg-[var(--bg-card)] overflow-hidden transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 hover:shadow-xl ${
        offer.popular ? "border-[var(--gold-mid)] shadow-lg" : "border-[var(--gold-border)]/50"
      }`}
    >
      {offer.popular && (
        <div className="bg-gold-gradient text-white text-xs font-bold text-center py-2">
          {t(offer.badge.ar, offer.badge.en)}
        </div>
      )}
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        {!offer.popular && (
          <span className="text-xs font-bold text-[var(--gold-end)] tracking-wide">
            {t(offer.badge.ar, offer.badge.en)}
          </span>
        )}
        <h3 className="mt-2 text-base sm:text-lg font-black text-[var(--text-primary)] leading-snug">
          {t(offer.title.ar, offer.title.en)}
        </h3>
        <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          {t(offer.subtitle.ar, offer.subtitle.en)}
        </p>

        <ul className="mt-4 space-y-2 flex-1">
          {offer.includes[language].map((inc) => (
            <li key={inc} className="flex items-start gap-2 text-xs sm:text-sm text-[var(--text-primary)]">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
              <span>{inc}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-4 border-t border-[var(--gold-border)]/40">
          <div className="flex items-end gap-3">
            <span className="text-2xl sm:text-3xl font-black text-[var(--gold-end)]">
              {formatNumber(offer.discountedPrice)}
              <span className="text-base font-bold ms-1">{t("ج.م", "EGP")}</span>
            </span>
            <span className="text-sm text-[var(--text-muted)] line-through mb-1">
              {formatNumber(offer.originalPrice)}
            </span>
            <span className="ms-auto mb-1 text-xs font-bold text-white bg-emerald-700 rounded-full px-2.5 py-1">
              {t("وفّري", "Save")} {formatNumber(offer.savingsPercentage)}٪
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t(offer.validUntil.ar, offer.validUntil.en)}</p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => openBooking()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient text-white font-bold text-sm py-3 hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>{t("احجزي العرض", "Book Offer")}</span>
            </button>
            <a
              href={whatsappHref(language, waMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-emerald-600/40 text-emerald-700 font-bold text-sm py-3 hover:bg-emerald-50 transition-[background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{t("استفسري", "Ask")}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
