/**
 * The teaser a card shows, in the language the page is printed in.
 *
 * Split out of `./site.ts` because the rule is the interesting part and the row it reads
 * is not: `excerpt_ar` is the most broken column the WordPress import left — 91 of the 94
 * published articles hold an English sentence there, most of them ending in the `[…]` the
 * teaser shortcode baked into the stored text — while the *body* beside it is proper
 * Arabic. So for Arabic, "not empty" cannot mean "usable", and the answer has to come from
 * the same language: a sentence cut from that language's own body.
 *
 * The rule is deliberately narrow. It replaces a value that cannot be read in this
 * language; it does not translate, does not take the other language's sentence, and does
 * not touch a body that is genuinely untranslated — that row belongs in the audit, not in
 * a generated sentence.
 */
import { deriveExcerpt, stripBuilderNoise } from '../wp/sanitize';
import { answersIn } from './language-fill';

/** A stored excerpt, or the sentence the body opens with when the excerpt says nothing. */
export function teaserIn(locale: 'ar' | 'en', stored: string, body: string): string {
  return answersIn(locale, stored) ? stored : deriveExcerpt(stripBuilderNoise(body));
}

/** Both languages, each answered from its own text. */
export function teaserPair(stored: { ar: string; en: string }, body: { ar: string; en: string }): {
  ar: string;
  en: string;
} {
  return { ar: teaserIn('ar', stored.ar, body.ar), en: teaserIn('en', stored.en, body.en) };
}
