"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { Photo } from "@/components/ui/Photo";
import { getBranch } from "@/data/branches";
import type { Specialist } from "@/data/specialists";
import { Calendar, MapPin } from "lucide-react";

export const DoctorCard: React.FC<{ doctor: Specialist; compact?: boolean }> = ({
  doctor,
  compact = false,
}) => {
  const { t, language } = useLanguage();
  const { openBooking } = useBooking();

  const branchNames = doctor.branches
    .map((id) => getBranch(id)?.name[language])
    .filter(Boolean)
    .join(" • ");

  return (
    <article className="group flex flex-col h-full rounded-2xl overflow-hidden border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:shadow-xl transition-[box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]">
      <div className="relative overflow-hidden">
        <Photo
          slot={doctor.image}
          ratio="portrait"
          imgClassName="group-hover:scale-[1.04] transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          sizes="(max-width:640px) 100vw, 33vw"
        />
      </div>
      <div className="p-3 sm:p-5 flex flex-col flex-1">
        <h3 className="text-sm sm:text-base lg:text-lg font-black text-[var(--text-primary)]">{t(doctor.name.ar, doctor.name.en)}</h3>
        <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-sm font-semibold text-[var(--gold-end)] leading-snug">
          {t(doctor.title.ar, doctor.title.en)}
        </p>
        {!compact && (
          <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3 hidden sm:block">
            {t(doctor.bio.ar, doctor.bio.en)}
          </p>
        )}
        <ul className="mt-3 sm:mt-4 flex-wrap gap-2 hidden sm:flex">
          {doctor.specialties[language].map((s) => (
            <li
              key={s}
              className="text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--gold-border)]/40 rounded-full px-3 py-1"
            >
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 sm:mt-4 inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-[var(--text-muted)]">
          <MapPin className="w-3.5 h-3.5 text-[var(--gold-mid)]" />
          {branchNames}
        </p>
        <button
          onClick={() => openBooking({ specialistId: doctor.id })}
          className="mt-3 sm:mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient text-white font-bold text-xs sm:text-sm py-2.5 sm:py-3 hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          <span>{t("احجزي مع هذه الطبيبة", "Book with this doctor")}</span>
        </button>
      </div>
    </article>
  );
};
