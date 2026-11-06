/**
 * The two string passes that make the editor's document and the database's column agree.
 *
 * The stored body is HTML and the editor's document is a ProseMirror tree, and neither of them is
 * a perfect model of the other: WordPress wrote shapes this schema cannot name (`<h1>` used as a
 * section heading) and the schema writes shapes WordPress never did (`<li><p>text</p></li>`, one
 * long line with no newlines between blocks). `openBody()` runs on the way into the surface and
 * `closeBody()` on the way out, so what a person sees is what gets saved, and re-opening what was
 * saved changes nothing.
 *
 * Both are pure string work with no DOM dependency, in the same house style as
 * `../console/paste-filter.ts` — which is what lets the browser, the Node round-trip test and the
 * server agree without anyone importing ProseMirror on the server. Every rule here is bounded to
 * the shapes the corpus actually holds (see `./block-schema` for the census), because a regex over
 * arbitrary HTML is how a document gets mangled.
 */

/** Block-level tags whose boundary is a line break in every WordPress body. */
const BLOCK_TAGS = 'p|h2|h3|h4|h5|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|figure|section|hr';

/** `<h1>` in a body is WordPress's own doing; the page's hero already prints the title. */
export function h1ToH2(html: string): string {
  return html
    .replace(/<h1(\s[^>]*)?>/gi, '<h2$1>')
    .replace(/<\/h1\s*>/gi, '</h2>');
}

/**
 * The first paragraph of a list item or a table cell is not a paragraph.
 *
 * ProseMirror needs a block inside `<li>` and inside `<td>` — that is where a nested list or a
 * second line lives — while WordPress wrote the inline content directly for all 7 712 items in the
 * corpus and for every one of its 644 cells, and the site's list and table styles hang off that
 * shape. Unwrapped only when the paragraph holds nothing block level, so a genuinely multi-block
 * item keeps its structure; the item's own attributes survive (960 list items carry
 * `translation-block`) and the paragraph's `wp-block-paragraph` goes with the tag, which is what
 * WordPress never wrote inside a list item anyway.
 */
export function unwrapFlatParagraphs(html: string): string {
  return html.replace(
    /<(li|td|th)(\s[^>]*)?>\s*<p(?:\s[^>]*)?>((?:(?!<\/?(?:p|li|td|th|ul|ol|table|h2|h3|h4|h5|blockquote)\b)[\s\S])*?)<\/p>/gi,
    (_all, tag: string, attrs: string | undefined, inner: string) => `<${tag}${attrs ?? ''}>${inner}`,
  );
}

/** Line breaks between blocks, the way WordPress stored them, so a column diff stays readable. */
export function spaceBlocks(html: string): string {
  return html
    .replace(new RegExp(`(?<!^)(?<!\n)<(${BLOCK_TAGS})\\b`, 'gi'), '\n<$1')
    .replace(new RegExp(`</(${BLOCK_TAGS})>(?!$)(?!\n)`, 'gi'), '</$1>\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * A space that follows a forced break is not part of the text.
 *
 * ProseMirror drops it when it parses (`<br>` and a following space are one line break), so a body
 * that keeps the space in its HTML would open, save and open again with the document quietly
 * shifting. WordPress wrote it 8 times in this corpus, always as `<strong><br></strong><strong> ` —
 * two adjacent strong runs merged into one, which is where the space between them came from.
 *
 * `&nbsp;` and U+00A0 are not touched: they are characters a visitor sees.
 */
export function dropSpaceAfterBreak(html: string): string {
  return html.replace(/(<br(?:\s[^>]*)?>)[ \t\r\n\f]+/gi, '$1');
}

/** Stored body → what the editor's schema can parse without inventing or losing anything. */
export function openBody(html: string): string {
  if (!html) return '';
  return dropSpaceAfterBreak(h1ToH2(html)).trim();
}

/** Editor output → the shape the column, the allowlist and the stylesheet expect. */
export function closeBody(html: string): string {
  if (!html) return '';
  return spaceBlocks(dropSpaceAfterBreak(unwrapFlatParagraphs(html))).trim();
}
