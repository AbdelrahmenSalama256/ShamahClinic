/**
 * The one HTML allowlist the site both **stores** and **serves**.
 *
 * A body is the only content the site prints as markup (`dangerouslySetInnerHTML` in the
 * article, offer and service templates), so it is the only place operator-typed HTML can
 * become a script running with the visitor's session. Two doors have to agree about what
 * is allowed, or the copy that passes the save is not the copy that reaches a visitor:
 *   - `sanitizeRichHtml()` runs on the way **in**, so the database never holds a `<script>`,
 *     an `onerror=` or a `javascript:` href at all — a dump, a restore or a future renderer
 *     cannot turn stored content into an attack;
 *   - `sanitizeHtmlBody()` in `../wp/sanitize.ts` runs on the way **out**, and reads its
 *     tags and attributes from here, so the two passes cannot drift apart.
 *
 * Node-only (`sanitize-html`), so it is never imported by a client component. The console's
 * own filtering lives in `./format.ts` and in the editor's DOMParser pass.
 */
import sanitizeHtml from 'sanitize-html';

/** Prose a copy editor writes: headings, emphasis, lists, quotes, links, pictures, tables. */
export const RICH_ALLOWED_TAGS: readonly string[] = [
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
];

/**
 * What may survive on a tag that is allowed.
 *
 * `class` is kept because the site's prose styles hang off it (`wp-block-paragraph` and
 * friends), and it carries no behaviour. `style` is not: an inline declaration can
 * overlay the page, hide a cookie banner or data-exfiltrate through a background URL.
 */
export const RICH_ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  '*': ['class'],
};

/** `data:` would let a whole document ride in an `href`; `blob:` dies with the tab. */
const RICH_ALLOWED_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel'];

export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [...RICH_ALLOWED_TAGS],
    allowedAttributes: Object.fromEntries(Object.entries(RICH_ALLOWED_ATTRIBUTES).map(([tag, list]) => [tag, [...list]])),
    allowedSchemes: [...RICH_ALLOWED_SCHEMES],
    disallowedTagsMode: 'discard',
    // A link that opens a new tab must not be able to reach back into the console tab
    // that opened it, whatever the author pasted as `rel`.
    transformTags: {
      a: (_name, attribs) => ({
        tagName: 'a',
        attribs: attribs.target ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
      }),
    },
  });
}
