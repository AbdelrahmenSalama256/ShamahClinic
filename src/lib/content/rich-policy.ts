/**
 * The prose a body is allowed to hold, written down once.
 *
 * Three doors read it and they must answer from the same list: `sanitizeRichHtml()` filters a
 * body on the way **in**, `sanitizeHtmlBody()` filters it on the way **out**, and the console's
 * paste filter cleans what a person sticks into the editor before either of those runs. A tag
 * the paste filter drops and the server keeps is a sentence the person loses without being told;
 * a tag the paste filter keeps and the server drops is a body that changes when it is saved.
 *
 * Isomorphic on purpose. `rich.ts` needs the Node-only `sanitize-html` engine and a client
 * component may not import it, so the *policy* lives here and only the *engine* lives there.
 */

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
export const RICH_ALLOWED_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel'];

const TAGS = new Set(RICH_ALLOWED_TAGS);

export function isAllowedTag(tag: string): boolean {
  return TAGS.has(tag.toLowerCase());
}

/** Does this attribute survive on this element? `*` is the list every element shares. */
export function isAllowedAttribute(tag: string, name: string): boolean {
  const key = name.toLowerCase();
  if (RICH_ALLOWED_ATTRIBUTES[tag.toLowerCase()]?.includes(key)) return true;
  return RICH_ALLOWED_ATTRIBUTES['*']?.includes(key) ?? false;
}

/**
 * Is this address one the site will print?
 *
 * Control characters and whitespace are stripped before the scheme is read, because `java\nscript:`
 * and ` javascript:` are the same address to a browser and a different one to a naive prefix test.
 * A value with no scheme at all — `/uploads/a.webp`, `#section`, `offer/derma-pen` — is the site
 * pointing at itself and is what the policy is for.
 */
export function isAllowedHref(value: string): boolean {
  const cleaned = value.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:/.test(cleaned)) return true;
  const name = cleaned.slice(0, cleaned.indexOf(':'));
  return RICH_ALLOWED_SCHEMES.includes(name);
}
