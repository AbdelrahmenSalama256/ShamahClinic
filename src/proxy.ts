import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { decideRoute } from "@/lib/site-routing";
import { findRedirect, recordRedirectHit } from "@/lib/content/redirects";

/**
 * Arabic is the site default and owns the unprefixed URLs the whole app links
 * to (`/blogs`, `/offers/…`). Those requests are rewritten onto the Arabic
 * language segment so Server Components, metadata and `<html lang>` all render
 * Arabic on the server — the browser URL never changes. `/console` is exempt:
 * it is a separate app with its own root layout and its own language per account.
 *
 * Before any of that, the console's Redirects screen gets the first word: an old
 * address with a rule is answered with a 301/302 here, its query string (UTM tags,
 * gclid) carried along, and the hit counted after the response is sent.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/console")) {
    const redirect = await findRedirect(pathname);
    if (redirect) {
      const url = new URL(redirect.location, request.url);
      if (url.origin === request.nextUrl.origin) {
        for (const [key, value] of request.nextUrl.searchParams) {
          if (!url.searchParams.has(key)) url.searchParams.append(key, value);
        }
      }
      event.waitUntil(recordRedirectHit(redirect.id));
      return NextResponse.redirect(url, redirect.status);
    }
  }

  const { lang, rewriteTo } = decideRoute(pathname);

  // `app/global-not-found.tsx` is rendered by the router instead of the `[lang]`
  // layout, so it cannot read which language segment was asked for. The prefix is
  // stamped on the request here and that file reads it back — and so is the address
  // as the visitor typed it, which the 404 monitor records.
  const requestHeaders = new Headers(request.headers);
  if (lang) requestHeaders.set("x-shamah-lang", lang);
  requestHeaders.set("x-shamah-path", pathname);

  if (rewriteTo) {
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Static assets, route handlers and file-based metadata (sitemap.xml,
  // robots.txt) must reach their own handlers untouched.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.).*)"],
};
