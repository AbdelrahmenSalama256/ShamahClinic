import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Arabic is the site default and owns the unprefixed URLs the whole app links
 * to (`/blogs`, `/offers/…`). Those requests are rewritten onto the Arabic
 * language segment so Server Components, metadata and `<html lang>` all render
 * Arabic on the server — the browser URL never changes.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  const lang = first === "ar" || first === "en" ? first : "ar";

  // `app/global-not-found.tsx` is rendered by the router instead of the `[lang]`
  // layout, so it cannot read which language segment was asked for. The prefix is
  // stamped on the request here and that file reads it back.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-shamah-lang", lang);

  if (first !== "ar" && first !== "en") {
    const url = request.nextUrl.clone();
    url.pathname = `/ar${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Static assets, route handlers and file-based metadata (sitemap.xml,
  // robots.txt) must reach their own handlers untouched.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.).*)"],
};
