/**
 * #245 / BK-14a.2: one picture control, at every place a picture is set.
 *
 * The row's promise is a global one — "any image added by uploading, not path or link" — so
 * the tests are mostly about coverage and drift, which is what a promise like that dies of:
 *
 *   - **every screen that sets a picture renders the picker.** The content editor's image-named
 *     fields and its JSON galleries are asserted from their sources; the field rule itself is
 *     `isImageField()`, tested in `image-field.test.ts`. The settings banner card takes the same
 *     control in 14a.3, once that screen's own rewrite lands.
 *   - **one definition of "this is a picture".** The editor's own regexes are gone, so a field
 *     cannot read as a picture in the picker and not in the preview strip.
 *   - **the address never comes from the file.** The only value the picker writes is the one the
 *     server returned, and a file the browser cannot read fails with a sentence instead of a
 *     throw — this suite runs without a DOM, which is the proof of that.
 *   - **the catalog and the sheet carry what the control says and draws.** A `labels[...]` key
 *     that exists in one language, and a class with no rule, are both silent failures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { mediaMessageKey, uploadPicture } from '../src/lib/console/upload';
import { ImageGallery } from '../src/components/console/ImageGallery';
import { ImagePicker } from '../src/components/console/ImagePicker';
import type { MessageKey } from '../src/lib/console/messages';

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');

const pickerSource = read('src', 'components', 'console', 'ImagePicker.tsx');
const gallerySource = read('src', 'components', 'console', 'ImageGallery.tsx');
const editorSource = read('src', 'components', 'console', 'ConsoleEditor.tsx');
// Slice 0 moved the console's primitives out of the shared site sheet; the picker is
// painted by the console kit now.
const kit = read('src', 'app', 'console', 'console-kit.css');

/** The first declaration block for a selector, exactly as `ui-primitives.test.ts` reads one. */
function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `${selector} is styled`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

describe('a code becomes a sentence about your own file (BK-14a.2)', () => {
  const cases: [string, MessageKey][] = [
    ['too_large', 'media.error.too_large'],
    ['not_an_image_too_large_dimensions', 'media.error.dimensions'],
    ['not_an_image_unsupported_format', 'media.error.not_an_image'],
    ['not_an_image_signature', 'media.error.not_an_image'],
    ['read_failed', 'media.error.read'],
    ['no_address', 'media.error.read'],
    ['forbidden', 'media.error.forbidden'],
    ['unauthenticated', 'media.error.signed_out'],
    ['csrf_failed', 'media.error.expired'],
    ['write_failed', 'media.error.writable'],
    ['storage_unavailable', 'media.error.writable'],
    ['stale_row', 'media.error.failed'],
    ['http_500', 'media.error.failed'],
  ];

  for (const [code, key] of cases) {
    it(`answers ${code} with ${key}`, () => {
      expect(mediaMessageKey(code)).toBe(key);
    });
  }

  it('is the catalog that carries the words, not a string built at the call site', () => {
    for (const [, key] of cases) {
      expect(catalogFor('ar')[key], `${key} in Arabic`).not.toBe(undefined);
      expect(catalogFor('en')[key], `${key} in English`).not.toBe(undefined);
      expect(catalogFor('ar')[key]).not.toBe(catalogFor('en')[key]);
    }
  });
});

describe('the upload call cannot take a screen down (BK-14a.2)', () => {
  it('reads as a failure, not a throw, when the browser cannot decode the file', async () => {
    // Vitest runs this suite with no canvas and no `createImageBitmap`, which is the worst
    // case the control can meet. A throw would leave the row with no message at all.
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' });
    await expect(uploadPicture(file)).resolves.toEqual({ ok: false, code: 'read_failed' });
  });
});

describe('every word the picker says is in the catalog (BK-14a.2)', () => {
  const keys = [pickerSource, gallerySource, read('src', 'lib', 'console', 'upload.ts')].flatMap((source) => [
    ...source.matchAll(/labels\['(media\.[a-z_.]+)'\]/g),
    ...source.matchAll(/'(media\.[a-z_.]+)'/g),
  ]);

  it('names keys that both languages answer', () => {
    const names = [...new Set(keys.map((match) => match[1] as MessageKey))];
    expect(names.length).toBeGreaterThan(12);
    for (const key of names) {
      expect(catalogFor('ar')[key], `${key} in Arabic`).not.toBe(undefined);
      expect(catalogFor('en')[key], `${key} in English`).not.toBe(undefined);
    }
  });

  it('keeps the compressing promise in the person own words', () => {
    const hint = catalogFor('en')['media.compress_hint'];
    expect(hint).toMatch(/1600/);
    expect(hint).toMatch(/WebP/);
    expect(catalogFor('en')['media.upload']).toMatch(/Upload/i);
  });
});

