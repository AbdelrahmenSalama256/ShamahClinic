"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { getLocalizedHref } from "@/lib/locale";
import { clinicData } from "@/data/clinic";
import {
  Calendar,
  MessageCircle,
  Phone,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

export function whatsappHref(language: "ar" | "en", custom?: string): string {
  const text =
    custom ??
    (language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات المتاحة لديكم."
      : "Hello Shamah Clinics, I would like to inquire about appointments and services.");
  return `${clinicData.whatsappUrl}?text=${encodeURIComponent(text)}`;
}

interface BookButtonProps {
  treatmentId?: string;
  specialistId?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: { ar: string; en: string };
}

export const BookButton: React.FC<BookButtonProps> = ({
  treatmentId,
  specialistId,
  size = "md",
  className = "",
  label,
}) => {
  const { t } = useLanguage();
  const { openBooking } = useBooking();
  const pad =
    size === "sm"
      ? "text-xs px-4 py-2"
      : size === "lg"
        ? "text-base px-4 py-2"
        : "text-sm px-6 py-3";
  return (
    <button
      onClick={() => openBooking({ treatmentId, specialistId })}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient font-bold shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${pad} ${className}`}
    >
      <Calendar className="w-4 h-4" />
      <span>
        {label ? t(label.ar, label.en) : t("احجزي موعدك", "Book Appointment")}
      </span>
    </button>
  );
};

interface WhatsAppButtonProps {
  custom?: string;
  size?: "sm" | "md" | "lg";
  /**
   * Chosen by the surface the control sits on: `solid` anywhere, `outline` on a
   * light card, `onDark` on surfaces that stay dark in both themes.
   */
  variant?: "solid" | "outline" | "onDark";
  className?: string;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  custom,
  size = "md",
  variant = "solid",
  className = "",
}) => {
  const { t, language } = useLanguage();
  const pad =
    size === "sm"
      ? "text-xs px-4 py-2"
      : size === "lg"
        ? "text-base px-4 py-2"
        : "text-sm px-6 py-3";
  const skin =
    variant === "solid"
      ? "bg-[var(--btn-wa-solid-bg)] text-[var(--btn-wa-solid-fg)] hover:bg-[var(--btn-wa-solid-bg-hover)] hover:text-[var(--btn-wa-solid-fg-hover)]"
      : variant === "outline"
        ? "bg-[var(--btn-wa-outline-bg)] text-[var(--btn-wa-outline-fg)] border border-[var(--btn-wa-outline-border)] hover:bg-[var(--btn-wa-outline-bg-hover)] hover:text-[var(--btn-wa-outline-fg-hover)]"
        : "bg-[var(--btn-wa-on-dark-bg)] text-[var(--btn-wa-on-dark-fg)] border border-[var(--btn-wa-on-dark-border)] hover:bg-[var(--btn-wa-on-dark-bg-hover)] hover:text-[var(--btn-wa-on-dark-fg-hover)]";
  return (
    <a
      href={whatsappHref(language, custom)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold shadow-sm hover:-translate-y-0.5 transition-[transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${pad} ${skin} ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      <span>{t("واتساب", "WhatsApp")}</span>
    </a>
  );
};

export const CallButton: React.FC<{
  phone?: string;
  size?: "sm" | "md";
  className?: string;
}> = ({ phone, size = "md", className = "" }) => {
  const { t } = useLanguage();
  const num = (phone ?? clinicData.phone).replace(/\s/g, "");
  const pad = size === "sm" ? "text-xs px-4 py-2" : "text-sm px-6 py-3";
  return (
    <a
      href={`tel:${num}`}
      dir="ltr"
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-control)] text-[var(--text-gold)] font-bold hover:bg-[var(--blush-light)] transition-[background-color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${pad} ${className}`}
    >
      <Phone className="w-4 h-4" />
      <span>{phone ?? clinicData.phone}</span>
      <span className="sr-only">{t("اتصال", "Call")}</span>
    </a>
  );
};

interface GoldLinkProps {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
  withArrow?: boolean;
}

export const GoldLink: React.FC<GoldLinkProps> = ({
  href,
  children,
  size = "md",
  className = "",
  withArrow = false,
}) => {
  const { language } = useLanguage();
  const pad = size === "sm" ? "text-xs px-4 py-2" : "text-sm px-6 py-3";
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const localizedPath = getLocalizedHref(href, language);

  return (
    <Link
      href={localizedPath}
      // The hover fill is gold, so a gold hairline would vanish into it; the border
      // takes the label's ink and keeps the control's boundary above 3:1.
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-control)] text-[var(--text-gold)] font-bold hover:bg-[var(--gold-mid)] hover:text-[var(--btn-gold-fg)] hover:border-[var(--btn-gold-fg)] transition-[background-color,color,border-color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 ${pad} ${className}`}
    >
      <span>{children}</span>
      {withArrow && <Arrow className="w-4 h-4" />}
    </Link>
  );
};
