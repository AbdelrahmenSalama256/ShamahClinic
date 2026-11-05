import { lang as langParam } from "next/root-params";
import type { Locale } from "./locale";

/**
 * Arabic is the default language and keeps unprefixed URLs: `/x` is served by
 * `src/proxy.ts` as an internal rewrite of `/ar/x`, while `/en/x` matches the
 * segment directly. `app/[lang]` sits above the root layout, so `lang` is a root
 * parameter and every Server Component can read it without prop drilling.
 */
export async function routeLang(): Promise<Locale> {
  return normalizeLang(await langParam()) ?? "ar";
}

export function normalizeLang(value: string | undefined | null): Locale | null {
  return value === "ar" || value === "en" ? value : null;
}

/** Both language roots are prerendered; unknown values 404. */
export function langStaticParams(): Array<{ lang: Locale }> {
  return [{ lang: "ar" }, { lang: "en" }];
}
