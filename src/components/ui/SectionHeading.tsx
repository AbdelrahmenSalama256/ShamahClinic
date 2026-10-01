"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "./Reveal";

interface LocalizedText {
  ar: string;
  en: string;
}

interface SectionHeadingProps {
  /** Optional editorial index numeral, e.g. "01". */
  index?: string;
  title: LocalizedText;
  lead?: LocalizedText;
  align?: "start" | "center";
  tone?: "light" | "dark";
  className?: string;
}

/**
 * Editorial section heading: large display type with an optional numeral.
 * Deliberately avoids the "eyebrow label + rule above every heading" pattern.
 */
export const SectionHeading: React.FC<SectionHeadingProps> = ({
  index,
  title,
  lead,
  align = "start",
  tone = "light",
  className = "",
}) => {
  const { t } = useLanguage();
  const titleColor = tone === "dark" ? "text-[var(--text-inverse)]" : "text-[var(--text-primary)]";
  const leadColor = tone === "dark" ? "text-white/70" : "text-[var(--text-secondary)]";

  return (
    <Reveal
      className={`${align === "center" ? "text-center mx-auto" : "text-start"} max-w-3xl ${className}`}
    >
      {index && (
        <span
          className={`block text-sm font-bold tracking-[0.3em] mb-3 ${
            tone === "dark" ? "text-[var(--gold-start)]" : "text-[var(--gold-end)]"
          }`}
        >
          {index}
        </span>
      )}
      <h2
        className={`text-[22px] sm:text-3xl lg:text-4xl font-black tracking-tight leading-[1.15] ${titleColor}`}
      >
        {t(title.ar, title.en)}
      </h2>
      {lead && (
        <p className={`mt-3 text-[13px] sm:text-base leading-relaxed ${leadColor}`}>
          {t(lead.ar, lead.en)}
        </p>
      )}
    </Reveal>
  );
};
