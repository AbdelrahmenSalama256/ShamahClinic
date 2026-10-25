/**
 * What a paste is allowed to put into a body, before any of it reaches the editing surface.
 *
 * The server is still the authority — `sanitizeRichHtml()` filters every body on the way in and
 * `sanitizeHtmlBody()` filters it again on the way out. This exists because a person pastes from
 * a browser, an email client or Word and then *keeps typing in what they pasted*: if a `<script>`
 * or a `<span style="…">` rides into the surface, the body they see is not the body that saves,
 * and the sentence "the console shows what the site prints" is false for the one field where
 * markup is legal.
 *
 * The semantics deliberately match `disallowedTagsMode: 'discard'`: a tag nobody allowed loses
 * its markers and keeps its text, so pasting a Word document costs the styling and not the words.
 * Elements whose contents are not prose — script, style, iframe, template — go with their
 * contents, which is stricter than the server and never looser: a body that survives this filter
 * cannot gain anything on the way in.
 *
 * Pure string work, no `DOMParser`: this runs in a Node test without a window, and a cleaner a
 * suite cannot reach is a cleaner nobody can trust with the corpus it is meant to survive.
 */
import { decodeEntities } from '@/lib/content/format';
import { isAllowedAttribute, isAllowedHref, isAllowedTag } from '@/lib/content/rich-policy';

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/** Not prose, and their insides are not prose either. */
const NON_PROSE = /<(script|style|noscript|iframe|object|embed|template|form|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/**
 * One tag, with its attributes.
 *
 * The attribute run alternates between a quoted value and a character that is not a bracket, so
 * `title="a > b"` is one token. The name has to start with a letter, which is what keeps a
 * person's `12 < 15` and `<3` as the text they typed.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^<>])*?)(\/?)>/g;

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;

/** The value as a browser would read it — for a test, never for what gets written back. */
function decoded(value: string): string {
  return decodeEntities(value).trim();
}

function keepAttribute(tag: string, name: string, value: string): boolean {
  if (name.startsWith('on')) return false;
  if (!isAllowedAttribute(tag, name)) return false;
  if (name === 'href' || name === 'src') return isAllowedHref(decoded(value));
  return true;
}

/** An `attribute="value"` pair, with the value's own entities left exactly as they arrived. */
function emitAttribute(name: string, value: string, present: boolean): string {
  if (!present) return name;
  return ` ${name}="${value.replace(/"/g, '&quot;')}"`;
}

/**
 * The paste as the policy allows it, tag for tag.
 *
 * Attributes are re-emitted rather than carried over whole: `class` may stay, `style` may not, and
 * the difference is a property of the *attribute*, not of the element — which is why a keep-list is
 * read per attribute and an unknown one simply does not come back.
 */
export function cleanPaste(html: string): string {
  if (!html) return '';
  const withoutComments = html.replace(COMMENT, '');
  const withoutNonProse = withoutComments.replace(NON_PROSE, '');

  return withoutNonProse.replace(TAG, (_whole, closing: string, name: string, attrRun: string, selfClosed: string) => {
    const tag = name.toLowerCase();
    if (!isAllowedTag(tag)) return '';
    if (closing) return `</${tag}>`;

    const attrs: string[] = [];
    let forcesRel = false;
    for (const match of attrRun.matchAll(ATTR)) {
      const key = (match[1] ?? '').toLowerCase();
      const quoted = match[2] ?? match[3];
      const bare = match[4];
      const present = quoted !== undefined || bare !== undefined;
      const value = quoted ?? bare ?? '';
      if (!keepAttribute(tag, key, value)) continue;
      attrs.push(emitAttribute(key, value, present));
      if (tag === 'a' && key === 'target' && present && decoded(value) !== '') forcesRel = true;
    }
    // A link that opens a new tab must not be able to reach back into the console tab that
    // opened it — the same rewrite `sanitizeRichHtml()` makes, so a paste does not change on save.
    if (forcesRel) {
      const existing = attrs.find((entry) => entry.startsWith(' rel="'));
      if (existing) {
        if (!/noopener/.test(existing)) attrs.splice(attrs.indexOf(existing), 1, ' rel="noopener noreferrer"');
      } else {
        attrs.push(' rel="noopener noreferrer"');
      }
    }

    return `<${tag}${attrs.join('')}${selfClosed ? ' /' : ''}>`;
  });
}
