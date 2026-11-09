"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { useClinic } from "@/context/ClinicContext";
import type { BranchLite } from "@/data/branches";
import { images } from "@/lib/images";
import { getLocalizedHref } from "@/lib/locale";
import { reopenConsent } from "@/lib/tracking/client";
import type { NavItem } from "@/data/nav";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { Phone, Send, Check } from "lucide-react";

const SocialIcon: React.FC<{ id: string }> = ({ id }) => {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;
  if (id === "facebook") {
    return (
      <svg {...common}>
        <path d="M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8v2.8h2.5V21h3z" />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg {...common}>
        <path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.3 6.2V8.6a7.7 7.7 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.4z" />
      </svg>
    );
  }
  if (id === "x") {
    return (
      <svg {...common}>
        <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.9 3h6.3l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
      </svg>
    );
  }
  if (id === "snapchat") {
    return (
      <svg {...common}>
        <path d="M12 2.5c2.9 0 5 2.2 5 5.1v2.2c.4.2.9.2 1.4 0 .6-.2 1.2.4.8 1-.4.5-1.1.8-1.8 1 .5 1.6 1.9 3 3.6 3.5.5.2.5.8 0 1-.8.4-1.7.5-2 .7-.2.3-.1 1-.5 1.2-.5.2-1.3-.2-2.4 0-1.1.3-1.8 1.6-4.1 1.6s-3-1.3-4.1-1.6c-1.1-.2-1.9.2-2.4 0-.4-.2-.3-.9-.5-1.2-.3-.2-1.2-.3-2-.7-.5-.2-.5-.8 0-1 1.7-.5 3.1-1.9 3.6-3.5-.7-.2-1.4-.5-1.8-1-.4-.6.2-1.2.8-1 .5.2 1 .2 1.4 0V7.6c0-2.9 2.1-5.1 5-5.1z" />
      </svg>
    );
  }
  if (id === "linkedin") {
    return (
      <svg {...common}>
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z" />
      </svg>
    );
  }
  if (id === "threads") {
    return (
      <svg {...common}>
        <path d="M16.7 11.1c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.6-4.7-1.7 0-3.1.7-3.9 2l1.5 1c.6-.9 1.6-1.1 2.4-1.1 1 0 1.7.3 2.2.9.3.4.6 1 .7 1.7-.8-.1-1.6-.2-2.5-.1-2.5.1-4.1 1.6-4 3.6.1 2.1 2 3.2 4 3.1 2.9-.2 4.1-2.4 4.4-4.4 1.1.7 1.7 1.8 1.7 3.1-.1 2.4-2.7 4.6-6.4 4.6-4.3 0-6.9-2.8-6.9-7.7S5.6 4.3 9.9 4.3c3.6 0 5.9 1.6 6.8 4.7l1.8-.5C17.3 4.6 14.4 2.5 9.9 2.5 4.6 2.5 1.2 6 1.2 11.9s3.4 9.5 8.7 9.5c4.6 0 8.1-2.8 8.2-6.4.1-2-1-3.3-1.4-3.9zm-4.9 5.1c-1.1.1-2.2-.4-2.2-1.4 0-.7.5-1.6 2.5-1.7h.7c.7 0 1.3.1 1.9.2-.2 2.3-1.4 2.8-2.9 2.9z" />
      </svg>
    );
  }
  if (id === "instagram") {
    return (
      <svg {...common}>
        <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.4A6.4 6.4 0 1 0 18.4 12 6.4 6.4 0 0 0 12 5.6zm0 10.6A4.2 4.2 0 1 1 16.2 12 4.2 4.2 0 0 1 12 16.2zm6.6-10.9a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M21.6 7.2s-.2-1.4-.8-2c-.7-.8-1.6-.8-2-.9C16.9 4.1 12 4.1 12 4.1h0s-4.9 0-6.8.2c-.4 0-1.2.1-2 .9-.6.6-.8 2-.8 2S2.2 8.8 2.2 10.5v1.6c0 1.6.2 3.3.2 3.3s.2 1.4.8 2c.7.8 1.7.8 2.1.9 1.6.1 6.7.2 6.7.2s4.9 0 6.8-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.3v-1.6c0-1.6-.2-3.3-.2-3.3zM9.9 14.6V8.9l5.4 2.9z" />
    </svg>
  );
};

export const Footer: React.FC<{
  branches: BranchLite[];
  nav: NavItem[];
  hiddenPaths: string[];
  cookieSettings?: boolean;
}> = ({ branches, nav, hiddenPaths, cookieSettings = false }) => {
  const { language, t } = useLanguage();
  const clinic = useClinic();
  const visibleNavItems = nav.filter(
    (item) => !hiddenPaths.includes(item.href),
  );
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterError, setNewsletterError] = useState("");

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail || !newsletterEmail.includes("@")) {
      setNewsletterError(
        language === "ar"
          ? "يرجى إدخال بريد إلكتروني صالح"
          : "Please enter a valid email",
      );
      return;
    }
    setNewsletterError("");
    setNewsletterSubscribed(true);
  };

  const whatsappUrl = `${clinic.whatsappUrl}?text=${encodeURIComponent(clinic.brand.whatsappMessage[language])}`;
  const { brand } = clinic;

  return (
    <footer className="on-dark bg-[var(--bg-dark)] text-[var(--text-on-dark)] pt-12 pb-[calc(var(--mobile-bar-height)+env(safe-area-inset-bottom))] sm:pb-[calc(var(--floating-control-size)+var(--floating-control-gap))] border-t border-[var(--border-control)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-white/10">
          {/* Brand */}
          <div className="lg:col-span-4 space-y-5">
            <span className="relative block w-48 h-11">
              <Image
                src={brand.logo || images.logo}
                alt={t("شعار عيادات شامه", "Shamah Clinics logo")}
                fill
                sizes="192px"
                className="object-contain object-start brightness-110"
              />
            </span>
            <p className="text-xs sm:text-sm text-[var(--text-on-dark-muted)] leading-relaxed max-w-sm">
              {t(
                "عيادات شامه لطب التجميل والليزر والعناية بالبشرة. ثلاثة فروع في القاهرة والجيزة تجمع بين الدقة الطبية وأجواء الرفاهية.",
                "Shamah Clinics for aesthetic medicine, laser and skincare. Three branches across Cairo and Giza combining clinical precision with genuine comfort.",
              )}
            </p>
            <div className="pt-1 flex flex-col gap-2.5 text-xs text-gray-300">
              <a
                href={`tel:${clinic.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 hover:text-[var(--gold-start)] transition-colors duration-hover"
                // dir="ltr"
              >
                <Phone className="w-4 h-4 text-[var(--text-gold)]" />
                <span>{clinic.phone}</span>
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--text-success-on-dark)] hover:text-[var(--text-success-on-dark)] transition-colors duration-hover"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>{t("تواصل فوري عبر واتساب", "WhatsApp Chat")}</span>
              </a>
            </div>
            {/* Social */}
            <div className="flex items-center gap-3 pt-1">
              {brand.socials.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 rounded-full border border-[var(--border-on-dark)] bg-white/5 flex items-center justify-center text-[var(--text-on-dark-muted)] hover:text-[var(--gold-start)] hover:border-[var(--gold-border)] hover:bg-white/10 transition-colors duration-hover"
                >
                  <SocialIcon id={s.id} />
                </a>
              ))}
            </div>
          </div>

          {/* Branches */}
          <div className="lg:col-span-4 space-y-4">
            <h2 className="text-sm font-bold text-[var(--gold-start)] tracking-wider">
              {t("فروعنا في مصر", "Our Branches")}
            </h2>
            <div className="space-y-3 text-xs">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl bg-white/5 border border-[var(--border-on-dark)] hover:border-[var(--gold-border)] transition-colors duration-hover"
                >
                  <div className="font-bold text-[var(--text-on-dark)] text-xs mb-1 flex items-center justify-between gap-2">
                    <Link
                      href={getLocalizedHref(`/branches/${b.id}`, language)}
                      className="hover:text-[var(--gold-start)] transition-colors duration-hover"
                    >
                      {b.name[language]}
                    </Link>
                    <a
                      href={`tel:${b.phone}`}
                      className="text-[var(--gold-start)] hover:underline shrink-0"
                      dir="ltr"
                    >
                      {b.phone}
                    </a>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {b.address[language]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Site links — 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold text-[var(--gold-start)] tracking-wider">
              {t("روابط الموقع", "Site")}
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-gray-300">
              {visibleNavItems.map((l) => (
                <li key={l.href}>
                  <Link
                    href={getLocalizedHref(l.href, language)}
                    className="hover:text-[var(--gold-start)] transition-colors duration-hover"
                  >
                    {t(l.label.ar, l.label.en)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold text-[var(--gold-start)] tracking-wider">
              {t("كوني على تواصل", "Stay in Touch")}
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t(
                "اشتركي لتصلكِ العروض الموسمية ونصائح العناية بالبشرة من طبيباتنا.",
                "Subscribe for seasonal offers and skincare guidance from our doctors.",
              )}
            </p>
            {newsletterSubscribed ? (
              <div className="p-3 rounded-full bg-[var(--btn-wa-on-dark-bg-hover)] border border-[var(--btn-wa-on-dark-border)] text-[var(--text-success-on-dark)] text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  {t("شكراً لاشتراككِ معنا!", "Thank you for subscribing!")}
                </span>
              </div>
            ) : (
              <form onSubmit={handleNewsletterSubmit} className="space-y-2">
                <div className="relative">
                  <input
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder={t("بريدكِ الإلكتروني", "Your email address")}
                    className="w-full bg-white/10 border border-[var(--border-on-dark)] text-xs text-[var(--text-on-dark)] py-3 ps-3.5 pe-14 rounded-full outline-none placeholder:text-[var(--text-on-dark-muted)] transition-colors duration-hover"
                  />
                  <button
                    type="submit"
                    aria-label={t("اشتراك", "Subscribe")}
                    className="absolute end-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gold-gradient flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-hover cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 rtl:-scale-x-100" />
                  </button>
                </div>
                {newsletterError && (
                  <p className="text-[10px] text-[var(--text-danger-on-dark)] ps-1">
                    {newsletterError}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {(brand.commercialReg || brand.taxId || brand.paymentImage) && (
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-gray-400">
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {brand.commercialReg && (
                <span>
                  {t("سجل تجاري", "Commercial reg.")}: <bdi>{brand.commercialReg}</bdi>
                </span>
              )}
              {brand.taxId && (
                <span>
                  {t("بطاقة ضريبية", "Tax ID")}: <bdi>{brand.taxId}</bdi>
                </span>
              )}
            </p>
            {brand.paymentImage && (
              <span className="relative block w-56 h-8">
                <Image
                  src={brand.paymentImage}
                  alt={t("وسائل الدفع المتاحة", "Accepted payment methods")}
                  fill
                  sizes="224px"
                  className="object-contain"
                />
              </span>
            )}
          </div>
        )}

        <div className="pt-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-300">
          <p>
            © {new Date().getFullYear()}{" "}
            {t(
              "عيادات شامه للتجميل والليزر. جميع الحقوق محفوظة.",
              "Shamah Clinics. All rights reserved.",
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <p className="text-[11px] text-gray-400">
              {t(
                "مدينة نصر • التجمع الخامس • الشيخ زايد",
                "Nasr City • New Cairo • Sheikh Zayed",
              )}
            </p>
            {cookieSettings && (
              <button
                type="button"
                onClick={reopenConsent}
                className="cursor-pointer text-[11px] text-gray-400 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
              >
                {t("إعدادات الكوكيز", "Cookie settings")}
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
