/**
 * The engine for the one HTML allowlist the site both **stores** and **serves**.
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
 * Node-only (`sanitize-html`), so it is never imported by a client component. The *policy* — which
 * tags, which attributes, which schemes — is in `./rich-policy`, because the console's paste filter
 * runs in a browser and must answer from the same list. The console's own text filtering lives in
 * `./format.ts`.
 */
import sanitizeHtml from 'sanitize-html';

import { RICH_ALLOWED_ATTRIBUTES, RICH_ALLOWED_SCHEMES, RICH_ALLOWED_TAGS } from './rich-policy';

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
