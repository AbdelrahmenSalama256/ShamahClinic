import { NextResponse } from "next/server";
import type { Lang } from "@/lib/wp/types";

/** CDN/browser cache for the normalized API (matches ISR revalidate). */
export const API_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
};

export function ok<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { headers: API_CACHE_HEADERS });
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export interface ApiQuery {
  page?: number;
  perPage?: number;
  category?: string;
  search?: string;
  lang?: Lang;
}

export function readQuery(req: Request): ApiQuery {
  const u = new URL(req.url);
  const num = (k: string) => {
    const raw = u.searchParams.get(k);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };
  const langRaw = u.searchParams.get("lang");
  return {
    page: num("page"),
    perPage: num("per_page"),
    category: u.searchParams.get("category") || undefined,
    search: u.searchParams.get("search") || undefined,
    lang: langRaw === "ar" || langRaw === "en" ? langRaw : undefined,
  };
}

/** Awaited dynamic route params (Next 16 makes params a Promise). */
export async function slugParam(ctx: { params: Promise<{ slug: string }> }): Promise<string> {
  const { slug } = await ctx.params;
  return decodeURIComponent(slug);
}
