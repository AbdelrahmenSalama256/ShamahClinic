/**
 * The call-to-action variants, in the one place both sides can read them.
 *
 * The public page (`./article-body.ts`, server-only: it parses with cheerio) cuts a FAQ pair and a
 * call-to-action box out of the prose by matching `section[data-block="faq"]`,
 * `[data-faq-answer]` and `section[data-block="cta"][data-cta]`, and the console editor
 * (`./block-schema.ts`, client-side) is the only writer of that markup. The variant list has to be
 * the same string set in both, so it lives here — a module with no dependency either way.
 * Importing it from `article-body.ts` in the editor would pull cheerio into the browser bundle.
 *
 * The words, the phone number and the link of a call-to-action box are deliberately *not* here:
 * `../components/pages/ArticleCtaBox.tsx` reads them from the clinic settings the console owns, so
 * a stored body cannot go stale the day the owner edits Settings.
 */

/** The three call-to-action boxes the body editor can insert. */
export const CTA_VARIANTS = ['consult', 'book', 'whatsapp'] as const;
export type CtaVariant = (typeof CTA_VARIANTS)[number];
