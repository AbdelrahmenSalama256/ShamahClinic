export type Locale = "ar" | "en";

export function getLocalizedHref(href: string, language: Locale = "ar"): string {
    const hasProtocol = /^[a-z]+:\/\//i.test(href);
    const baseUrl = hasProtocol ? href : `http://localhost${href.startsWith("/") ? href : `/${href ?? ""}`}`;
    const url = new URL(baseUrl);
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    const withoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
    const suffix = `${url.search}${url.hash}`;

    if (language === "en") {
        const localized = withoutLocale === "/" ? "/en" : `/en${withoutLocale}`;
        return `${localized}${suffix}`;
    }

    const localized = withoutLocale === "/" ? "/" : withoutLocale;
    return `${localized}${suffix}`;
}
