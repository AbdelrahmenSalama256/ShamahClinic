"use client";

import { useEffect } from "react";
import { planIsEmpty, type TagPlan } from "@/lib/tracking/providers";
import { snippetPlan } from "@/lib/tracking/snippets";
import { EVENT_NAMES } from "@/lib/tracking/events";
import { CONSENT_EVENT, readConsent } from "@/lib/tracking/consent";
import { injectSnippet, trackEvent } from "@/lib/tracking/client";

/**
 * The only place a marketing script enters the page. The plan was built on the server
 * from validated IDs; this component waits for consent, injects each vendor once, and
 * reports the two click conversions nobody has to remember to wire — every phone link
 * and every WhatsApp link on the site, including ones added later.
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
    if (planIsEmpty(plan)) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("tel:")) trackEvent(EVENT_NAMES.phoneClick);
      else if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) trackEvent(EVENT_NAMES.whatsappClick);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [plan]);

  return null;
}
