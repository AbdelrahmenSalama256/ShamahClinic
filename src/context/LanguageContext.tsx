"use client";

import React, { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLocalizedHref } from "@/lib/locale";
import { siteConfig } from "@/config/site";
import { fillSlots, pairKey, type CopyBundle } from "@/lib/copy/shared";

export type Language = "ar" | "en";
export type Direction = "rtl" | "ltr";

interface LanguageContextType {
  language: Language;
  direction: Direction;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (arText: string, enText: string, ...values: (string | number)[]) => string;
  formatNumber: (num: number | string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

// Mapping Western digits to Eastern Arabic (Arabic-Indic) digits
const arabicDigits: { [key: string]: string } = {
  "0": "٠",
  "1": "١",
  "2": "٢",
  "3": "٣",
  "4": "٤",
  "5": "٥",
  "6": "٦",
  "7": "٧",
  "8": "٨",
  "9": "٩",
};

/**
 * `copy` is the owner's own wording for the sentences the site was built with, read for
 * one language on the server. It is optional because it is an overlay: no bundle, no
 * database, no rows — all of those mean "say the words the component authored", which is
 * what the site rendered before this existed and what it must keep rendering.
 */
export const LanguageProvider: React.FC<{
  children: React.ReactNode;
  copy?: CopyBundle;
}> = ({ children, copy }) => {
  const router = useRouter();
  const pathname = usePathname();

  const localePrefix = pathname?.match(/^\/(ar|en)(?=\/|$)/)?.[1];
  const language: Language =
    localePrefix === "ar" || localePrefix === "en"
      ? localePrefix
      : siteConfig.defaultLanguage;
  const direction: Direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("shamah_lang", language);
    }
  }, [language]);

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("shamah_lang", lang);
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetPath = getLocalizedHref(currentPath, lang);
      if (targetPath !== currentPath) {
        router.push(targetPath, { scroll: false });
      }
    }
  };

  const toggleLanguage = () => {
    const nextLang = language === "ar" ? "en" : "ar";
    setLanguage(nextLang);
  };

  const t = (arText: string, enText: string, ...values: (string | number)[]) => {
    // A bundle is only for the language it was read in. The path can change a few
    // milliseconds before the layout's props do, and Arabic words leaking into an
    // English page for one frame is worse than the authored wording for that frame.
    const overrides = copy?.locale === language ? copy.values : undefined;
    const authored = language === "ar" ? arText : enText;
    return fillSlots(overrides?.[pairKey(arText, enText)] ?? authored, values);
  };

  const formatNumber = (num: number | string) => {
    const str = String(num);
    if (language === "ar") {
      return str.replace(/[0-9]/g, (w) => arabicDigits[w] || w);
    }
    return str;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        direction,
        toggleLanguage,
        setLanguage,
        t,
        formatNumber,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
