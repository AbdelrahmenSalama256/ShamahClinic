import { siteConfig } from "@/config/site";

export type Locale = "ar" | "en";

export function getLocalizedHref(
    href: string,
    language: Locale = siteConfig.defaultLanguage,
): string {
    const hasProtocol = /^[a-z]+:\/\//i.test(href);
    const baseUrl = hasProtocol ? href : `http://localhost${href.startsWith("/") ? href : `/${href ?? ""}`}`;
    const url = new URL(baseUrl);
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    const withoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
    const suffix = `${url.search}${url.hash}`;

    const localized =
        language === siteConfig.defaultLanguage
            ? withoutLocale
            : withoutLocale === "/"
                ? `/${language}`
                : `/${language}${withoutLocale}`;
    return `${localized}${suffix}`;
}
