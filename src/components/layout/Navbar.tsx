"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useBooking } from "@/context/BookingContext";
import { siteConfig } from "@/config/site";
import { useClinic } from "@/context/ClinicContext";
import { images } from "@/lib/images";
import { getLocalizedHref } from "@/lib/locale";
import type { NavItem } from "@/data/nav";
import {
  Menu,
  X,
  Phone,
  Calendar,
  Globe,
  MessageCircle,
  MapPin,
  ChevronDown,
  Moon,
  Sun,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

export const Navbar: React.FC<{ nav: NavItem[]; hiddenPaths: string[] }> = ({ nav, hiddenPaths }) => {
  const { language, toggleLanguage, t } = useLanguage();
  const clinic = useClinic();
  const { theme, toggleTheme } = useTheme();
  const { openBooking } = useBooking();
  const pathname = usePathname();
  // The one icon family, mirrored by reading direction: an arrow that points
  // "onward" in English points the other way in Arabic. A literal "→" in a label
  // string cannot do that, and Tajawal does not draw it either.
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  // Motion turns with the reading direction too: the menu panel enters from the
  // trailing edge and leaves through the leading one, which is the opposite pair
  // of signs in Arabic. One magnitude, signed.
  const slideInX = language === "ar" ? -20 : 20;

  const [isScrolled, setIsScrolled] = useState(false);
  // Menu state is scoped to the path it was opened on, so navigating closes it
  // without an effect round-trip.
  const [menu, setMenu] = useState<{
    path: string | null;
    mobile: boolean;
    dropdown: string | null;
    mobileDropdown: string | null;
  }>({ path: null, mobile: false, dropdown: null, mobileDropdown: null });

  const openMenu = (
    patch: Partial<Pick<typeof menu, "mobile" | "dropdown" | "mobileDropdown">>,
  ) => setMenu({ ...menu, path: pathname ?? null, ...patch });

  const onThisPath = menu.path === (pathname ?? null);
  const isMobileMenuOpen = onThisPath && menu.mobile;
  const openDropdown = onThisPath ? menu.dropdown : null;
  const openMobileDropdown = onThisPath ? menu.mobileDropdown : null;

  // Track page scroll for header styling
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const normalizedPath = pathname?.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const isActive = (href: string) =>
    href === "/" ? normalizedPath === "/" : normalizedPath.startsWith(href);

  const whatsappUrl = `${clinic.whatsappUrl}?text=${encodeURIComponent(
    language === "ar"
      ? "مرحباً عيادات شامه، أود الاستفسار عن المواعيد والخدمات المتاحة لديكم."
      : "Hello Shamah Clinics, I would like to inquire about appointments and services.",
  )}`;

  // A hidden page keeps its line in the authored menu but loses its way into the
  // chrome — the route itself answers 404 (or its redirect) when reached directly.
  const visibleNavItems = nav.filter((item) => !hiddenPaths.includes(item.href));
  const mobileParent = visibleNavItems.find((l) => l.href === openMobileDropdown);

  // Shared link styling for the desktop nav
  const desktopLinkBase =
    "relative text-sm font-medium px-3 py-1.5 transition-colors duration-300 " +
    "after:content-[''] after:absolute after:bottom-0 after:start-3 after:end-3 " +
    "after:h-[2px] after:bg-[var(--gold-mid)] after:origin-center " +
    "after:transition-transform after:duration-300 " +
    "after:ease-[cubic-bezier(.22,1,.36,1)]";

  const desktopLinkColor = (active: boolean) =>
    active
      ? "text-[var(--gold-end)] after:scale-x-100"
      : "text-[var(--text-primary)] hover:text-[var(--gold-end)] after:scale-x-0 hover:after:scale-x-100";

  return (
    <>
      {/* ══════════════ HEADER ══════════════ */}
      <header
        className={`fixed top-0 start-0 end-0 z-40 transition-[padding,background-color,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
          isScrolled ? "glass-nav-scrolled py-2" : "glass-nav py-3.5"
        }`}
      >
        {/* ── Announcement mini-bar ── */}
        <div
          className={`hidden lg:block overflow-hidden transition-[max-height,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
            isScrolled ? "max-h-0 opacity-0" : "max-h-10 opacity-100"
          } border-b border-[var(--border-control)] pb-2 mb-2 text-xs text-[var(--text-secondary)]`}
        >
          <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[var(--text-gold)]" />
                {t(
                  "فروعنا: مدينة نصر • التجمع الخامس • الشيخ زايد",
                  "Branches: Nasr City • New Cairo • Sheikh Zayed",
                )}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`tel:${clinic.phone.replace(/\s/g, "")}`}
                dir="ltr"
                className="flex items-center gap-1.5 hover:text-[var(--text-gold)] transition-colors duration-300"
              >
                <Phone className="w-3.5 h-3.5 text-[var(--text-gold)]" />
                <span>{clinic.phone}</span>
              </a>
              <span className="text-[var(--gold-end)]" aria-hidden="true">
                |
              </span>
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1 hover:text-[var(--text-gold)] transition-colors duration-300 font-medium cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[var(--text-gold)]" />
                <span>{language === "ar" ? "English" : "العربية"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Main bar ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href={getLocalizedHref("/", language)}
            className="flex items-center shrink-0"
            aria-label={t("عيادات شامه - الرئيسية", "Shamah Clinics - Home")}
          >
            <span className="relative block w-36 sm:w-44 h-10">
              <Image
                src={images.logo}
                alt={t("شعار عيادات شامه", "Shamah Clinics logo")}
                fill
                sizes="(min-width: 640px) 176px, 144px"
                priority
                className="object-contain object-start"
              />
            </span>
          </Link>

          {/* ── Desktop nav ── */}
          <nav
            className="hidden lg:flex items-center gap-1"
            aria-label={t("التنقل الرئيسي", "Primary")}
            onMouseLeave={() => openMenu({ dropdown: null })}
          >
            {visibleNavItems.map((link) => {
              const active = isActive(link.href);
              const hasChildren = !!link.children?.length;
              const isOpen = openDropdown === link.href;

              if (!hasChildren) {
                return (
                  <Link
                    key={link.href}
                    href={getLocalizedHref(link.href, language)}
                    aria-current={active ? "page" : undefined}
                    className={`${desktopLinkBase} ${desktopLinkColor(active)}`}
                  >
                    {t(link.label.ar, link.label.en)}
                  </Link>
                );
              }

              return (
                <div
                  key={link.href}
                  className="relative"
                  onMouseEnter={() => openMenu({ dropdown: link.href })}
                >
                  <Link
                    href={getLocalizedHref(link.href, language)}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    className={`${desktopLinkBase} flex items-center gap-1 ${desktopLinkColor(
                      active || isOpen,
                    )}`}
                  >
                    {t(link.label.ar, link.label.en)}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Link>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{
                          duration: 0.22,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        role="menu"
                        className="absolute top-full start-0 mt-2 w-72 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-control)] shadow-2xl overflow-hidden z-50"
                      >
                        <div className="p-2">
                          {link.children!.map((child) => (
                            <Link
                              key={child.href}
                              href={getLocalizedHref(child.href, language)}
                              role="menuitem"
                              className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors duration-200"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-mid)]/40 group-hover:bg-[var(--gold-mid)] shrink-0 mt-2 transition-colors duration-300" />
                              <div className="min-w-0">
                                <span className="block text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--gold-end)] transition-colors duration-300">
                                  {t(child.label.ar, child.label.en)}
                                </span>
                                {/* {child.description && (
                                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                                    {t(
                                      child.description.ar,
                                      child.description.en,
                                    )}
                                  </span>
                                )} */}
                              </div>
                            </Link>
                          ))}
                        </div>
                        <div className="border-t border-[var(--border-control)] p-2">
                          <Link
                            href={getLocalizedHref(link.href, language)}
                            className="block text-center text-xs font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] py-1.5 transition-colors duration-300"
                          >
                            <span className="inline-flex items-center justify-center gap-1.5">
                              {t("كل الخدمات", "All treatments")}
                              <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            </span>
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* ── Right actions ── */}
          <div className="flex items-center gap-2.5">
            {siteConfig.enableDarkmoodOption && (
              <button
                onClick={toggleTheme}
                aria-label={
                  theme === "dark"
                    ? t("تفعيل الوضع الفاتح", "Switch to light mode")
                    : t("تفعيل الوضع الداكن", "Switch to dark mode")
                }
                title={
                  theme === "dark"
                    ? t("الوضع الفاتح", "Light mode")
                    : t("الوضع الداكن", "Dark mode")
                }
                className="inline-flex items-center justify-center rounded-full w-8 h-8 border border-[var(--gold-border)] text-[var(--text-primary)] hover:border-[var(--border-control)] transition-colors duration-300 cursor-pointer"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              onClick={toggleLanguage}
              title={t("تغيير اللغة", "Switch language")}
              className="lg:hidden  rounded-full w-8 h-8 d-flex justify-center align-center border border-[var(--gold-border)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--border-control)] transition-colors duration-300"
            >
              {language === "ar" ? "EN" : "عربي"}
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("تواصل عبر واتساب", "Chat on WhatsApp")}
              className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full border border-[var(--border-success)] bg-[var(--bg-success-soft)] text-[var(--text-success)] hover:bg-[var(--bg-success-soft)] transition-colors duration-300"
            >
              <MessageCircle className="w-5 h-5 text-[var(--text-success)]" />
            </a>

            <button
              onClick={() => openBooking()}
              data-cta="navbar"
              aria-label={t("احجزي موعدك", "Book appointment")}
              className="bg-gold-gradient font-medium text-xs sm:text-sm px-4 sm:px-6 py-2.5 rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] flex items-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t("احجزي موعدك", "Book")}
              </span>
            </button>

            <button
              onClick={() => openMenu({ mobile: !isMobileMenuOpen })}
              aria-label={t("القائمة", "Menu")}
              aria-expanded={isMobileMenuOpen}
              className="lg:hidden p-2 text-[var(--text-primary)] hover:text-[var(--text-gold)] transition-colors duration-300"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════ MOBILE MENU — 3D CUBE ══════════════ */}
      <div
        className={`fixed inset-0 z-50 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(.22,1,.36,1)] lg:hidden ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => {
              openMenu({ mobile: false, mobileDropdown: null });
          }}
        />

        <aside
          className={`absolute top-0 bottom-0 start-0 w-[84%] max-w-sm bg-[var(--bg-primary)] shadow-2xl border-e border-[var(--gold-border)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
            isMobileMenuOpen
              ? "translate-x-0"
              : language === "ar"
                ? "translate-x-full"
                : "-translate-x-full"
          }`}
          aria-label={t("قائمة التنقل", "Navigation menu")}
        >
          <AnimatePresence mode="wait" initial={false}>
            {!openMobileDropdown ? (
              /* ── FACE 1: Main menu ── */
              <motion.div
                key="main-menu"
                initial={{ opacity: 0, x: slideInX }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -slideInX }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex flex-col justify-between p-6 overflow-y-auto"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between pb-5 border-b border-[var(--gold-border)]">
                    <span className="relative block w-32 h-9">
                      <Image
                        src={images.logo}
                        alt={t("شعار عيادات شامه", "Shamah Clinics logo")}
                        fill
                        sizes="128px"
                        className="object-contain object-start"
                      />
                    </span>
                    <button
                      onClick={() => openMenu({ mobile: false })}
                      aria-label={t("إغلاق", "Close")}
                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-gold)] transition-colors duration-300"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Nav */}
                  <nav
                    className="flex flex-col mt-5"
                    aria-label={t("التنقل الرئيسي", "Primary")}
                  >
                    {visibleNavItems.map((link) => {
                      const active = isActive(link.href);
                      const hasChildren = !!link.children?.length;

                      if (!hasChildren) {
                        return (
                          <Link
                            key={link.href}
                            href={getLocalizedHref(link.href, language)}
                            className={`py-3 border-b border-[var(--border-control)] flex items-center justify-between text-sm font-semibold transition-colors duration-300 ${
                              active
                                ? "text-[var(--gold-end)]"
                                : "text-[var(--text-primary)] hover:text-[var(--gold-end)]"
                            }`}
                          >
                            <span>{t(link.label.ar, link.label.en)}</span>
                            {active && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-mid)]" />
                            )}
                          </Link>
                        );
                      }

                      return (
                        <button
                          key={link.href}
                          onClick={() => openMenu({ mobileDropdown: link.href })}
                          className={`py-3 border-b border-[var(--border-control)] flex items-center justify-between text-sm font-semibold transition-colors duration-300 cursor-pointer ${
                            active
                              ? "text-[var(--gold-end)]"
                              : "text-[var(--text-primary)] hover:text-[var(--gold-end)]"
                          }`}
                        >
                          <span>{t(link.label.ar, link.label.en)}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-300 ${
                              language === "ar" ? "rotate-90" : "-rotate-90"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </nav>

                  {/* Language */}
                  <div className="mt-5 pt-4 border-t border-[var(--border-control)]">
                    {siteConfig.enableDarkmoodOption && (
                      <button
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between py-2.5 px-3 mb-2 rounded-lg bg-[var(--bg-secondary)] text-sm font-semibold text-[var(--text-primary)]"
                      >
                        <span className="flex items-center gap-2">
                          {theme === "dark" ? (
                            <Sun className="w-4 h-4 text-[var(--text-gold)]" />
                          ) : (
                            <Moon className="w-4 h-4 text-[var(--text-gold)]" />
                          )}
                          {t("المظهر", "Appearance")}
                        </span>
                        <span className="text-[var(--gold-end)] font-bold">
                          {theme === "dark"
                            ? t("الوضع الفاتح", "Light mode")
                            : t("الوضع الداكن", "Dark mode")}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={toggleLanguage}
                      className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--bg-secondary)] text-sm font-semibold text-[var(--text-primary)]"
                    >
                      <span className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[var(--text-gold)]" />
                        {t("اللغة الحالية", "Current language")}
                      </span>
                      <span className="text-[var(--gold-end)] font-bold">
                        {language === "ar" ? "English" : "العربية"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Footer CTAs */}
                <div className="pt-6 border-t border-[var(--gold-border)] flex flex-col gap-3">
                  <button
                    onClick={() => {
                      openMenu({ mobile: false });
                      openBooking();
                    }}
                    data-cta="nav-menu"
                    className="w-full bg-gold-gradient font-medium py-3 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>{t("احجزي موعدك الآن", "Book Appointment Now")}</span>
                  </button>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[var(--btn-wa-solid-bg)] text-[var(--btn-wa-solid-fg)] font-medium py-3 rounded-xl shadow-sm flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{t("محادثة واتساب فورية", "Chat on WhatsApp")}</span>
                  </a>
                  <p className="text-center text-xs text-[var(--text-muted)] mt-1">
                    {t(
                      "مدينة نصر • التجمع • الشيخ زايد",
                      "Nasr City • New Cairo • Zayed",
                    )}
                  </p>
                </div>
              </motion.div>
            ) : (
              /* ── FACE 2: Services submenu ── */
              <motion.div
                key="services-menu"
                initial={{ opacity: 0, x: slideInX }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -slideInX }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex flex-col p-6 overflow-y-auto bg-[var(--bg-primary)]"
              >
                {/* Header with back */}
                <div className="flex items-center justify-between pb-5 border-b border-[var(--gold-border)]">
                  <button
                    onClick={() => openMenu({ mobileDropdown: null })}
                    aria-label={t("رجوع", "Back")}
                    className="flex items-center gap-2 text-sm font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300 cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-4 h-4 ${
                        language === "ar" ? "-rotate-90" : "rotate-90"
                      }`}
                    />
                    <span>{t("رجوع", "Back")}</span>
                  </button>
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {mobileParent
                      ? t(mobileParent.label.ar, mobileParent.label.en)
                      : ""}
                  </span>
                </div>

                {/* Children */}
                {mobileParent?.children && (
                  <nav
                    className="flex flex-col mt-4"
                    aria-label={t("خدماتنا", "Our services")}
                  >
                    {mobileParent.children.map((child) => (
                      <Link
                        key={child.href}
                        href={getLocalizedHref(child.href, language)}
                        className="group flex flex-col gap-1 py-3 border-b border-[var(--border-control)]"
                      >
                        <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--gold-end)] transition-colors duration-300">
                          {t(child.label.ar, child.label.en)}
                        </span>
                        {/* {child.description && (
                          <span className="text-xs text-[var(--text-muted)] leading-snug">
                            {t(child.description.ar, child.description.en)}
                          </span>
                        )} */}
                      </Link>
                    ))}

                    <Link
                      href={getLocalizedHref(mobileParent.href, language)}
                      className="mt-4 block text-center text-sm font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] py-3 rounded-xl border border-[var(--border-control)] hover:border-[var(--border-control)] transition-colors duration-300"
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {t("كل الخدمات", "All treatments")}
                        <Arrow className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </span>
                    </Link>
                  </nav>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </>
  );
};
