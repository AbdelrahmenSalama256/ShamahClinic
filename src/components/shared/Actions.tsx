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
  return `https://wa.me/201121880908?text=${encodeURIComponent(text)}`;
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
        ? "text-base px-8 py-4"
        : "text-sm px-6 py-3";
  return (
    <button
      onClick={() => openBooking({ treatmentId, specialistId })}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient text-white font-bold shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${pad} ${className}`}
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
  variant?: "solid" | "outline";
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
        ? "text-base px-8 py-4"
        : "text-sm px-6 py-3";
  const skin =
    variant === "solid"
      ? "bg-emerald-700 text-white hover:bg-emerald-800"
      : "bg-white/10 border border-white/25 text-white hover:bg-white/20";
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
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[var(--gold-border)] text-[var(--gold-end)] font-bold hover:bg-[var(--blush-light)] transition-[background-color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${pad} ${className}`}
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
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[var(--gold-mid)] text-[var(--gold-end)] font-bold hover:bg-[var(--gold-mid)] hover:text-white transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 ${pad} ${className}`}
    >
      <span>{children}</span>
      {withArrow && <Arrow className="w-4 h-4" />}
    </Link>
  );
};
