"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/tracking/first-party";

/**
 * One page view per path per tab, from the one client boundary every public page has.
 *
 * It renders nothing and cannot fail a page: the tracker swallows private-mode and
 * beacon errors, and the server answers 204 whether or not the row was written. A
 * route change in the App Router keeps this component mounted, which is exactly why
 * the path is the dependency and the tab's seen-list is the de-duplication.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
