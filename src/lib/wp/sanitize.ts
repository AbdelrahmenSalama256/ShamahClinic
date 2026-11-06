import sanitizeHtml from "sanitize-html";
import * as cheerio from "cheerio";
import { WP_ORIGIN } from "./config";
import { mirrorSrc, mirrorHtml } from "./mirror";
import { RICH_ALLOWED_ATTRIBUTES, RICH_ALLOWED_TAGS } from "../content/rich-policy";
import { stripEllipsisArtifact } from "../text-script";

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
};

/** Decode HTML entities (named + numeric) in a plain-text field. */
export function decodeEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}
function safeCodePoint(cp: number): string {
  try {
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  } catch {
    return "";
  }
}

/** Strip WPBakery/Elementor wrapper classes and shortcode leftovers from rendered HTML. */
export function stripBuilderNoise(html: string): string {
  return html
    .replace(/<!--\s*Elementor\s*-->/gi, "")
    .replace(/class="[^"]*\b(?:vc_[a-z0-9-]+|wpb_[a-z0-9-]+|elementor[a-z0-9-]*|rev_slider[a-z0-9-]*|rs-[a-z0-9-]+)\b[^"]*"/gi, 'class=""')
    .replace(/\[(?:vc_[^\]]*|rev_slider[^\]]*|\/)[^\]]*\]/gi, "");
}

/**
 * Sanitize + clean + rewrite internal WordPress links to first-party routes.
 *
 * The tags and attributes are the ones `../content/rich.ts` filters a console save with,
 * so the markup that passes the door going in is the markup allowed through the door
 * going out. Only builder noise and WordPress URLs are this function's own business.
 */
export function sanitizeHtmlBody(html: string): string {
  const cleaned = stripBuilderNoise(html || "");
  const safe = sanitizeHtml(cleaned, {
    allowedTags: [...RICH_ALLOWED_TAGS],
    allowedAttributes: Object.fromEntries(Object.entries(RICH_ALLOWED_ATTRIBUTES).map(([tag, list]) => [tag, [...list]])),
    allowedSchemes: ["http", "https", "mailto", "tel"],
    disallowedTagsMode: "discard",
  });
  // Mirror first: the map is keyed by the absolute WordPress URL, and link
  // rewriting would turn inline `src`s relative before they could be matched.
  return rewriteInternalLinks(mirrorHtml(safe));
}

/** Turn absolute shamahclinics.com URLs into relative first-party paths. */
export function rewriteInternalLinks(html: string): string {
  const host = WP_ORIGIN.replace(/^https?:\/\//, "");
  return html
    .replace(new RegExp(`https?:\\/\\/${host.replace(/\./g, "\\.")}\\/ar\\/`, "g"), "/ar/")
    .replace(new RegExp(`https?:\\/\\/${host.replace(/\./g, "\\.")}\\/`, "g"), "/")
    .replace(new RegExp(`https?:\\/\\/${host.replace(/\./g, "\\.")}`, "g"), "");
}

/** Plain-text rendering of an HTML fragment (for excerpts / meta descriptions). */
export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div>${html || ""}</div>`);
  $("script, style").remove();
  // Tag selector, not `#div` (that would match an element with id="div").
  return stripEllipsisArtifact(decodeEntities($("div").first().text()).replace(/\s+/g, " ").trim());
}

/** First real paragraph of a body, as a teaser. WordPress auto-excerpts are
 *  English-only on the Arabic subsite, so translated bodies supply the Arabic one. */
export function firstParagraph(html: string, max = 180): string {
  const $ = cheerio.load(`<div>${html || ""}</div>`);
  $("script, style").remove();
  const texts = $("p")
    .toArray()
    .map((p) => decodeEntities($(p).text()).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40);
  const text = texts[0] || "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/[^ ]*$/, "").trim()}…`;
}

/**
 * A teaser for a body, when the excerpt column says nothing usable.
 *
 * The excerpt columns of the imported corpus are the broken part, not the bodies: an
 * Arabic article whose `excerpt_ar` holds an English sentence still opens with the
 * Arabic paragraph a card should have shown. This reads the body — first paragraph,
 * else first text — and cuts it at a word boundary, because the alternative is
 * rendering the other language's sentence under the Arabic headline.
 */
/**
 * A teaser for a body, when the excerpt column says nothing usable.
 *
 * The excerpt columns of the imported corpus are the broken part, not the bodies: an
 * Arabic article whose `excerpt_ar` holds an English sentence still opens with the
 * Arabic paragraph a card should have shown. This reads the body — first paragraph, else
 * the first text — and cuts it at a word boundary, because the alternative is rendering
 * the other language's sentence under the Arabic headline.
 *
 * No parser, on purpose: a list of 94 cards asks for this once per card per language, and
 * loading each body into cheerio to read one paragraph is the difference between a
 * journal page that renders and one that thinks about it.
 */
export function deriveExcerpt(html: string, max = 180): string {
  const source = html || "";
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " "));
  const raw = paragraph ? paragraph[1] : source;
  const text = stripEllipsisArtifact(
    decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
  );
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/[^ ]*$/, "").trim()}…`;
}

/** Pick the best responsive src for a WP image element. */
export function bestImageSrc(sizes: Record<string, { source_url: string }> | undefined, full: string): string {
  if (!sizes) return mirrorSrc(full);
  const preferred = ["large", "medium_large", "full", "medium"];
  for (const key of preferred) if (sizes[key]?.source_url) return mirrorSrc(sizes[key].source_url);
  const first = Object.values(sizes)[0];
  return mirrorSrc(first?.source_url || full);
}
