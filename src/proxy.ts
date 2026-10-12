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
  if (first === "ar" || first === "en") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/ar${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Static assets, route handlers and file-based metadata (sitemap.xml,
  // robots.txt) must reach their own handlers untouched.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.).*)"],
};
