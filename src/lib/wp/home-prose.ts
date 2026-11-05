/**
 * The prose rows the homepage (page 622) publishes.
 *
 * WordPress names its own WPBakery rows (`#about`, `#collection`, `#process`,
 * `#contact`), and the clinic writes real introduction copy inside them. Rows a
 * dedicated reader already displays — the revslider, the WooCommerce collection,
 * the office blocks, the services grid and the post list — are skipped here by
 * their markup, and every remaining single-heading row is returned so nothing the
 * data team wrote goes unshown.
 *
 * A row's body is its `<p>` elements, or the loose `<br>`-separated lines the
 * builder leaves in a `<strong>` when no paragraph was used. Paragraphs that are a
 * button label rather than prose (no sentence terminator, a handful of words) are
 * not returned: this site has its own booking action for that job, and a bare
 * command in a lead paragraph is not content the data team wrote for here.
 *
 * Arabic follows the rule the rest of the client uses: the Arabic subsite answer
 * counts only when WordPress actually wrote Arabic in it. Page 622 is currently
 * untranslated (its `/ar` REST body is English), so these rows render with the
 * authored Arabic and the live English.
 */
import * as cheerio from "cheerio";
import { arabicRatio } from "./lang";
import { decodeEntities } from "./sanitize";
import { mirrorSrc } from "./mirror";
import type { Bi } from "./types";

export interface HomeProseBlock {
  heading: string;
  paragraphs: string[];
  /** Mirrored upload URL of the row's own image, when it has one. */
  image: string | null;
  /** The WPBakery row anchor, e.g. "about" — WordPress's own name for the row. */
  anchor: string;
}

export interface BilingualHomeBlock {
  heading: Bi;
  /** English paragraphs; `ar` is empty wherever WordPress wrote no Arabic. */
  paragraphs: Bi[];
  image: string | null;
  anchor: string;
}

const ANCHORS = ["about", "collection", "process", "contact"];

/** A WPBakery row as cheerio hands it back, typed without naming its DOM library. */
type Row = ReturnType<cheerio.CheerioAPI>;

const clean = (value: string): string => decodeEntities(value).replace(/\s+/g, " ").trim();

/** "Book Your Consultation Now" — a button label, not a sentence. */
function isButtonLabel(text: string): boolean {
  return text.length < 60 && !/[.!?۔؟]$/.test(text) && text.split(/\s+/).length <= 8;
}

/** Rows another reader owns, recognised by their markup rather than their words. */
function shownElsewhere($: cheerio.CheerioAPI, $row: Row): boolean {
  if ($row.find("rs-module, rs-slide, .rev_slider").length) return true;
  const anchors = [$row.attr("id"), ...$row.find("[id]").toArray().map((el) => $(el).attr("id"))].filter(
    (id): id is string => !!id && ANCHORS.includes(id),
  );
  if (anchors.includes("collection") || anchors.includes("contact")) return true;
  if ($row.find("a[href*='/product/']").length) return true;
  // A services grid or a post list: several headings, no prose row to read.
  return $row.find("h1, h2, h3, h4").length > 1;
}

/** The row's own `<br>`-separated lines, when the builder skipped `<p>`. */
function looseLines($: cheerio.CheerioAPI, $row: Row): string[] {
  const body = $row.clone();
  body.find("h1, h2, h3, h4, h5, a, img, script, style, .ws-separator, .ws-footer-separator").remove();
  return (body.html() || "")
    .split(/<br\s*\/?>/i)
    .map((chunk) => clean(chunk.replace(/<[^>]*>/g, " ")))
    .filter((text) => text.length > 40);
}

/** Top-level WPBakery rows of a rendered page body, in dashboard order. */
function blocksOf(html: string): HomeProseBlock[] {
  const $ = cheerio.load(`<div id="__root">${html || ""}</div>`);
  const rows = $("#__root")
    .find("[class*='vc_row']")
    .toArray()
    .filter((el) => !$(el).parents("[class*='vc_row']").length);

  const out: HomeProseBlock[] = [];
  for (const el of rows) {
    const $row = $(el);
    if (shownElsewhere($, $row)) continue;
    const heading = clean($row.find("h1, h2, h3, h4").first().text());
    if (!heading) continue;
    const paragraphs = $row
      .find("p")
      .toArray()
      .map((p) => clean($(p).text()))
      .filter((text) => text.length > 1 && !isButtonLabel(text));
    const src = $row
      .find("img")
      .toArray()
      .map((img) => img.attribs?.src || img.attribs?.["data-lazyload"] || img.attribs?.["data-src"] || "")
      .find((value) => value.includes("/wp-content/uploads/")) || null;
    out.push({
      heading,
      paragraphs: paragraphs.length ? paragraphs : looseLines($, $row),
      image: src ? mirrorSrc(src) : null,
      anchor:
        [$row.attr("id"), ...$row.find("[id]").toArray().map((node) => $(node).attr("id"))].find(
          (id): id is string => !!id && ANCHORS.includes(id),
        ) || "",
    });
  }
  return out;
}

/**
 * Zip the English and Arabic row streams. TranslatePress mirrors the layout, but a
 * row only counts as the same block when its heading matches, so a row the Arabic
 * side reordered never gets pasted onto the wrong English copy.
 */
export function parseHomeProse(enHtml: string, arHtml: string): BilingualHomeBlock[] {
  const en = blocksOf(enHtml);
  const ar = blocksOf(arHtml);
  const arabic = (text: string) => (arabicRatio(text) > 0.3 ? text : "");

  return en.map((block) => {
    const partner = ar.find((row) => row.heading.toLowerCase() === block.heading.toLowerCase());
    return {
      anchor: block.anchor,
      image: block.image,
      heading: { ar: partner ? arabic(partner.heading) : "", en: block.heading },
      paragraphs: block.paragraphs.map((text, i) => ({
        ar: partner ? arabic(partner.paragraphs[i] || "") : "",
        en: text,
      })),
    };
  });
}

/** The row WordPress marks `#about` (Home's introduction) and the rest (About's sections). */
export function splitHomeProse(blocks: BilingualHomeBlock[]): {
  intro: BilingualHomeBlock | null;
  sections: BilingualHomeBlock[];
} {
  const intro = blocks.find((block) => block.anchor === "about") || null;
  return { intro, sections: blocks.filter((block) => block !== intro) };
}
