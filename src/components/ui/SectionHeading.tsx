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
  title: titleProp,
  lead,
  align = "start",
  tone = "light",
  className = "",
}) => {
  const { t } = useLanguage();
  const titleColor = tone === "dark" ? "text-[var(--text-inverse)]" : "text-[var(--text-primary)]";
  const leadColor = tone === "dark" ? "text-[var(--text-on-dark-muted)]" : "text-[var(--text-secondary)]";

  // A section with no heading text renders nothing at all: WordPress can return a
  // list without a title, and an empty <h2> is a gap in the page, not a heading.
  const title = t(titleProp.ar, titleProp.en);
  const leadText = lead ? t(lead.ar, lead.en) : "";
  if (!title) return null;

  return (
    <Reveal
      className={`${align === "center" ? "text-center mx-auto" : "text-start"} max-w-3xl ${className}`}
    >
      {index && (
        <span
          className={`block text-sm font-bold tracking-eyebrow mb-3 ${
            tone === "dark" ? "text-[var(--gold-start)]" : "text-[var(--gold-end)]"
          }`}
        >
          {index}
        </span>
      )}
      <h2
        className={`text-[22px] sm:text-3xl lg:text-4xl font-black tracking-tight leading-[1.15] ${titleColor}`}
        dir="auto"
      >
        {title}
      </h2>
      {leadText && (
        <p className={`mt-3 text-[13px] sm:text-base leading-relaxed ${leadColor}`} dir="auto">
          {leadText}
        </p>
      )}
    </Reveal>
  );
};
