import localFont from "next/font/local";

/**
 * Tajawal — the one face both surfaces and both scripts are drawn in (BK-19.2).
 *
 * Four static weights, because the family has no variable version: a request for
 * 600 (`font-semibold`) resolves to 700 and for 900 (`font-black`) to 800, which is
 * where the console and the site already sit. Each file carries the Arabic and the
 * Latin in one cmap, so a mixed run inside one `<p>` gets one family and matching
 * metrics — which is why there is no `[dir="ltr"]` override any more.
 *
 * `next/font/local` rather than `next/font/google` for two reasons: `npm run build`
 * stops needing `fonts.googleapis.com` (BK-0.2 recorded that a build with no
 * outbound DNS fails outright, and BK-11's cPanel host may not have it), and
 * `adjustFontFallback` still measures the real file, so the swap from the system
 * fallback costs no layout shift.
 *
 * The files are the upstream Tajawal binaries from `google/fonts` (ofl/tajawal,
 * v12), converted TTF→WOFF2 with fonttools 4.67 and otherwise unmodified; the SIL
 * Open Font License they travel under is `OFL.txt` beside them.
 */
export const tajawal = localFont({
  src: [
    { path: "./files/tajawal-400.woff2", weight: "400", style: "normal" },
    { path: "./files/tajawal-500.woff2", weight: "500", style: "normal" },
    { path: "./files/tajawal-700.woff2", weight: "700", style: "normal" },
    { path: "./files/tajawal-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-tajawal",
  display: "swap",
});