describe('one control, everywhere a picture is set (BK-14a.2)', () => {
  it('puts the picker on an image-named field and the gallery inside a JSON one', () => {
    expect(editorSource).toMatch(/if \(isImageField\(name, field\)\)/);
    expect(editorSource).toMatch(/<ImagePicker labels=\{labels\} value=\{text\} disabled=\{disabled\} inputId=\{id\}/);
    expect(editorSource).toMatch(/if \(isImageGalleryField\(name, field\)\)/);
    expect(editorSource).toMatch(/<ImageGallery\s+labels=\{labels\}\s+value=\{text\}\s+disabled=\{disabled\}/);
    // The gallery is asked before any textarea is built, and a JSON column that is not a
    // gallery is answered with a sentence: neither reaches a person as text to edit.
    expect(editorSource).toMatch(/if \(isImageGalleryField\(name, field\)\)[\s\S]*?<ImageGallery[\s\S]*?if \(field\.kind === 'json'\) \{\s*return <Alert>/);
    // The frame is the field's labelled control, so the `<label>` still points at a real one.
    expect(editorSource).toMatch(/inputId=\{id\}/);
  });

  it('leaves the editor no second definition of what a picture is', () => {
    // The names it used to keep locally; the shared module owns all three now.
    for (const drifted of ['IMAGE_EXT', 'IMAGE_PATH', 'IMAGE_NAME', 'collectImages', 'function looksLikeImage', 'const looksLikeImage']) {
      expect(editorSource, `${drifted} is not the editor s own rule any more`).not.toContain(drifted);
    }
    expect(editorSource).toMatch(/import \{ imageSlots, isImageField, isImageGalleryField, looksLikeImage \} from '@\/lib\/console\/image-field'/);
    // Both the picker and the preview strip ask the same function.
    expect(editorSource).toMatch(/isImageField\(name, field\)/);
    expect((editorSource.match(/looksLikeImage\(text\)/g) ?? []).length).toBeGreaterThan(0);
  });

  it('takes the typed path out of the words the banner card says', () => {
    // The card itself is rewired in 14a.3, the moment the screen s own rewrite lands; the two
    // strings it reads are this row s, and they no longer offer a path to write.
    const messages = read('src', 'lib', 'console', 'messages.ts');
    expect(messages).toMatch(/'settings\.banners\.src': 'Page photo'/);
    expect(messages).toMatch(/'settings\.banners\.src_hint': 'Choose the photo from your device/);
    expect(messages).toMatch(/'settings\.banners\.intro': 'The photo each page opens with\. Upload one from your device/);
    // Nothing in either language still tells a person to write an address.
    expect(messages).not.toMatch(/['"]Image path['"]/);
    expect(messages).not.toMatch(/[Cc]hange the path/);
  });

  it('writes only the address the server handed back', () => {
    expect(pickerSource).toMatch(/onChange\(outcome\.value\.src\)/);
    expect(pickerSource).not.toMatch(/onChange\(\w+\.name\)/);
    // A typed path is the thing being removed, so the control owns no text box at all.
    expect(pickerSource).not.toMatch(/<Input/);
    expect(gallerySource).toMatch(/writeSlot\(root, target\.path/);
    expect(gallerySource).toMatch(/appendSlot\(root, target/);
    expect(gallerySource).toMatch(/removeSlot\(root, cell\.slot\)/);
  });

  it('renders no gallery for a document it cannot write back', () => {
    // Half-typed JSON has no document to write into; an empty document without a declared
    // list has nothing to append to. Both paint nothing rather than a button that guesses.
    expect(gallerySource).toMatch(/if \(root === undefined\) return null;/);
    expect(gallerySource).toMatch(/if \(slots\.length === 0 && !emptySlot\) return null;/);
  });
});

describe('the picker is painted once, by the console kit (BK-14a.2)', () => {
  const classes = [...new Set([...`${pickerSource}${gallerySource}`.matchAll(/className="((?:console-picker|console-gallery)[\w-]*)"/g)].map((match) => match[1] as string))];

  it('styles every part the two components draw', () => {
    expect(classes.length).toBeGreaterThan(6);
    for (const name of classes) {
      expect(kit, `.${name} has a rule`).toContain(`\n.${name} {`);
    }
  });

  it('keeps the file input a real control: invisible, not removed', () => {
    const hidden = rule(kit, '.console-picker-input');
    expect(hidden).toMatch(/position: absolute;/);
    expect(hidden).toMatch(/inset: 0;/);
    expect(hidden).not.toMatch(/display: none|visibility: hidden/);
    // The ring stays the single scoped one in `console.css`; this sheet declares no outline.
    expect(kit).not.toMatch(/outline:/);
  });

  it('gives the frame the shape of the slot it fills', () => {
    expect(rule(kit, '.console-picker-frame[data-ratio="wide"]')).toMatch(/aspect-ratio: 16 \/ 9;/);
    expect(rule(kit, '.console-picker-frame[data-ratio="square"]')).toMatch(/aspect-ratio: 1 \/ 1;/);
    expect(rule(kit, '.console-picker-frame[data-ratio="tall"]')).toMatch(/aspect-ratio: 3 \/ 4;/);
    expect(rule(kit, '.console-picker-frame[data-empty="true"]')).toMatch(/border-style: dashed;/);
  });
});

/**
 * Rendered, not read.
 *
 * Every assertion above is about source text, and source text cannot catch the two ways a
 * new control actually fails on a real screen: markup that the browser refuses to nest the
 * way it was written, and a component that throws before it paints. These two render the
 * components for real through React's own string renderer, which is the cheapest place in
 * this repo that both of those can be proved.
 */
describe('what React really paints (BK-14a.2)', () => {
  const labels = catalogFor('en');
  const html = (node: ReactNode): string => renderToStaticMarkup(node);

  it('hands the field a file input inside the frame, and no text box anywhere', () => {
    const markup = html(createElement(ImagePicker, { labels, value: '/uploads/202610/abc.webp', onChange: () => undefined, disabled: false, inputId: 'field-image' }));
    // The frame is the thing a person clicks, and the control it contains is the one the
    // row's `<label htmlFor>` names — a click on the picture has to be the click that opens
    // the dialog, which is the whole complaint this row answers.
    const input = markup.match(/<div class="console-picker-frame"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(input).toMatch(/<input[^>]*id="field-image"[^>]*type="file"/);
    expect(input).toMatch(/accept="image\/png,image\/jpeg,image\/webp,image\/avif"/);
    expect(markup).toContain('<img src="/uploads/202610/abc.webp"');
    expect(markup).not.toMatch(/<input[^>]*type="text"/);
    expect(markup).not.toMatch(/value="\/uploads\/202610\/abc\.webp"/);
    // A name from the disk is not a caption: the picture is chosen, and the words come after.
    expect(markup).toContain('Replace photo');
  });

  it('shows an empty frame that still opens the dialog', () => {
    const markup = html(createElement(ImagePicker, { labels, value: '', onChange: () => undefined, disabled: false, inputId: 'field-image' }));
    expect(markup).toMatch(/<div class="console-picker-frame" data-empty="true" data-ratio="wide">/);
    expect(markup).toMatch(/<input[^>]*type="file"/);
    expect(markup).toContain('No photo yet');
    expect(markup).toContain('Upload a photo');
    // Nothing to remove, so no button that would clear a field that was never filled.
    expect(markup).not.toContain('Remove photo');
  });

  it('gives every picture in a document its own input, and one add tile per list', () => {
    const document = JSON.stringify({ ar: [{ src: '/wp/a.webp', alt: 'A' }, { src: '/wp/b.webp', alt: 'B' }], en: [{ src: '/wp/c.webp', alt: 'C' }] });
    const markup = html(createElement(ImageGallery, { labels, value: document, onChange: () => undefined, disabled: false }));
    expect(markup.match(/type="file"/g)?.length).toBe(5);
    expect(markup.match(/<img src="\/wp\//g)?.length).toBe(3);
    expect(markup.match(/console-picker-frame/g)?.length).toBe(5);
    expect(markup.match(/<span class="console-picker-empty">Add another photo<\/span>/g)?.length).toBe(2);
    expect(markup.match(/aria-label="Add another photo"/g)?.length).toBe(2);
    expect(markup.match(/Remove this photo/g)?.length).toBe(3);
    // An element of a list is spliced; a key of an object is not this control's to delete.
    expect(markup).not.toContain('<li><li');
  });

  it('paints nothing for a document that holds no picture', () => {
    const props = { labels, onChange: () => undefined, disabled: false };
    expect(html(createElement(ImageGallery, { ...props, value: '{"ar":[],"en":[]}' }))).toBe('');
    expect(html(createElement(ImageGallery, { ...props, value: '{"title":"a clinic"}' }))).toBe('');
    expect(html(createElement(ImageGallery, { ...props, value: '' }))).toBe('');
    // Half-typed JSON is the textarea s complaint, not a control that renders a broken frame.
    expect(html(createElement(ImageGallery, { ...props, value: '{"ar": [' }))).toBe('');
  });
});
