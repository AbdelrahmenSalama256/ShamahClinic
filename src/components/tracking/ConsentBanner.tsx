"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { getLocalizedHref, type Locale } from "@/lib/locale";
import {
  CONSENT_EVENT,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/tracking/consent";

/**
 * One question, asked once, before any third-party script reaches the page.
 *
 * Our own statistics run regardless: they set no cookie, store no address, and obey
 * DNT/GPC before anything is sent, so this choice governs the vendors only.
 *
 * "Reject" is as easy to press as "Accept" and is remembered the same way: a banner
 * whose refusal takes more clicks is a dark pattern, and a choice that is not stored
 * is asked again on the next page. The banner only appears when something is actually
 * configured to load, so a site with no tags has no banner.
 */
/**
 * `unknown` is what the server and the first hydration render see: the banner stays
 * hidden until the browser has actually read the stored answer, so a returning visitor
 * never sees it flash. localStorage is the external store; the event is this tab, the
 * `storage` event is every other one.
 */
type Snapshot = ConsentChoice | null | "unknown";

function snapshot(): Snapshot {
  return readConsent(window.localStorage);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ConsentBanner({ lang, hasTags }: { lang: Locale; hasTags: boolean }) {
  const choice = useSyncExternalStore<Snapshot>(subscribe, snapshot, () => "unknown");

  if (!hasTags || choice !== null) return null;

  const answer = (next: ConsentChoice) => {
    writeConsent(window.localStorage, next);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  const ar = lang === "ar";

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4">
      <div
        role="dialog"
        aria-label={ar ? "إعدادات ملفات تعريف الارتباط" : "Cookie settings"}
        className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-[var(--border-control)] bg-[var(--bg-primary)]/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:p-5"
      >
        <p className="flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          {ar
            ? "نُبقي إحصاءات مجهولة على موقعنا (بدون ملفات تعريف ارتباط وبدون بيانات شخصية) لنعرف الصفحات الأكثر زيارة. أدوات الطرف الثالث مثل Google لا تُحمَّل قبل موافقتك، ولا نبيع بياناتك. "
            : "We keep anonymous, cookie-free statistics on our own site to see which pages are visited. Third-party tools such as Google load only after you agree, and we do not sell your data. "}
          <Link
            href={getLocalizedHref("/privacy", lang)}
            className="font-bold text-[var(--text-primary)] underline decoration-[var(--gold)] underline-offset-4"
          >
            {ar ? "سياسة الخصوصية" : "Privacy policy"}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => answer("denied")}
            className="cursor-pointer rounded-full border border-[var(--border-control)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {ar ? "رفض" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => answer("granted")}
            className="bg-gold-gradient cursor-pointer rounded-full px-5 py-2.5 text-sm font-bold transition-transform duration-hover hover:-translate-y-0.5"
          >
            {ar ? "موافق" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}
