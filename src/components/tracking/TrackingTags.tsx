"use client";

import { useEffect } from "react";
import { planIsEmpty, type TagPlan } from "@/lib/tracking/providers";
import { snippetPlan } from "@/lib/tracking/snippets";
import { EVENT_NAMES } from "@/lib/tracking/events";
import { CONSENT_EVENT, readConsent } from "@/lib/tracking/consent";
import { injectSnippet, trackEvent } from "@/lib/tracking/client";
import { track } from "@/lib/tracking/first-party";

const WHATSAPP_LINK = /^https?:\/\/(wa\.me|api\.whatsapp\.com)\//;
const MAPS_LINK = /^https?:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.(google|app\.goo\.gl)|goo\.gl\/maps)\b/;

/** A short, stable word for what was clicked, so a report can group on it. */
function labelOf(anchor: Element): string {
  const text = (anchor.getAttribute("aria-label") || anchor.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 60);
}

/**
 * The only place a marketing script enters the page. The plan was built on the server
 * from validated IDs; this component waits for consent, injects each vendor once, and
 * reports the two click conversions nobody has to remember to wire — every phone link
 * and every WhatsApp link on the site, including ones added later.
 *
 * The same listener feeds our own twelve named events. That half runs whether or not a
 * vendor is configured and whether or not consent was given, because it is first-party,
 * cookieless and already honours DNT in `track()`; consent governs the third-party tags
 * only.
 */
export function TrackingTags({ plan }: { plan: TagPlan }) {
  useEffect(() => {
    let granted = false;

    const apply = () => {
      if (!granted) return;
      for (const entry of snippetPlan(plan)) injectSnippet(entry.snippet);
    };

    const sync = () => {
      const next = readConsent(window.localStorage) === "granted";
      if (next && !granted) {
        granted = true;
        apply();
      } else if (!next) {
        granted = false;
      }
    };

    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [plan]);

  useEffect(() => {
    const vendorReporting = !planIsEmpty(plan);
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // A control that names itself counts once, whatever it is built from.
      const cta = target.closest("[data-cta]");
      const ctaKey = cta?.getAttribute("data-cta") ?? "";

      const anchor = target.closest("a[href]");
      if (ctaKey) track("cta_click", { cta: ctaKey });
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";

      if (href.startsWith("tel:")) {
        track("call_click", { location: anchor.closest("header, footer") ? "chrome" : "page", label: labelOf(anchor) });
        if (vendorReporting) trackEvent(EVENT_NAMES.phoneClick);
      } else if (WHATSAPP_LINK.test(href)) {
        track("whatsapp_click", { location: anchor.closest("header, footer") ? "chrome" : "page", label: labelOf(anchor) });
        if (vendorReporting) trackEvent(EVENT_NAMES.whatsappClick);
      } else if (MAPS_LINK.test(href)) {
        track("directions_click", { label: labelOf(anchor) });
      } else if (href.startsWith("/") && !href.startsWith("//") && anchor.closest("header, footer")) {
        track("nav_click", { href: href.split("?")[0].slice(0, 120), label: labelOf(anchor) });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [plan]);

  return null;
}
