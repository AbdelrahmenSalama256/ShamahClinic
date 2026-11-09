"use client";

/**
 * The exit-intent prompt the Marketing screen switches on: one card, once per visit.
 *
 * On a desktop it appears when the pointer leaves the top of the window — the gesture of
 * reaching for the tab bar or the back button — and only after the visitor has spent the
 * configured seconds on the site. Phones have no such gesture, so unless the campaign is
 * desktop-only they get it after the delay once they have scrolled past half a page.
 *
 * It never interrupts a booking already open, and a visitor who closed it is not asked
 * again in the same session.
 */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useClinic } from "@/context/ClinicContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { useWhatsappHref } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";

const SEEN_KEY = "shamah:exit-prompt";

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: the prompt may show again next page, which is acceptable */
  }
}

export function ExitIntentPrompt() {
  const { promo } = useClinic();
  const prompt = promo.exitPrompt;
  const { t, language } = useLanguage();
  const { openBooking, isBookingOpen } = useBooking();
  const waHref = useWhatsappHref();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const bookingOpen = useRef(isBookingOpen);
  useEffect(() => {
    bookingOpen.current = isBookingOpen;
  }, [isBookingOpen]);

  useEffect(() => {
    if (!prompt.enabled || alreadySeen()) return;
    const startedAt = Date.now();
    const ready = () => Date.now() - startedAt >= prompt.delaySeconds * 1000 && !bookingOpen.current && !alreadySeen();
    const show = () => {
      if (!ready()) return;
      markSeen();
      setOpen(true);
    };
    const desktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (desktop) {
      const onLeave = (event: MouseEvent) => {
        if (!event.relatedTarget && event.clientY <= 8) show();
      };
      document.addEventListener("mouseout", onLeave);
      return () => document.removeEventListener("mouseout", onLeave);
    }
    if (prompt.desktopOnly) return;
    const onScroll = () => {
      const depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      if (depth >= 0.5) show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [prompt.enabled, prompt.delaySeconds, prompt.desktopOnly]);

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  // Owner-typed words are data, not catalog copy: the page language, else the other one.
  const words = (pair: { ar: string; en: string }) => (language === "ar" ? pair.ar || pair.en : pair.en || pair.ar);
  const cta = "inline-flex items-center justify-center rounded-full bg-gold-gradient px-6 py-3 text-sm font-bold text-white shadow-lg";
  const close = () => setOpen(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-prompt-title"
        className="relative w-full max-w-md rounded-3xl bg-[var(--bg-card)] p-7 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("إغلاق", "Close")}
          className="absolute top-3 end-3 rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
        <h2 id="exit-prompt-title" className="text-xl font-bold text-[var(--text-primary)]">
          {words(prompt.title)}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{words(prompt.text)}</p>
        <div className="mt-6">
          {prompt.action === "booking" && (
            <button
              type="button"
              className={cta}
              data-cta="exit_prompt"
              onClick={() => {
                close();
                openBooking();
              }}
            >
              {words(prompt.button)}
            </button>
          )}
          {prompt.action === "whatsapp" && (
            <a className={cta} href={waHref(language)} target="_blank" rel="noopener noreferrer" data-cta="exit_prompt" onClick={close}>
              {words(prompt.button)}
            </a>
          )}
          {prompt.action === "link" && prompt.href && (
            <Link
              className={cta}
              href={prompt.href.startsWith("/") ? getLocalizedHref(prompt.href, language) : prompt.href}
              data-cta="exit_prompt"
              onClick={close}
            >
              {words(prompt.button)}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
