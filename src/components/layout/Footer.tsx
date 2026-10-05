"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { clinicData } from "@/data/clinic";
import { images } from "@/lib/images";
import { getLocalizedHref } from "@/lib/locale";
import { primaryNav, footerNav, socialLinks } from "@/lib/site";
import { Phone, Clock, Mail, Send, Check, MessageCircle } from "lucide-react";

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

export const Footer: React.FC = () => {
  const { language, t } = useLanguage();
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

  const whatsappUrl = `${clinicData.whatsappUrl}?text=${encodeURIComponent(
    language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن الخدمات المتاحة لديكم."
      : "Hello Shamah Clinics, I would like to inquire about services.",
  )}`;

  return (
    <footer className="bg-[var(--bg-dark)] text-white pt-12 pb-24 sm:pb-8 border-t border-[var(--gold-border)]/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-white/10">
          {/* Brand */}
          <div className="lg:col-span-4 space-y-5">
            <span className="relative block w-48 h-11">
              <Image
                src={images.logo}
                alt={t("شعار عيادات شامه", "Shamah Clinics logo")}
                fill
                sizes="192px"
                className="object-contain object-start brightness-110"
              />
            </span>
            <p className="text-xs sm:text-sm text-white/85 leading-relaxed max-w-sm">
              {t(
                "عيادات شامه لطب التجميل والليزر والعناية بالبشرة. ثلاثة فروع في القاهرة والجيزة تجمع بين الدقة الطبية وأجواء الرفاهية.",
                "Shamah Clinics for aesthetic medicine, laser and skincare. Three branches across Cairo and Giza combining clinical precision with genuine comfort.",
              )}
            </p>
            <div className="pt-1 flex flex-col gap-2.5 text-xs text-gray-300">
              <a
                href={`tel:${clinicData.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 hover:text-[var(--gold-start)] transition-colors duration-300"
                // dir="ltr"
              >
                <Phone className="w-4 h-4 text-[var(--gold-mid)]" />
                <span>{clinicData.phone}</span>
              </a>
              <a
                href={`mailto:${clinicData.email}`}
                className="flex items-center gap-2 hover:text-[var(--gold-start)] transition-colors duration-300"
              >
                <Mail className="w-4 h-4 text-[var(--gold-mid)]" />
                <span>{clinicData.email}</span>
              </a>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--gold-mid)]" />
                <span>{clinicData.workingHours[language]}</span>
              </div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors duration-300"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t("تواصل فوري عبر واتساب", "WhatsApp Chat")}</span>
              </a>
            </div>
            {/* Social */}
            <div className="flex items-center gap-3 pt-1">
              {socialLinks.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-12 h-12 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-gray-200 hover:text-[var(--gold-start)] hover:border-[var(--gold-border)] hover:bg-white/10 transition-colors duration-300"
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
              {clinicData.branches.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[var(--gold-border)] transition-colors duration-300"
                >
                  <div className="font-bold text-white text-xs mb-1 flex items-center justify-between gap-2">
                    <Link
                      href={getLocalizedHref(`/branches/${b.id}`, language)}
                      className="hover:text-[var(--gold-start)] transition-colors duration-300"
                    >
                      {b.name[language]}
                    </Link>
                    <a
                      href={`tel:${b.phone}`}
                      className="text-[var(--gold-start)] hover:underline shrink-0 tabular-nums"
                      // dir="ltr"
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
              {primaryNav.map((l) => (
                <li key={l.href}>
                  <Link
                    href={getLocalizedHref(l.href, language)}
                    className="hover:text-[var(--gold-start)] transition-colors duration-300"
                  >
                    {t(l.label.ar, l.label.en)}
                  </Link>
                </li>
              ))}
              {footerNav.map((l) => (
                <li key={`${l.href}-${l.label.en}`}>
                  <Link
                    href={getLocalizedHref(l.href, language)}
                    className="hover:text-[var(--gold-start)] transition-colors duration-300"
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
              <div className="p-3 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs flex items-center gap-2">
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
                    className="w-full bg-white/10 border border-white/30 focus:border-[var(--gold-mid)] text-xs text-white py-3 ps-3.5 pe-14 rounded-full outline-none placeholder:text-gray-300 transition-colors duration-300"
                  />
                  <button
                    type="submit"
                    aria-label={t("اشتراك", "Subscribe")}
                    className="absolute end-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-gold-gradient text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 rtl:-scale-x-100" />
                  </button>
                </div>
                {newsletterError && (
                  <p className="text-[10px] text-red-400 ps-1">
                    {newsletterError}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        <div className="pt-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-300">
          <p>
            © {new Date().getFullYear()}{" "}
            {t(
              "عيادات شامه للتجميل والليزر. جميع الحقوق محفوظة.",
              "Shamah Clinics. All rights reserved.",
            )}
          </p>
          <p className="text-[11px] text-gray-400">
            {t(
              "مدينة نصر • التجمع الخامس • الشيخ زايد",
              "Nasr City • New Cairo • Sheikh Zayed",
            )}
          </p>
        </div>
      </div>
    </footer>
  );
};
