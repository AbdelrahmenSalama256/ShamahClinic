"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { useWhatsappHref } from "@/components/shared/Actions";
import { Photo } from "@/components/ui/Photo";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { getLocalizedHref } from "@/lib/locale";
import type { Offer } from "@/data/offers";
import { Check, Calendar } from "lucide-react";
import { OfferCountdown } from "./OfferCountdown";

export const OfferCard: React.FC<{ offer: Offer }> = ({ offer }) => {
  const { t, language, formatNumber } = useLanguage();
  const waHref = useWhatsappHref();
  const { openBooking } = useBooking();

  const badge = t(offer.badge.ar, offer.badge.en);
  const currency = offer.currency || t("ج.م", "EGP");
  const title = t(offer.title.ar, offer.title.en);
  const subtitle = t(offer.subtitle.ar, offer.subtitle.en);
  const includes = offer.includes[language] || [];
  const validUntil = t(offer.validUntil.ar, offer.validUntil.en);
  // A WooCommerce product can carry no price at all, and then the card shows its
  // booking action instead of a "0 EGP" line.
  const hasPrice = Number(offer.discountedPrice) > 0;

  const waMsg =
    language === "ar"
      ? `مرحباً عيادات شامه، أرغب في حجز عرض: ${offer.title.ar}.`
      : `Hello Shamah Clinics, I would like to book the offer: ${offer.title.en}.`;

  return (
    <article
      className={`group relative flex flex-col h-full rounded-2xl border bg-[var(--bg-card)] overflow-hidden transition-[transform,box-shadow] duration-hover ease-brand hover:-translate-y-1 hover:shadow-xl ${
        offer.popular ? "border-[var(--border-control)] shadow-lg" : "border-[var(--border-control)]"
      }`}
    >
      {offer.popular && badge && (
        <div className="bg-gold-gradient text-xs font-bold text-center py-2">
          {badge}
        </div>
      )}
      {/* The product's first image, shown the way the service and journal cards
          show theirs. A store row that carries no image gets the brand frame, not
          a broken one. */}
      <div className="relative overflow-hidden">
        <Photo
          slot={offer.image}
          ratio="landscape"
          imgClassName="group-hover:scale-105 transition-transform duration-reveal ease-brand"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
        />
      </div>
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        {!offer.popular && badge ? (
          <span className="text-xs font-bold text-[var(--gold-end)] tracking-wide">
            {badge}
          </span>
        ) : null}
        <h3 className="mt-2 text-base sm:text-lg font-black text-[var(--text-primary)] leading-snug line-clamp-3" dir="auto">
          {/* The detail page carries the package terms parsed from WordPress, so the
              title links to it exactly like a journal card. */}
          <Link
            href={getLocalizedHref(offer.href[language], language)}
            className="hover:text-[var(--gold-end)] transition-colors duration-hover"
          >
            {title}
          </Link>
        </h3>
        {subtitle ? (
          <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2" dir="auto">
            {subtitle}
          </p>
        ) : null}

        {!!includes.length && (
          <ul className="mt-4 space-y-2 flex-1">
            {includes.map((inc) => (
              <li key={inc} className="flex items-start gap-2 text-xs sm:text-sm text-[var(--text-primary)]">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-gold)]" />
                <span dir="auto">{inc}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`pt-4 border-t border-[var(--border-control)] ${includes.length ? "mt-4" : "mt-auto"}`}>
          <div className="flex items-end gap-3">
            {hasPrice ? (
              <span className="text-2xl sm:text-3xl font-black text-[var(--gold-end)]" dir="ltr">
                {formatNumber(offer.discountedPrice)}
                <span className="text-base font-bold ms-1">{currency}</span>
              </span>
            ) : (
              <span className="text-sm font-bold text-[var(--text-secondary)]">
                {t("السعر عند الحجز", "Price on booking")}
              </span>
            )}
            {/* Only a real discount gets a struck price and a savings badge. */}
            {hasPrice && offer.originalPrice > offer.discountedPrice && offer.savingsPercentage > 0 ? (
              <>
                <span className="text-sm text-[var(--text-muted)] line-through mb-1" dir="ltr">
                  {formatNumber(offer.originalPrice)}
                </span>
                <span className="ms-auto mb-1 text-xs font-bold text-[var(--btn-wa-solid-fg)] bg-[var(--btn-wa-solid-bg)] rounded-full px-2.5 py-1">
                  {t("وفّري", "Save")} {formatNumber(offer.savingsPercentage)}٪
                </span>
              </>
            ) : null}
          </div>
          {validUntil ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {validUntil}
            </p>
          ) : null}
          <OfferCountdown endsOn={offer.endsOn} />

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() =>
                openBooking({ offer: { slug: offer.slug, name: offer.title, services: offer.services } })
              }
              data-cta="offer-card"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient font-bold text-sm py-3 hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-hover ease-brand cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>{t("احجزي العرض", "Book Offer")}</span>
            </button>
            <a
              href={waHref(language, waMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-success)] text-[var(--text-success)] font-bold text-sm py-3 hover:bg-[var(--bg-success-soft)] transition-[background-color] duration-hover ease-brand"
            >
              <WhatsAppIcon className="w-4 h-4" />
              <span>{t("استفسري", "Ask")}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
