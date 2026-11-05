import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideRoute } from "@/lib/site-routing";

/**
 * Arabic is the site default and owns the unprefixed URLs the whole app links
 * to (`/blogs`, `/offers/…`). Those requests are rewritten onto the Arabic
 * language segment so Server Components, metadata and `<html lang>` all render
 * Arabic on the server — the browser URL never changes. `/console` is exempt:
 * it is a separate app with its own root layout and its own language per account.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { lang, rewriteTo } = decideRoute(pathname);

  // `app/global-not-found.tsx` is rendered by the router instead of the `[lang]`
  // layout, so it cannot read which language segment was asked for. The prefix is
  // stamped on the request here and that file reads it back.
  const requestHeaders = new Headers(request.headers);
  if (lang) requestHeaders.set("x-shamah-lang", lang);

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
