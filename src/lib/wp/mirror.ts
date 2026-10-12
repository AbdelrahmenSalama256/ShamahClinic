import fs from "node:fs";
import path from "node:path";

/**
 * WordPress serves its uploads as 0.9–2 MB PNGs from an origin that takes 4–6 s to
 * answer, and `next/image` has to fetch them before it can resize them — which is
 * what made a journal article's featured image the slowest thing on the page.
 *
 * `npm run sync:wp` downloads the images the site actually renders, re-encodes them
 * small, and records the pairing here. A URL that is not in this map (an upload added
 * after the last sync) simply keeps its live WordPress address, so mirroring can never
 * hide new content.
 */
const FILE = path.join(process.cwd(), "data", "wp", "images.json");

let map: Record<string, string> | null | undefined;

function load(): Record<string, string> {
  if (map !== undefined) return map || {};
  try {
    map = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, string>;
  } catch {
    map = null;
  }
  return map || {};
}

/** The locally mirrored copy of a WordPress upload URL, or the URL unchanged. */
export function mirrorSrc(url: string): string;
export function mirrorSrc(url: string | null): string | null;
export function mirrorSrc(url: string | null): string | null {
  if (!url) return url;
  const key = url.split("?")[0];
  return load()[key] || url;
}

/** Swap every WordPress upload src inside rendered post HTML. */
export function mirrorHtml(html: string): string {
  return html.replace(/src="([^"]*\/wp-content\/uploads\/[^"]+)"/g, (all, src: string) =>
    `src="${mirrorSrc(src)}"`,
  );
}
