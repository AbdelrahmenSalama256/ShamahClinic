"use client";

/**
 * Time left on an offer, in its final week only: an end date three months away is not
 * news, the last few days are. The offer ends at the close of its end day in Cairo, the
 * calendar the console writes dates in.
 *
 * Rendered after mount only — the server and the browser would disagree about "now" by
 * however long the page took to arrive, and a clock that jumps on hydration reads as a bug.
 */
import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The instant the end day closes in Cairo, whatever the visitor's own time zone. */
export function cairoEndOf(day: string): number {
  const noonUtc = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(noonUtc)) return NaN;
  const cairoNoon = new Date(new Date(noonUtc).toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const utcNoon = new Date(new Date(noonUtc).toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = cairoNoon.getTime() - utcNoon.getTime();
  return Date.parse(`${day}T23:59:59Z`) - offset;
}

export function OfferCountdown({ endsOn }: Readonly<{ endsOn: string | null | undefined }>) {
  const { t, formatNumber } = useLanguage();
  const [now, setNow] = useState<number | null>(null);
  const end = endsOn ? cairoEndOf(endsOn) : NaN;

  useEffect(() => {
    if (Number.isNaN(end)) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [end]);

  if (now === null || Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0 || left > WINDOW_MS) return null;

  const days = Math.floor(left / 86_400_000);
  const pad = (value: number) => formatNumber(value).padStart(2, formatNumber(0));
  const clock = `${pad(Math.floor((left % 86_400_000) / 3_600_000))}:${pad(Math.floor((left % 3_600_000) / 60_000))}:${pad(Math.floor((left % 60_000) / 1000))}`;

  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold text-[var(--text-gold)]" role="timer" aria-live="off">
      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{t("ينتهي العرض خلال", "Offer ends in")}</span>
      {days > 0 && <span>{t("{0} يوم و", "{0}d", formatNumber(days))}</span>}
      <bdi dir="ltr" className="num">{clock}</bdi>
    </p>
  );
}
