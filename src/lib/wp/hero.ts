import * as cheerio from "cheerio";
import type { PhotoSlot } from "@/lib/images";
import { mirrorSrc } from "./mirror";
import { decodeEntities } from "./sanitize";
import { toPhotoSlot } from "./ui-helpers";
import type { Bi } from "./types";

/**
 * The homepage slider of the live WordPress site (revslider block on page 622).
 *
 * `sanitizeHtmlBody` discards the `rs-module`/`rs-slide` tags, so this parses the
 * raw rendered body instead, and the result is used only as a background photo —
 * the slide captions and their own "Book Now"/"Shop Now" buttons have no slot in
 * this site's hero, which keeps its authored bilingual headline.
 *
 * Each slide carries its image in `data-thumb` plus a lazy-loading `data-lazyload`
 * (printed protocol-relative and without the `www` the media library uses), and an
 * `alt` naming the treatment shown.
 */
export interface WpSlide {
  src: string;
  alt: Bi;
  width: number;
  height: number;
}

function altText(raw: string | undefined): string {
  return decodeEntities(raw || "").replace(/\s+/g, " ").trim();
}

export function parseSliderPhotos(html: string): WpSlide[] {
  if (!html) return [];
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  const slides = $("#__root").find("rs-slide").toArray();
  const nodes = slides.length ? slides : $("#__root").find("img[data-lazyload]").toArray();
  const out: WpSlide[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const $node = $(node);
    const $img = $node.is("img") ? $node : $node.find("img").first();
    const raw = $node.attr("data-thumb") || $img.attr("data-lazyload") || $img.attr("src") || "";
    if (!raw.includes("/wp-content/uploads/")) continue;
    const src = mirrorSrc(raw);
    if (seen.has(src)) continue;
    seen.add(src);
    const alt = altText($img.attr("alt")) || altText($img.attr("title"));
    const width = Number($img.attr("width")) || 1280;
    const height = Number($img.attr("height")) || 853;
    out.push({ src, alt: { ar: alt, en: alt }, width, height });
  }
  return out;
}

/**
 * The hero background follows the dashboard: the slider images WordPress publishes,
 * in the order the page lists them. `images.hero` (an authored local photo) is used
 * The page has no hero when the CMS publishes no slider photographs.
 */
export function heroPhotos(html: string): PhotoSlot[] {
  const slides = parseSliderPhotos(html);
  // Slider frames are wide cover shots, so the crop stays centred the way the
  // WordPress slider itself crops them.
  return slides.map((slide) => ({ ...toPhotoSlot(slide.src, slide.alt), width: slide.width, height: slide.height }));
}
