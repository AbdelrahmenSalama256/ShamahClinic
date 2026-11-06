/**
 * #246 → P1-A: the body is written as a document, and the blocks the site prints are the blocks
 * the editor offers.
 *
 * `tests/paste-filter.test.ts` proves a paste cannot smuggle markup past the server's allowlist.
 * This file proves the rest of what the owner asked for — *"still cms has HTML tags apear in
 * editors"*, and then a FAQ pair, a call-to-action box and a picture with alt text in the body —
 * is true of `BlockEditor.tsx` in the four ways that can be checked without a browser:
 *
 *   - **the row that holds markup opens the editor**, before it opens a textarea, in both places
 *     an `html` column is edited: the article screen and the two-language list rows.
 *   - **the schema, not a string, is the model.** The component imports the same
 *     `blockExtensions` the round-trip proof runs on, so what a person can insert is what the
 *     tests showed the column can hold and the renderer can print.
 *   - **what is saved is what the door was proved against.** `closeBody(editor.getHTML())` on the
 *     way out, `cleanPaste(openBody(value))` on the way in, and the string this surface produced
 *     is remembered so the row echoing it back cannot re-parse the page under a caret.
 *   - **every word and every class it emits exists.** The catalog has both languages for each
 *     label, and the console kit styles each `console-block-*` class the component puts on a node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { CTA_VARIANTS } from '../src/lib/content/block-contract';
import { BlockEditor } from '../src/components/console/BlockEditor';
import type { MessageKey } from '../src/lib/console/messages';

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');

const editorSource = read('src', 'components', 'console', 'ConsoleEditor.tsx');
const listSource = read('src', 'components', 'console', 'ListDocFields.tsx');
const blockSource = read('src', 'components', 'console', 'BlockEditor.tsx');
const schemaSource = read('src', 'lib', 'content', 'block-schema.ts');

/** Declarations, not prose: a header that names a class it replaced is not a second stylesheet. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');
// Slice 0 of the console redesign: the editor is a console component and its sheet is the
// console kit, not the public site's control layer.
const kit = code(read('src', 'app', '(console)', 'console', 'console-kit.css'));

/** The first declaration block for a selector, exactly as `ui-primitives.test.ts` reads one. */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\n\\s*${escaped} \\{`).exec(source);
  expect(match, `${selector} is styled`).not.toBeNull();
  return source.slice(match!.index, source.indexOf('}', match!.index));
}

/** The English console, which is what a screen the tests read is dressed in. */
const words = catalogFor('en');

/**
 * The editor as React paints it, before TipTap builds the document.
 *
 * Not a browser: `immediatelyRender: false` means the first render is the toolbar, the panels and
 * the sheet's words, and everything that needs a caret arrives after it. So what a static render
 * proves is what a person is handed before they touch anything — and that no textarea is in it.
 */
function markupOf(props: Partial<React.ComponentProps<typeof BlockEditor>> = {}): string {
  return renderToStaticMarkup(
    createElement(BlockEditor, {
      labels: words,
      value: '<p>hello</p>',
      disabled: false,
      inputId: 'field-content',
      title: 'Body',
      rtl: false,
      onChange: () => {},
      ...props,
    }),
  );
}

describe('the row that holds markup opens the editor', () => {
  it('takes the editor branch before the textarea branch', () => {
    expect(editorSource).toContain('if (field.format === \'html\')');
    const rich = editorSource.indexOf('<BlockEditor');
    const textarea = editorSource.indexOf('<Textarea');
    expect(rich).toBeGreaterThan(-1);
    expect(textarea).toBeGreaterThan(-1);
    expect(rich, 'the html branch is taken first').toBeLessThan(textarea);
  });

  it('hands the surface the row’s identity, label and direction', () => {
    expect(editorSource).toMatch(/<BlockEditor[\s\S]*?value=\{text\}/);
    expect(editorSource).toMatch(/inputId=\{id\}/);
    expect(editorSource).toMatch(/title=\{label\}/);
    expect(editorSource).toMatch(/rtl=\{locale === 'ar'\}/);
  });

  it('opens one editor per language on a two-column row, each in its own direction', () => {
    expect((listSource.match(/<BlockEditor/g) ?? []).length).toBe(2);
    expect(listSource).toMatch(/inputId=\{`\$\{id\}-ar`\}/);
    expect(listSource).toMatch(/rtl\n/);
    expect(listSource).toMatch(/rtl=\{false\}/);
  });

  it('keeps the imported page document as source, on purpose', () => {
    // `format: 'source'` is the homepage's hero document; a WYSIWYG over it would rewrite the
    // shape the site reads. It stays a textarea, and the editor's own note says why.
    // A JSON column never reaches that textarea: the gallery claims the picture fields, and a
    // document with no form is said on the screen instead of offered as text to paste into.
    expect(editorSource).toMatch(/if \(isImageGalleryField\(name, field\)\)/);
    expect(editorSource).toMatch(/if \(field\.kind === 'json'\) \{\s*return <Alert>/);
    expect(read('src', 'lib', 'content', 'format.ts')).toMatch(/'plain' \| 'html' \| 'source'/);
  });

  it('leaves no other body field a place to type a tag', () => {
    const kinds = read('src', 'lib', 'content', 'kinds.ts');
    expect((kinds.match(/format: 'html'/g) ?? []).length).toBe(2);
    expect((kinds.match(/format: 'source'/g) ?? []).length).toBe(1);
  });
});

describe('the document model is the one the round trip proved', () => {
  it('is a client component that reads the shared schema', () => {
    expect(blockSource).toMatch(/^'use client';/);
    expect(blockSource).toContain("from '@/lib/content/block-schema'");
    // Built once, at module scope: an editor rebuilt on a render nobody asked for is a caret sent
    // back to the start of the document, and the model holds no words that could go stale.
    expect(blockSource).toMatch(/const EXTENSIONS = \[/);
    expect(blockSource).toMatch(/extensions: EXTENSIONS,\s*\n\s*content: \(\) => cleanPaste\(openBody\(value\)\)/);
  });

  it('gives up the schema shapes a person can insert', () => {
    expect(blockSource).toMatch(/type: 'faqItem'/);
    expect(blockSource).toMatch(/type: 'ctaBlock'/);
    expect(blockSource).toMatch(/insertTable\(\{ rows: 3, cols: 3, withHeaderRow: false \}\)/);
    expect(blockSource).toMatch(/setHorizontalRule\(\)/);
    // The table and the FAQ pair are in the schema the tests run on, not in a list here.
    expect(schemaSource).toMatch(/name: 'faqItem'/);
    expect(schemaSource).toMatch(/name: 'ctaBlock'/);
  });

  it('reads and writes the body through the two string passes', () => {
    expect(blockSource).toMatch(/content: \(\) => cleanPaste\(openBody\(value\)\)/);
    expect(blockSource).toMatch(/closeBody\(ed\.getHTML\(\)\)/);
    expect(blockSource).toMatch(/if \(!editor \|\| value === pending\.current\) return;/);
    expect(blockSource).toMatch(/setContent\(html, \{ emitUpdate: false \}\)/);
    // `emitUpdate: false` is the whole caret story: an external value that is this document in a
    // different spelling must not re-parse the page under the person's cursor.
    expect(blockSource).toMatch(/immediatelyRender: false/);
  });

  it('stops driving the browser\'s own editing commands', () => {
    // The surface this replaced ran `document.execCommand`, which is why it could not make a FAQ
    // pair or name a picture. Nothing here may go back to it.
    const surface = code(blockSource);
    expect(surface).not.toMatch(/execCommand/);
    expect(surface).not.toMatch(/contentEditable/);
    expect(surface).not.toMatch(/data-placeholder=/);
  });

  it('keeps the sanitizer on the server', () => {
    expect(blockSource).not.toMatch(/sanitizeHtml|dangerouslySetInnerHTML/);
    expect(blockSource).toMatch(/cleanPaste\(html\)/);
  });
});

describe('what the toolbar offers, in the language the console is in', () => {
  it('names every tool, in the toolbar and to a screen reader', () => {
    const markup = markupOf();
    expect(markup).toMatch(/role="toolbar"/);
    expect(markup).toContain('aria-label="Text tools"');
    for (const name of [
      'Undo', 'Redo', 'Paragraph', 'Heading', 'Subheading', 'Bold', 'Italic', 'Bulleted list',
      'Numbered list', 'Quote', 'Link', 'Remove link', 'Table', 'Insert photo',
      'Question and answer', 'Call to action', 'Divider',
    ]) {
      expect(markup, `${name} is a button`).toContain(`>${name}</button>`);
    }
    expect((markup.match(/<button/g) ?? []).length).toBe(17);
  });

  it('has no text box in it anywhere', () => {
    expect(markupOf()).not.toContain('<textarea');
    expect(markupOf()).not.toMatch(/<input[^>]*type="text"/);
  });

  it('makes the surface the control the row names, when it is mounted', () => {
    // The old editor painted `id` and `role` in React markup; a document model builds its element
    // after mount, so the row's identity is handed to TipTap and re-applied by it on every render
    // (`Editor.setOptions` → `view.setProps`) instead of being written onto the DOM here.
    expect(blockSource).toMatch(/id: inputId,/);
    expect(blockSource).toMatch(/role: 'textbox',/);
    expect(blockSource).toMatch(/'aria-multiline': 'true',/);
    expect(blockSource).toMatch(/'aria-label': title,/);
    expect(blockSource).not.toMatch(/dom\.setAttribute\(/);
  });

  it('shows the table controls only when the caret is in a table', () => {
    // `snap.table` is read from the editor's own state after mount, so a static render — no
    // document yet — must not promise row and column buttons nobody can use.
    expect(markupOf()).not.toContain('Delete row');
  });

  it('reads Arabic bodies right-to-left and keeps the panels shut', () => {
    expect(markupOf({ rtl: true })).toContain('dir="rtl"');
    expect(markupOf({ rtl: false })).toContain('dir="ltr"');
    expect(markupOf()).not.toMatch(/class="console-block-link"/);
    expect(markupOf()).not.toMatch(/class="console-block-image"/);
  });

  it('gives up the tools, the panels and the upload together when the person may not write', () => {
    const markup = markupOf({ disabled: true });
    expect(markup).toMatch(/data-disabled="true"/);
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
    expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThan(15);
  });

  it('renders nothing of the body itself — the document is built after mount, by the schema', () => {
    expect(markupOf()).not.toContain('<p>hello</p>');
    expect(markupOf()).not.toContain('console-block-surface');
  });
});

describe('a picture comes from the library and carries a name', () => {
  it('asks for the alt text in the same breath as the choice', () => {
    expect(blockSource).toMatch(/aria-label=\{labels\['rich\.image_alt'\]\}/);
    expect(blockSource).toMatch(/altDraft\.trim\(\) === ''[\s\S]{0,120}rich\.image_alt_missing/);
    expect(blockSource).toMatch(/updateAttributes\('image', \{ alt: next \}\)/);
    expect(blockSource).toMatch(/chain\.setImage\(\{ src, alt \}\)/);
  });

  it('takes the address from the server or the library, and types none', () => {
    expect(blockSource).toMatch(/place\(outcome\.value\.src, alt\)/);
    expect(blockSource).toContain("from '@/lib/console/upload'");
    expect(blockSource).toMatch(/consoleRead<MediaList>\('\/api\/console\/media\?limit=24'\)/);
    expect(blockSource).toMatch(/accept="image\/png,image\/jpeg,image\/webp,image\/avif"/);
    expect(blockSource).not.toMatch(/wa\.me/);
  });

  it('checks an address before it wraps words in it', () => {
    expect(blockSource).toMatch(/if \(target !== '' && \(!LINK_SCHEMES\.test\(target\) \|\| !isAllowedHref\(target\)\)/);
    expect(blockSource).toMatch(/aria-label=\{labels\['rich\.link'\]\}/);
  });
});

describe('the catalog, the sheet and the block faces', () => {
  /** Quoted keys, however the component reaches them: `labels['rich.bold']`, `words['rich.faq_answer']`
   *  and the bare `'rich.paste_cleaned'` handed to `setNotice()` are the same promise. */
  const used = [...code(blockSource).matchAll(/['"](rich\.[a-z_]+)['"]/g)].map((match) => match[1]!);

  it('has a sentence for every word the control says, in both languages', () => {
    expect(used.length).toBeGreaterThan(20);
    const arabic = catalogFor('ar');
    for (const key of new Set(used)) {
      expect(arabic[key as MessageKey], `${key} in Arabic`).toBeTruthy();
      expect(catalogFor('en')[key as MessageKey], `${key} in English`).toBeTruthy();
      expect(arabic[key as MessageKey]).not.toBe(catalogFor('en')[key as MessageKey]);
    }
  });

  it('names each call-to-action variant, which the chip row builds from the contract', () => {
    // `rich.cta_${option}` is a template, so the loop above cannot see it. The list is the same
    // `CTA_VARIANTS` the renderer and the sanitizer read, so a fourth variant would fail here.
    const arabic = catalogFor('ar');
    for (const variant of CTA_VARIANTS) {
      expect(arabic[`rich.cta_${variant}` as MessageKey], `${variant} in Arabic`).toBeTruthy();
      expect(catalogFor('en')[`rich.cta_${variant}` as MessageKey], `${variant} in English`).toBeTruthy();
    }
    expect(blockSource).toMatch(/word\(`rich\.cta_\$\{option\}` as MessageKey\)/);
    // The number and the words are the settings' own, printed by the page — never stored here.
    expect(schemaSource).toMatch(/rendered: false/);
  });

  it('tells the person what a paste cost them, and does not do it silently', () => {
    expect(used).toContain('rich.paste_cleaned');
    expect(blockSource).toMatch(/setNotice\(cleaned === html \? null : 'rich\.paste_cleaned'\)/);
  });

  it('says which empty slot a person is looking at, in the console’s language', () => {
    // The sentences reach the sheet as custom properties, from the catalog, on every render —
    // which is why a language switch changes the hints without rebuilding anybody's document.
    expect(blockSource).toMatch(/'--c-rich-placeholder': asCssString\(labels\['rich\.placeholder'\]\)/);
    expect(blockSource).toMatch(/'--c-rich-faq-question': asCssString\(labels\['rich\.faq_question'\]\)/);
    expect(blockSource).toMatch(/'--c-rich-faq-answer': asCssString\(labels\['rich\.faq_answer'\]\)/);
    expect(markupOf()).toMatch(/--c-rich-placeholder:&quot;Write here\./);
    const arabic = renderToStaticMarkup(
      createElement(BlockEditor, {
        labels: catalogFor('ar'),
        value: '',
        disabled: false,
        inputId: 'field-content-ar',
        title: 'المحتوى',
        rtl: true,
        onChange: () => {},
      }),
    );
    expect(arabic).toMatch(/--c-rich-faq-question:&quot;اكتبي السؤال/);
    expect(arabic).not.toMatch(/Write here/);
  });

  it('styles every class it puts on a node', () => {
    const classes = [...new Set([...code(blockSource).matchAll(/['"](console-block[a-z-]*)['"]/g)].map((match) => match[1]!))];
    expect(classes.length).toBeGreaterThan(6);
    for (const name of classes) expect(rule(kit, `.${name}`), `.${name} is styled`).toBeTruthy();
    expect(classes).toContain('console-block-surface');
    expect(classes).toContain('console-block-cta');
  });

  it('keeps the sheet in the console\'s own units', () => {
    expect(rule(kit, '.console-block-surface')).toMatch(/min-block-size: 12rem;/);
    expect(kit).not.toMatch(/min-height: [0-9.]+(rem|px)/);
    // Direction comes from `inset-inline-start`, not from a second rule for `dir="rtl"`.
    expect(rule(kit, '.console-block-surface .is-empty::before')).toMatch(/inset-inline-start: 0;/);
    // The blank line in the middle of a page stays blank: only the three slots that need a name
    // have a sentence, and a paragraph that is empty on purpose has none.
    // The blank line in the middle of a page stays blank: the base paint is nothing, and only the
    // three slots that need a name have one.
    expect(rule(kit, '.console-block-surface .is-empty::before')).toMatch(/content: "";/);
    expect(rule(kit, '.console-block-surface .is-editor-empty::before')).toMatch(/content: var\(--c-rich-placeholder\);/);
    expect(rule(kit, '.console-block-surface section[data-block="faq"] > .is-empty::before')).toMatch(/content: var\(--c-rich-faq-question\);/);
    expect(rule(kit, '.console-block-surface \[data-faq-answer\] .is-empty::before')).toMatch(/content: var\(--c-rich-faq-answer\);/);
    expect(kit).not.toMatch(/outline:/);
    expect(kit).not.toMatch(/border-radius: [0-9.]+(rem|px|%)/);
  });
});
