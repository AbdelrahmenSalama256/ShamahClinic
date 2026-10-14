import { Readex_Pro, Montserrat } from "next/font/google";

/**
 * Shared by the `[lang]` layout and `app/global-not-found.tsx`: the 404 document
 * is composed outside the layout tree, so it needs the same font variables.
 */
export const readexPro = Readex_Pro({
  subsets: ["arabic"],
  weight: "variable",
  variable: "--font-readex-pro",
  display: "swap",
});

export const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});
