/**
 * The one authored sentence pair the homepage still borrows.
 *
 * Everything else this file used to hold — the About page's story, values, reasons and
 * numbers — is a `pages` row now: `src/lib/content/list-schema.ts` describes the document,
 * `src/lib/content/about-page.ts` reads its published copy, and the console edits it. A
 * fallback copy of a page that has its own row is a second source of truth, so none is
 * left here.
 */
export interface Bilingual {
  ar: string;
  en: string;
}

/**
 * Home's introduction row. WordPress publishes this row's English on the homepage
 * (`#about` of page 622), but the Arabic subsite serves the English body untouched,
 * so the authored Arabic is the Arabic side until the team translates that row.
 * The English pair stands in when neither the live site nor the snapshot answers.
 */
export const homeIntroFallback: { title: Bilingual; lead: Bilingual } = {
  title: { ar: "لماذا تختار العميلات عيادات شامه؟", en: "Why clients choose Shamah Clinics" },
  lead: {
    ar: "لأننا نتعامل مع البشرة كحالة طبية تحتاج تقييماً وخطة، لا كمنتج يُباع. هذا ما يجعل النتائج طبيعية ومستقرة.",
    en: "Because we treat skin as a medical case needing assessment and a plan, not a product to sell. That is what makes results natural and stable.",
  },
};
