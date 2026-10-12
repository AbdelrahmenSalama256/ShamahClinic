import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const WP_TAGS = ["wp:en", "wp:ar", "wp:seo"];

/**
 * Route patterns, not concrete URLs: `type: "page"` invalidates every path that
 * matches, so one call covers the Arabic and the English render of each route.
 */
const PATHS = [
  "/[lang]",
  "/[lang]/blogs",
  "/[lang]/blogs/[slug]",
  "/[lang]/offers",
  "/[lang]/offers/[slug]",
  "/[lang]/services",
  "/[lang]/services/[slug]",
  "/[lang]/treatments",
  "/[lang]/treatments/[slug]",
  "/[lang]/branches",
  "/[lang]/branches/[slug]",
  "/[lang]/about",
  "/[lang]/contact",
  "/[lang]/faq",
  "/[lang]/privacy",
  "/[lang]/doctors",
  "/[lang]/results",
];

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const url = new URL(req.url);
  const provided = req.headers.get("x-revalidate-secret") || url.searchParams.get("secret");

  if (!secret) {
    return NextResponse.json({ ok: false, error: "REVALIDATE_SECRET not configured" }, { status: 500 });
  }
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Next 16: revalidateTag takes a cacheLife profile as its second argument.
  for (const tag of WP_TAGS) {
    try {
      revalidateTag(tag, "max");
    } catch {
      /* tag may not exist yet */
    }
  }
  for (const path of PATHS) {
    try {
      revalidatePath(path, "page");
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true, revalidated: { tags: WP_TAGS, paths: PATHS } });
}
