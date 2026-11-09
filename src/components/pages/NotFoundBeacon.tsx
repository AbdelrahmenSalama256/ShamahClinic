"use client";

import { useEffect } from "react";

/**
 * Tells the 404 monitor about a miss a page answered with `notFound()` — an old article
 * slug, a removed offer. It runs only when the not-found page is really on screen, which
 * is the one thing the server render of that fallback cannot know.
 */
/** One beacon per page view, even where React runs an effect twice. */
let lastSent = "";

export function NotFoundBeacon() {
  useEffect(() => {
    const key = window.location.pathname + performance.timeOrigin;
    if (lastSent === key) return;
    lastSent = key;
    const body = JSON.stringify({ path: window.location.pathname, referrer: document.referrer });
    if (!navigator.sendBeacon?.("/api/not-found", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/not-found", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }, []);
  return null;
}
