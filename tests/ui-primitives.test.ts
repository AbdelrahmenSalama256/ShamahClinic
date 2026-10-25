import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The control layer, proved the way every styling suite here proves anything: against
 * the bytes of the two files, with no DOM. What these cases are really guarding is the
 * failure the audit found in the old `.console-button` — a state that existed only on
 * one variant (a filled button with no hover, inverting to a light one under a cursor),
 * a number written instead of the token that owns it, and a rule in a surface stylesheet
 * quietly re-painting something the primitive had already decided.
 */

const uiCss = readFileSync(join(process.cwd(), 'src/components/ui/ui.css'), 'utf8');
const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
// BK-240 split the tokens out of the site stylesheet so the console can read the palette
// without importing the element rules that would flatten a thumbnail. The numbers live
// here now; `globals.css` and the console layout both import this file.
const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const buttonSource = readFileSync(join(process.cwd(), 'src/components/ui/Button.tsx'), 'utf8');
const consoleCss = readFileSync(join(process.cwd(), 'src/app/console/console.css'), 'utf8');

/** Declarations, not prose: the header comments quote the hexes they measured, and a
 *  test that read them as colour decisions would fail for the wrong reason. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

const ui = code(uiCss);
const consoleCode = code(consoleCss);

function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `${selector} is styled`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

/** Selector and body of every declaration block. The pattern cannot cross a brace, so an
 *  `@media` wrapper drops out and its inner rules are read on their own — a `.ui-` override
 *  behind a breakpoint is still a surface re-painting a primitive. */
function blocksOf(source: string): ReadonlyArray<{ selector: string; body: string }> {
  const out: { selector: string; body: string }[] = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    out.push({ selector: match[1]!.replace(/\s+/g, ' ').trim(), body: match[2]! });
  }
  return out;
}

/** What a surface stylesheet is allowed to say about a control-layer class: where it goes,
 *  not what it looks like. `padding`, `border`, `background`, `color`, `font*`,
 *  `min-*-size` and `--radius-*` are deliberately absent — those are the numbers a 44px tap
 *  floor, a measured contrast pair and one capsule radius live in, and a call site that
 *  re-paints them is how one screen's floor quietly becomes another's 36px. */
const PLACEMENT_PROPERTIES = new Set([
  'display',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-basis',
  'flex-grow',
  'flex-shrink',
  'gap',
  'row-gap',
  'column-gap',
  'grid',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'place-items',
  'align-items',
  'align-self',
  'justify-content',
  'margin',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'order',
  'position',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'inset-inline',
  'inset-inline-start',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'overflow',
  'overflow-x',
  'overflow-y',
  'scrollbar-width',
  'box-sizing',
]);

describe('one button, painted once, for both surfaces (BK-19.3a)', () => {
  it('reaches every document without anyone remembering to import it', () => {
    // Asserting the import *string* is not asserting the import works: the first version
    // of this line pointed at `./components/…` from `src/app`, which reads correctly to a
    // human and fails the build. So the path is resolved from the file that declares it.
    const match = /@import\s+["']([^"']*ui\/ui\.css)["']\s*;/.exec(globals);
    expect(match, 'globals.css imports the control layer').not.toBeNull();
    const resolved = join(process.cwd(), 'src/app', match![1]!);
    expect(existsSync(resolved), `${match![1]} resolves from src/app`).toBe(true);
    expect(readFileSync(resolved, 'utf8')).toContain('.ui-button');
    // The console is its own root, so it names the control layer itself — and the token
    // file with it. It never reads `globals.css`: that file's `img { width: 100% !important }`
    // is the public page's, and it would size every thumbnail in a list.
    const layout = readFileSync(join(process.cwd(), 'src/app/console/layout.tsx'), 'utf8');
    expect(layout).toContain("import '../../components/ui/ui.css';");
    expect(layout).toContain("import '../../styles/tokens.css';");
    expect(layout).not.toMatch(/import\s+['"][^'"]*globals\.css/);
    expect(ui).not.toMatch(/@import/);
    // Both roots read one token file, so a palette never has two spellings.
    expect(globals).toContain('@import "../styles/tokens.css";');
  });

  it('names every state a control can be in', () => {
    for (const selector of [
      '.ui-button',
      '.ui-button:hover:not(:disabled)',
      '.ui-button:active:not(:disabled)',
      ".ui-button[data-variant='primary']",
      ".ui-button[data-variant='ghost']",
      ".ui-button[data-variant='danger']",
      ".ui-button[data-variant='primary']:hover:not(:disabled)",
      ".ui-button[data-variant='ghost']:hover:not(:disabled)",
      ".ui-button[data-variant='danger']:hover:not(:disabled)",
      '.ui-button[data-active]',
      ".ui-button[data-size='sm']",
      ".ui-button[data-size='icon']",
      '.ui-button[data-block]',
      '.ui-button:disabled',
      '.ui-button[data-loading]',
    ]) {
      expect(ui, `${selector} is styled`).toContain(`\n${selector} {`);
    }
    // The ring is not the primitive's to decide: `globals.css` has the one
    // `:focus-visible` rule and the token that turns with the theme and with gold fills.
    expect(globals).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--focus-ring\)/);
    expect(ui).not.toMatch(/outline:/);
  });

  it('gives the gold fill its own hover instead of inheriting the default one', () => {
    // This is the defect the old sheet carried: `.console-button-primary` set a dark
    // background and no hover, so `.console-button:hover` won on the cascade and a
    // filled button went pale under the cursor. A gradient cannot be hovered by changing
    // one colour, so the fill holds and the hover adds presence instead.
    const primary = rule(ui, ".ui-button[data-variant='primary']");
    expect(primary).toMatch(/background: var\(--gold-gradient\);/);
    expect(primary).toMatch(/border-color: var\(--border-control\);/);
    expect(primary).toMatch(/color: var\(--btn-gold-fg\);/);
    const hovered = rule(ui, ".ui-button[data-variant='primary']:hover:not(:disabled)");
    expect(hovered).toMatch(/background: var\(--gold-gradient\);/);
    expect(hovered).toMatch(/var\(--glow-gold\)/);
  });

  it('keeps the tap floor through every size', () => {
    expect(rule(ui, '.ui-button')).toMatch(/min-height: var\(--tap\);/);
    // `sm` is a smaller *label*, not a smaller target: a dense row still gets 44px.
    for (const selector of [".ui-button[data-size='sm']", ".ui-button[data-size='icon']"]) {
      expect(rule(ui, selector)).not.toMatch(/min-(?:height|block-size)/);
    }
    expect(rule(ui, ".ui-button[data-size='icon']")).toMatch(/min-inline-size: var\(--tap\);/);
  });

  it('paints a control that is in flight, and stops it being pressed twice', () => {
    // `data-loading` has to come after `:disabled` in the file: the button is disabled
    // while it works, and the cursor has to say *why* it is disabled.
    expect(ui.indexOf('.ui-button:disabled {')).toBeLessThan(ui.indexOf('.ui-button[data-loading] {'));
    expect(rule(ui, '.ui-button[data-loading]')).toMatch(/cursor: progress;/);
    expect(buttonSource).toMatch(/disabled=\{disabled \|\| loading\}/);
    expect(buttonSource).toMatch(/aria-busy=\{loading \|\| undefined\}/);
  });

  it('spins with a logical border and a named duration', () => {
    const spin = rule(ui, '.ui-button-spin');
    expect(spin).toMatch(/border-block-start-color: transparent;/);
    expect(spin).toMatch(/animation: ui-spin var\(--dur-spin\) linear infinite;/);
    expect(spin).not.toMatch(/border-top-color/);
    const keyframes = ui.slice(ui.indexOf('@keyframes ui-spin'));
    expect(keyframes.slice(0, keyframes.indexOf('}') + 1)).toMatch(/rotate\(360deg\)/);
  });

  it('moves nothing a reduced-motion visitor did not ask for', () => {
    const block = ui.slice(ui.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\.ui-button:hover:not\(:disabled\),\s*\.ui-button:active:not\(:disabled\) \{\s*transform: none;/);
  });

  it('transitions the properties it changes and never the box', () => {
    const transition = rule(ui, '.ui-button').match(/transition:([^;]*);/)?.[1] ?? '';
    expect(transition).not.toMatch(/\ball\b/);
    expect(transition).not.toMatch(/width|height|padding|margin|inset/);
    for (const property of ['background-color', 'color', 'border-color', 'box-shadow', 'transform']) {
      expect(transition, `${property} is named`).toContain(property);
    }
  });

  it('speaks logical properties, so Arabic needs no override', () => {
    expect(ui).not.toMatch(/border-(top|bottom|left|right):/);
    expect(ui).not.toMatch(/padding-(left|right):/);
    expect(ui).not.toMatch(/^\s*(left|right):/m);
  });

  it('reaches for a token instead of a number', () => {
    expect(ui).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ui).not.toMatch(/border-radius: [0-9.]+(rem|px|%)/);
    expect(ui).not.toMatch(/min-height: [0-9.]+(rem|px)/);
    expect(ui).not.toMatch(/transition:[^;]*\b\d+m?s\b/);
    expect(ui).not.toMatch(/animation:[^;]*\b\d+m?s\b/);
    expect(rule(ui, '.ui-button')).toMatch(/border-radius: var\(--radius-control\);/);
    expect(rule(ui, '.ui-button-spin')).toMatch(/border-radius: var\(--radius-pill\);/);
  });

  it('reads only variables that the token layer actually defines', () => {
    // `--tone-*` are the one set this file declares for itself: the `[data-tone]` rules fill
    // three names and each member reads them with its own neutral default, which is what
    // lets a badge and an alert disagree about "no tone" without a heavier selector. They
    // belong to no theme, so `globals.css` has no business naming them — but they still have
    // to be written down somewhere, so the same proof runs against this file.
    const names = [...new Set([...ui.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))];
    expect(names.length).toBeGreaterThan(12);
    for (const name of names) {
      const home = name.startsWith('--tone-') ? ui : tokens;
      expect(home, `${name} is defined`).toMatch(new RegExp(`\\n\\s*${name}:`));
    }
  });

  it('leaves the console no second definition of a button', () => {
    expect(consoleCode).not.toMatch(/\.console-button/);
    expect(consoleCode).not.toMatch(/--console-tap/);
    for (const name of ['ConsoleControls', 'ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ContentListScreen', 'ContentDetail', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
      const source = readFileSync(join(process.cwd(), 'src/components/console', `${name}.tsx`), 'utf8');
      expect(source, `${name} still uses the old class`).not.toContain('console-button');
    }
  });

  it('renders state as attributes a call site cannot invent', () => {
    expect(buttonSource).toMatch(/data-variant=\{variant\}/);
    expect(buttonSource).toMatch(/data-active=\{active \|\| undefined\}/);
    expect(buttonSource).toMatch(/data-loading=\{loading \|\| undefined\}/);
    // One class, from `clsx`, already in the project — not a string a caller concatenates.
    expect(buttonSource).toMatch(/className=\{clsx\('ui-button', className\)\}/);
    expect(buttonSource).not.toMatch(/className=\{`/);
  });

  it('uses the icon family the rest of the product uses', () => {
    const list = readFileSync(join(process.cwd(), 'src/components/console/ConsoleList.tsx'), 'utf8');
    expect(list).toMatch(/from 'lucide-react'/);
    // The sort and the remove control used to be text glyphs, which Tajawal draws at an
    // unknown size in an unknown place on the baseline.
    expect(list).not.toMatch(/['`’][↑↓×]/);
    // A chevron points where the row continues, so the pager swaps the pair by direction
    // instead of mirroring the whole button.
    expect(list).toMatch(/locale === 'ar' \? ChevronRight : ChevronLeft/);
    expect(list).toMatch(/locale === 'ar' \? ChevronLeft : ChevronRight/);
  });

  it('keeps the link version of the control a link', () => {
    expect(buttonSource).toMatch(/export function ButtonLink\(/);
    expect(buttonSource).toMatch(/<a\s/);
    // A destination does not wait for a response, so it cannot claim to be loading.
    expect(buttonSource.slice(buttonSource.indexOf('export function ButtonLink'))).not.toMatch(/aria-busy/);
  });
});

/*
 * The field family: the box, its caption, the message under it, and the checkbox that is
 * its own label. Two defects the old console sheet carried are proved gone here rather
 * than in the console suite, because the primitive is what they were wrong about: a box
 * whose fill was decided by whichever selector happened to be heavier, and a checkbox
 * whose 16-pixel graphic was the only thing a finger could hit.
 */
describe('one field, painted once, for both surfaces (BK-19.3b)', () => {
  const fieldSource = readFileSync(join(process.cwd(), 'src/components/ui/Field.tsx'), 'utf8');

  it('names every state a field can be in', () => {
    for (const selector of [
      '.ui-field',
      '.ui-fields',
      '.ui-field > label',
      '.ui-control',
      '.ui-control:where(:hover:not(:disabled), :focus)',
      '.ui-control[data-bar]',
      'textarea.ui-control',
      'select.ui-control',
      '.ui-control:disabled',
      '.ui-control[readonly]',
      ".ui-control[aria-invalid='true']",
      '.ui-field-error',
      '.ui-label-note',
      '.ui-check',
      '.ui-check input',
      '.ui-check[data-disabled]',
    ]) {
      expect(ui, `${selector} is styled`).toContain(`\n${selector} `);
    }
    expect(ui).toContain("\nhtml[data-theme='dark'] .ui-control {");
    // The native clear button on a search field duplicates a filter box that already
    // answers every keystroke, and it cannot be moved or restyled.
    expect(ui).toMatch(/\.ui-control\[type='search']::-\w+-search-cancel-button\s*\{\s*-webkit-appearance: none;/);
  });

  it('holds the tap floor, and lets density lower only the field', () => {
    expect(rule(ui, '.ui-control')).toMatch(/min-height: var\(--tap-field\);/);
    // A bar control shares its row with buttons, so it takes the floor density never
    // touches — the two are different numbers under `[data-density='dense']`.
    expect(rule(ui, '.ui-control[data-bar]')).toMatch(/min-height: var\(--tap\);/);
    expect(tokens).toMatch(/--tap-field: 2\.75rem;/);
    // The console owns its own field floor (slice 0); density may lower it, never a tap.
    expect(consoleCode).toMatch(/\n\s*--c-tap: 2\.75rem;/);
    expect(consoleCode).toMatch(/\[data-density="dense"\] \{\s*--c-tap-field: /);
    const dense = consoleCode.slice(consoleCode.indexOf('[data-density="dense"]'));
    expect(dense.slice(0, dense.indexOf('}'))).not.toContain('--c-tap:');
  });

  it('gives the checkbox its floor on the label, which is the thing you hit', () => {
    // `display` is load-bearing: a `min-block-size` on an inline label is ignored, so the
    // number below would read as 44 in the file and measure 16 on the screen.
    expect(rule(ui, '.ui-check')).toMatch(/display: inline-flex;/);
    expect(rule(ui, '.ui-check')).toMatch(/min-inline-size: var\(--tap\);/);
    expect(rule(ui, '.ui-check')).toMatch(/min-block-size: var\(--tap\);/);
    expect(rule(ui, '.ui-check input')).toMatch(/accent-color: var\(--focus-ring\);/);
    expect(rule(ui, '.ui-check input')).toMatch(/inline-size: var\(--sp-5\);/);
  });

  it('names the dark fill instead of inheriting one that outranks it', () => {
    // `globals.css` paints every bare `input`, `select` and `textarea` in dark with
    // `--bg-card`, and an element rule behind `html[data-theme]` outranks a single class.
    // The primitive states the theme it corrects rather than leaving a raised well to
    // that accident — and leaves `color-scheme` to the rule above, because the operating
    // system's own popup and calendar glyph are not this file's to colour.
    expect(globals).toMatch(/html\[data-theme=["']dark["']\] input,/);
    expect(globals).toMatch(/html\[data-theme=["']dark["']\] input,[\s\S]{0,120}color-scheme: dark;/);
    const dark = rule(ui, "html[data-theme='dark'] .ui-control");
    expect(dark).toMatch(/background: var\(--bg-card-subtle\);/);
    expect(dark).not.toMatch(/color-scheme/);
    expect(ui.indexOf('\n.ui-control {')).toBeLessThan(ui.indexOf("\nhtml[data-theme='dark'] .ui-control {"));
  });

  it('keeps the red border red under a cursor, a ring and a disabled box', () => {
    expect(rule(ui, ".ui-control[aria-invalid='true']")).toMatch(/border-color: var\(--text-danger\);/);
    // Not a matter of file order: `:hover:not(:disabled)` written bare weighs (0,3,0) and
    // the invalid selector (0,2,0), so the cursor would repaint a red field gold and the
    // rule sitting lower in the sheet would not stop it. The attention step is wrapped in
    // `:where()` so it weighs exactly one class, and the invalid state outranks it.
    expect(rule(ui, '.ui-control:where(:hover:not(:disabled), :focus)')).toMatch(/:where\(/);
    expect(ui).not.toMatch(/\.ui-control:hover(?![,)])/);
    const invalid = ui.indexOf("\n.ui-control[aria-invalid='true']");
    for (const earlier of ['.ui-control:where(:hover:not(:disabled), :focus)', '.ui-control:disabled', '.ui-control[readonly]']) {
      expect(ui.indexOf(`\n${earlier} {`), `${earlier} comes first`).toBeLessThan(invalid);
    }
    // One answer per element: the control carries the ARIA attribute it had to carry
    // anyway, and only the wrapper takes a `data-*` hook for the caption.
    expect(ui).not.toMatch(/\.ui-control\[data-invalid/);
    expect(rule(ui, '.ui-field[data-invalid] > label')).toMatch(/color: var\(--text-danger\);/);
  });

  it('dims a read-only field without telling you not to touch it', () => {
    // The settings pane shows a value a role cannot write, and the value is still there
    // to be read, selected and copied — so the arrow cursor stays.
    expect(rule(ui, '.ui-control[readonly]')).toMatch(/opacity: 0\.7;/);
    expect(rule(ui, '.ui-control[readonly]')).not.toMatch(/cursor/);
    expect(rule(ui, '.ui-control:disabled')).toMatch(/cursor: not-allowed;/);
  });

  it('cannot be given an orphan label', () => {
    // A `<label>` beside its control associates by nothing else, so the primitive makes
    // the id a required prop instead of hoping each call site writes `htmlFor`.
    expect(fieldSource).toMatch(/htmlFor: string;/);
    expect(fieldSource).toMatch(/<label htmlFor=\{htmlFor\}>\{label\}<\/label>/);
    const body = fieldSource.slice(fieldSource.indexOf('export function Field'));
    let at = -1;
    for (const token of ['<label htmlFor={htmlFor}>', '{children}', 'className="ui-field-error"', '{note}']) {
      const next = body.indexOf(token);
      expect(next, `${token} is rendered`).toBeGreaterThan(at);
      at = next;
    }
  });

  it('announces every message, in the order the server gave them', () => {
    expect(fieldSource).toMatch(/className="ui-field-error" role="alert"/);
    expect(fieldSource).toMatch(/errors\.map\(\(message\) =>/);
    expect(fieldSource).toMatch(/data-invalid=\{errors\.length > 0 \|\| undefined\}/);
  });

  it('keeps the box a box', () => {
    // `type` is not a prop a call site may pass, so a `Checkbox` cannot become a text
    // field; the label wraps the input, which is what makes the row the target.
    expect(fieldSource).toMatch(/Omit<ComponentProps<'input'>, 'type'>/);
    expect(fieldSource).toMatch(/<input type="checkbox"/);
    expect(fieldSource.slice(fieldSource.indexOf('export function Checkbox'), fieldSource.indexOf('export type FieldProps'))).toMatch(
      /<label className=\{clsx\('ui-check'/,
    );
  });

  it('takes state from props through the same attribute shape as the button', () => {
    for (const control of ['input', 'textarea', 'select']) {
      expect(fieldSource, `${control} carries the class from clsx`).toMatch(new RegExp(`<${control} className=\\{clsx\\('ui-control', className\\)\\}`));
    }
    expect(fieldSource).toMatch(/data-bar=\{bar \|\| undefined\}/);
    // `bar`, not `size`: `size` is a real attribute on `input` and `select` with a number
    // of its own meaning, and a prop that silently collides with it is a bug waiting for
    // a call site that wants both.
    expect(fieldSource).not.toMatch(/\bsize\b/);
    expect(fieldSource).not.toMatch(/className=\{`/);
  });

  it('leaves no second definition of a field anywhere else', () => {
    expect(consoleCode).not.toMatch(/\.console-field/);
    // The console sheet may not reach past the primitive for an element it now owns —
    // with one exception, and it is a narrow one. A `Note` is a span so that the pager's
    // "of 4" can live inside a row, which means a caption standing alone on a page only
    // becomes a line of its own if the surface says so. Space is the surface's business and
    // paint is the primitive's (19.3c), so a `.ui-*` selector in `console.css` may only say
    // where the control goes: enough to place a caption or group a card row, never enough
    // to re-decide what a caption looks like on one screen and not the others. The set is
    // the one 19.3d writes down, so a surface hook cleared here cannot be refused there.
    for (const block of blocksOf(consoleCode)) {
      expect(block.selector, `console.css styles a bare element: ${block.selector}`).not.toMatch(
        /(^|[\s,>+~(])(input|textarea|select)(?![\w-])/,
      );
      if (!block.selector.includes('.ui-')) continue;
      for (const property of [...block.body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]!)) {
        expect(PLACEMENT_PROPERTIES, `${block.selector} may not set ${property}`).toContain(property);
      }
    }
    for (const name of ['ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ContentListScreen', 'ContentDetail', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
      const source = readFileSync(join(process.cwd(), 'src/components/console', `${name}.tsx`), 'utf8');
      // `console-search` and `console-cell-check` survive as the console's own layout —
      // how wide the filter box is, how wide a checkbox column is. The sheet that decided
      // what a field looked like is the one that must not come back.
      expect(source, `${name} still paints a field`).not.toMatch(/console-field/);
    }
  });
});

/*
 * The status family (BK-19.3c): the badge, the alert, the note, the empty, the skeleton and
 * the value mark. What these cases guard is the shape the console had before them — one
 * question, "how much does this matter", answered three times by three members with three
 * different vocabularies (`error` for the alert, `warn` painted from the danger pair for the
 * chip, and nothing at all for the count), plus a table cell whose entire content was a glyph
 * no voice reads and a list whose loading state was an `aria-label` on empty boxes.
 */
describe('one tone, six shapes, for both surfaces (BK-19.3c)', () => {
  const statusSource = readFileSync(join(process.cwd(), 'src/components/ui/Status.tsx'), 'utf8');
  const listSource = readFileSync(join(process.cwd(), 'src/components/console/ConsoleList.tsx'), 'utf8');
  const editorSource = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');
  const messages = readFileSync(join(process.cwd(), 'src/lib/console/messages.ts'), 'utf8');

  /** Every `tone=` written anywhere in the console, in a literal or inside an expression. */
  const namedTones = [
    readFileSync(join(process.cwd(), 'src/app/console/(workspace)/page.tsx'), 'utf8'),
    readFileSync(join(process.cwd(), 'src/app/console/password/page.tsx'), 'utf8'),
    listSource,
    editorSource,
    ...['ConsolePalette', 'ConsoleShell', 'ContentListScreen', 'ContentDetail', 'LoginForm', 'PasswordForm', 'SettingsWorkspace'].map((name) =>
      readFileSync(join(process.cwd(), 'src/components/console', `${name}.tsx`), 'utf8'),
    ),
  ].flatMap((source) =>
    [...source.matchAll(/tone=(?:"([^"]+)"|\{([^}]*)\})/g)].flatMap((match) =>
      match[1] ? [match[1]] : [...match[2].matchAll(/'([a-z]+)'/g)].map((word) => word[1]),
    ),
  );

  it('answers "how much does this matter" with three words and one silence', () => {
    const tones = [...new Set([...ui.matchAll(/\[data-tone='([a-z]+)'\]/g)].map((match) => match[1]))].sort();
    expect(tones).toEqual(['danger', 'ok', 'warn']);
    // `neutral` is the word the primitive keeps for "no tone" and the one value it never
    // writes: there is no rule to match it, and a hook nothing styles is a hook that drifts.
    expect(ui).not.toMatch(/data-tone='neutral'/);
    expect(statusSource).toMatch(/return tone === 'neutral' \? undefined : tone;/);
    for (const tone of namedTones) {
      expect(['neutral', 'ok', 'warn', 'danger'], `${tone} is a tone the sheet paints`).toContain(tone);
    }
    expect(namedTones.length).toBeGreaterThan(8);
  });

  it('declares the tone once and lets each member ask for what it has', () => {
    for (const member of ['.ui-badge', '.ui-alert', '.ui-note']) {
      expect(rule(ui, member), `${member} reads the ink`).toMatch(/var\(--tone-fg/);
    }
    // A pill and a box disagree about "no tone" on purpose — a label is quiet, a sentence is
    // not — which is why the fallbacks sit with the members and not in the `[data-tone]` rules.
    expect(rule(ui, '.ui-badge')).toMatch(/color: var\(--tone-fg, var\(--text-secondary\)\);/);
    expect(rule(ui, '.ui-alert')).toMatch(/color: var\(--tone-fg, var\(--text-primary\)\);/);
    expect(rule(ui, '.ui-note')).not.toMatch(/background|border/);
    for (const selector of [".ui-badge[data-tone='ok']", ".ui-alert[data-tone='warn']", ".ui-note[data-tone='danger']"]) {
      expect(ui, `${selector} sets the triple`).toContain(`\n${selector}`);
    }
    // Every tone rule writes all three variables, so a member never invents a colour alone.
    for (const match of ui.matchAll(/\[data-tone='(ok|warn|danger)'\][^{]*\{([^}]*)\}/g)) {
      const body = match[2];
      for (const name of ['--tone-fg', '--tone-bg', '--tone-border']) {
        expect(body, `${match[1]} sets ${name}`).toContain(`${name}:`);
      }
    }
  });

  it('derives the role of an alert from the news, not from the call site', () => {
    expect(statusSource).toMatch(/role=\{role \?\? \(tone === 'danger' \? 'alert' : tone === 'neutral' \? undefined : 'status'\)\}/);
    // The hand-written ternary this replaced lived at eight call sites; one of them is enough
    // to prove the pattern did not survive.
    for (const source of [listSource, editorSource]) {
      expect(source, 'a banner does not spell out its own role').not.toMatch(/role=\{(notice|failed)\.tone ===/);
    }
    for (const name of ['ContentListScreen', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
      const source = readFileSync(join(process.cwd(), 'src/components/console', `${name}.tsx`), 'utf8');
      expect(source, `${name} uses the primitive`).toMatch(/<Alert/);
      expect(source, `${name} still writes an alert by hand`).not.toMatch(/console-alert/);
    }
    // An alert is a paragraph that holds buttons: the list's failure line has carried a
    // Retry inside its sentence since BK-13.3, and a `div` would have said nothing about
    // being a message.
    expect(listSource).toMatch(/<Alert tone="danger">\s*\{labels\[failed\]\}\s*<Button/);
  });

  it('gives a loading list a word as well as a shape', () => {
    // The wells are decoration until something names them: the old markup was
    // `<ul aria-label="Loading">` around empty boxes, which announced nothing at all.
    expect(statusSource).toMatch(/role=\{label \? 'status' : undefined\} aria-hidden=\{label \? undefined : true\}/);
    expect(statusSource).toMatch(/<Note className="sr-only">\{label\}<\/Note>/);
    expect(listSource).toMatch(/<Skeleton rows=\{Math\.min\(view\.per, 6\)\} label=\{labels\['content\.loading'\]\} \/>/);
    expect(editorSource).toMatch(/<Skeleton rows=\{3\} label=\{labels\['content\.loading'\]\} \/>/);
    expect(rule(ui, '.ui-skeletons')).toMatch(/display: grid;/);
    expect(rule(ui, '.ui-skeleton')).toMatch(/min-block-size: var\(--tap\);/);
  });

  it('breathes instead of sweeping, and 19.1 stops it', () => {
    // A background-position sweep is the one animation that cannot be a transform, so it
    // repaints every frame — and anchored with `inset-inline-start` it disagrees with its own
    // translate in RTL. An opacity change is identical in both readings.
    expect(rule(ui, '.ui-skeleton')).toMatch(/animation: ui-skeleton var\(--dur-shimmer\) var\(--ease-in-out\) infinite;/);
    expect(ui.slice(ui.indexOf('@keyframes ui-skeleton'))).toMatch(/^@keyframes ui-skeleton \{\s*50% \{\s*opacity: 0\.55;\s*\}\s*\}/);
    expect(ui).not.toMatch(/background-position/);
    // No override of its own in either sheet: `globals.css` zeroes every duration for `*`
    // under `prefers-reduced-motion`, so a second answer here is a second place to remember
    // — and `animation: none` on a well would freeze it mid-breath rather than at full ink.
    expect(ui).not.toMatch(/animation: none/);
    expect(consoleCode).not.toMatch(/animation: none|console-shimmer|background-position/);
  });

  it('puts a word beside the glyph, where only the voice can reach it', () => {
    expect(statusSource).toMatch(/const GLYPH: Record<MarkState, string> = \{ yes: '●', no: '○', none: '—' \};/);
    expect(statusSource).toMatch(/<span aria-hidden="true">\{GLYPH\[state\]\}<\/span>/);
    expect(statusSource).toMatch(/<span className="sr-only">\{label\}<\/span>/);
    // Three states, two rules and a base: `no` keeps the default ink, because a tick that is
    // off is not an error, and only an absent value drops below it.
    expect(rule(ui, '.ui-mark')).toMatch(/color: var\(--text-secondary\);/);
    expect(rule(ui, ".ui-mark[data-state='yes']")).toMatch(/color: var\(--text-success\);/);
    expect(rule(ui, ".ui-mark[data-state='none']")).toMatch(/color: var\(--text-muted\);/);
    expect(ui).not.toMatch(/\.ui-mark\[data-state='no'\]/);
    expect(listSource).toMatch(/<Mark state="none" label=\{labels\['content\.value\.none'\]\} \/>/);
    for (const key of ['content.value.yes', 'content.value.no', 'content.value.none']) {
      expect((messages.match(new RegExp(`'${key}':`, 'g')) ?? []).length, `${key} in both catalogs`).toBe(2);
    }
  });

  it('leaves the console no second definition of a status', () => {
    for (const gone of ['.console-alert', '.console-note', '.console-meta', '.console-account-label', '.console-palette-empty',
      '.console-row-skeleton', '.console-chip[', '.console-count[', '.console-chip {']) {
      expect(consoleCode, `${gone} is not a rule any more`).not.toContain(gone);
    }
    // The two hooks that survive do it by placement, and only by placement: `Badge` carries no
    // margin of its own, and the count is the thing a row pushes around — `auto` in the bulk bar
    // where it leads, zeroed in the pager where the controls take the far edge instead. Measured
    // in the built app at 360: pager count `margin-inline-start: 0`, controls `auto`.
    expect(rule(consoleCode, '.console-count')).toMatch(/margin-inline-start: auto;/);
    expect(rule(consoleCode, '.console-pager .console-count')).toMatch(/margin-inline-start: 0;/);
    expect(rule(consoleCode, '.console-bulk .console-count')).toMatch(/margin-inline-end: auto;/);
    expect(rule(consoleCode, '.console-count')).not.toMatch(/color|font-size/);
    expect(rule(consoleCode, '.console-account-roles')).toMatch(/gap: var\(--ui-gap-tight\);/);
    // Nothing still writes the class the primitive replaced — `console.css` is only half of
    // a deletion, and the pages outside the shared components were the eager writers.
    const dead = ['console-alert', 'console-note', 'console-meta', 'console-account-label', 'console-palette-empty', 'console-row-skeleton'];
    for (const path of [
      ...['ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ConsoleShell', 'ContentListScreen', 'ContentDetail', 'LoginForm', 'PasswordForm', 'SettingsWorkspace'].map((name) => `src/components/console/${name}.tsx`),
      'src/app/console/(workspace)/page.tsx',
      'src/app/console/(workspace)/settings/page.tsx',
      'src/app/console/password/page.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      for (const name of [...dead, 'className="console-chip"']) {
        expect(source, `${path} still writes ${name}`).not.toContain(name);
      }
    }
  });

  it('keeps one colour table for the state of a row', () => {
    // The list and the editor used to read the same key and pick the same colour by hand, in
    // two files, in two shapes — the only way one pane stops matching the other.
    const form = readFileSync(join(process.cwd(), 'src/lib/console/editor-form.ts'), 'utf8');
    expect(form).toMatch(/export function contentStateTone\(key: MessageKey\): Tone/);
    expect(form).toMatch(/if \(key === 'content\.state\.trashed'\) return 'danger';/);
    expect(form).toMatch(/return key === 'content\.state\.published' \? 'ok' : 'neutral';/);
    for (const source of [listSource, editorSource]) {
      expect(source).toContain('contentStateTone');
    }
    expect(listSource).toMatch(/<Badge tone=\{contentStateTone\(state\)\}>\{labels\[state\]\}<\/Badge>/);
  });

  it('keeps a badge one word wide, because a pill sets the column it sits in', () => {
    // `overflow-wrap` inherits, and the list's cells declare `anywhere` so a long slug stays
    // inside the table. A badge that named nothing inherited that and the state column's
    // minimum became one character: 65px, "منشور" on three lines, a 99px row. Measured in the
    // built app, the badge's own value is the one the layout reads — badge `normal` beside a
    // cell still at `anywhere` gives a 61x26 pill in an 83px column and breaks a slug on
    // demand, while cell `normal` beside a badge at `anywhere` collapses the column again.
    expect(rule(ui, '.ui-badge')).toMatch(/overflow-wrap: normal;/);
    // Not `nowrap`, which measures the same in a one-word column and overflows the 16rem
    // sidebar on a two-word role name.
    expect(rule(ui, '.ui-badge')).not.toMatch(/white-space/);
    expect(rule(ui, '.ui-table th,\n.ui-table td')).toMatch(/overflow-wrap: anywhere;/);
    // A sentence is not a pill: it has no column to collapse, so it keeps the break for the
    // URL and the slug it sometimes has to hold.
    expect(rule(ui, '.ui-note')).toMatch(/overflow-wrap: anywhere;/);
    expect(rule(ui, '.ui-alert')).toMatch(/overflow-wrap: anywhere;/);
  });

  it('paints from the tokens and never from a number', () => {
    expect(rule(ui, '.ui-badge')).toMatch(/border-radius: var\(--radius-pill\);/);
    expect(rule(ui, '.ui-alert')).toMatch(/border-radius: var\(--radius-control\);/);
    expect(rule(ui, '.ui-empty')).toMatch(/border: 1px dashed var\(--hairline-strong\);/);
    expect(rule(ui, '.ui-empty')).toMatch(/padding: var\(--sp-8\) var\(--sp-4\);/);
    expect(rule(ui, '.ui-alert')).toMatch(/gap: var\(--sp-2\) var\(--sp-3\);/);
    // `--radius-pill` had no consumer until the badge took the radius the chip wrote by
    // hand. The three chip literals 19.3c left behind are gone with the chips themselves —
    // see the capsule case in 19.3d, which forbids the number in either sheet.
    expect(tokens).toMatch(/--radius-pill: 9999px;/);
  });
});

describe('the shells a screen is built out of, painted once (BK-19.3d)', () => {
  const surfaceSource = readFileSync(join(process.cwd(), 'src/components/ui/Surface.tsx'), 'utf8');
  const chipSource = readFileSync(join(process.cwd(), 'src/components/ui/Chip.tsx'), 'utf8');
  const tabsSource = readFileSync(join(process.cwd(), 'src/components/ui/Tabs.tsx'), 'utf8');
  const listScreenSource = readFileSync(join(process.cwd(), 'src/components/console/ContentListScreen.tsx'), 'utf8');
  const detailSource = readFileSync(join(process.cwd(), 'src/components/console/ContentDetail.tsx'), 'utf8');
  const listSource = readFileSync(join(process.cwd(), 'src/components/console/ConsoleList.tsx'), 'utf8');
  const navSource = readFileSync(join(process.cwd(), 'src/components/console/ConsoleNav.tsx'), 'utf8');
  const siteConfig = readFileSync(join(process.cwd(), 'src/config/site.ts'), 'utf8');

  /** Names the console sheet used for things the control layer now owns. A leading dot and
   *  a "no word character or hyphen after" test keep `.console-cards` and
   *  `.console-table-wrap` — both still real — out of the way of `console-card` and
   *  `console-table`. */
  const retired = [
    'console-lede',
    'console-card',
    'console-card-body',
    'console-row',
    'console-row-title',
    'console-row-key',
    'console-table',
    'console-sort',
    'console-chips',
    'console-chip-button',
    'console-chip-x',
    'console-view-chip',
    'console-views',
  ];

  it('leaves the console no second shell, table, chip or row', () => {
    for (const name of retired) {
      const gone = new RegExp(`\\.console-${name}(?![\\w-])`);
      expect(consoleCode, `.console-${name} is not a rule any more`).not.toMatch(gone);
      expect(`${listSource}\n${listScreenSource}\n${detailSource}\n${navSource}`, `nothing still writes console-${name}`).not.toMatch(
        new RegExp(`console-${name}(?![\\w-])`),
      );
    }
    // The panel and the tabs survive, and only as placement: what a panel is that a card is
    // not is a measure, and what a tab row is that a chip row is not is the space under it.
    expect(rule(consoleCode, '.console-panel')).toMatch(/max-width: var\(--console-panel-w\);/);
    expect(rule(consoleCode, '.console-panel')).not.toMatch(/background|border|box-shadow|padding|border-radius/);
    expect(rule(consoleCode, '.console-tabs')).toMatch(/margin-block-end: var\(--ui-stack\);/);
    expect(rule(consoleCode, '.console-tabs')).not.toMatch(/gap|display|background|color/);
    expect(rule(consoleCode, '.console-table-wrap')).toMatch(/max-block-size: var\(--console-list-h\);/);
    expect(rule(consoleCode, '.console-table-wrap')).not.toMatch(/background|border|border-radius/);
    // The three nav names styled by nothing were still in the markup, which is how a class
    // outlives the rule that needed it.
    for (const name of ['console-nav-tree', 'console-nav-flat', 'console-nav-branch']) {
      expect(navSource, `${name} is gone from the markup`).not.toContain(name);
      expect(consoleCode, `${name} is gone from the sheet`).not.toContain(name);
    }
  });

  it('lets a surface move a primitive and never re-paint it', () => {
    // The rule `ui.css`'s header states and `console.css` has leaned on since the tabs: an
    // override may say where a control goes. Everything that says what it looks like —
    // padding, a border, a fill, a colour, a font, a size floor — is the primitive's,
    // because those are the numbers the tap floor and the measured contrast pairs live in.
    const overrides = [...blocksOf(consoleCode), ...blocksOf(globals)].filter((block) => block.selector.includes('.ui-'));
    expect(overrides.length, 'the console still has placement hooks on the control layer').toBeGreaterThan(0);
    for (const block of overrides) {
      for (const property of [...block.body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]!)) {
        expect(PLACEMENT_PROPERTIES, `${block.selector} may not set ${property}`).toContain(property);
      }
    }
    // And the hooks that are left are the ones this row expected, no more: each is a
    // standalone `Note` that needs the line a span refuses, or a card row's arrangement.
    expect(overrides.map((block) => block.selector)).toEqual([
      '.console-palette-list > .ui-note',
      '.console-panel > .ui-note, .console-content > .ui-note',
      // BK-240: the create card's one sentence gives up the stack margin the note
      // carries everywhere else, and the card's state chip is pushed to the far edge.
      '.console-create .ui-lede, .console-create .ui-note',
      '.console-cards .ui-card',
      '.console-cards .console-card-link > .ui-badge',
      '.console-lead-note-list > .ui-note',
      // BK-16a: the account and role screens own the vertical rhythm under their lede,
      // and the fields inside their forms give up the stack margin the field carries
      // elsewhere. Placement only, same as the settings row below.
      '.console-users > .ui-lede, .console-roles > .ui-lede',
      '.console-user-form .ui-field, .console-role-form .ui-field, .console-role-grid .ui-field',
      // BK-15a: a page row already spaces its children, so the field inside it gives up
      // the stack margin it carries everywhere else. Placement only — the border, label
      // and control inside stay the primitive's.
      '.settings-page-controls .ui-field',
    ]);
  });

  it('raises one card, and lets the call site pick the tag it deserves', () => {
    expect(rule(ui, '.ui-card')).toMatch(/padding: var\(--ui-pad\);/);
    expect(rule(ui, '.ui-card')).toMatch(/border: 1px solid var\(--hairline\);/);
    expect(rule(ui, '.ui-card')).toMatch(/border-radius: var\(--radius-surface\);/);
    expect(rule(ui, '.ui-card')).toMatch(/box-shadow: var\(--elev-1\);/);
    expect(rule(ui, '.ui-card[data-flat]')).toMatch(/box-shadow: none;/);
    expect(rule(ui, '.ui-card[data-flush]')).toMatch(/padding: 0;/);
    expect(rule(ui, '.ui-card[data-active]')).toMatch(/background: var\(--bg-active\);/);
    // The shell is a component, not a class someone has to remember to write, and the tag
    // travels with it: a card-mode row is an `li`, a settings block is a `section`.
    expect(surfaceSource).toMatch(/type CardTag = 'div' \| 'li' \| 'section';/);
    expect(surfaceSource).toMatch(/className=\{clsx\('ui-card', className\)\}/);
    // The props are written against `HTMLElement` rather than the default tag: a handler
    // typed for a `div` is a type error on the `li` a call site is allowed to ask for, and
    // the union of the three tags' attributes is what a variable tag is checked against.
    expect(surfaceSource).toMatch(/type CardProps = HTMLAttributes<HTMLElement> &/);
    expect(listSource).toMatch(/<Card as="li" key=\{row\.id\}>/);
    expect(listSource).toMatch(/<Card flat flush className="console-table-wrap">/);
    // A call site that already owns an element puts the class on it instead of nesting a
    // second box — the login posts from a `form`, and a form inside a card is two objects.
    expect(readFileSync(join(process.cwd(), 'src/components/console/LoginForm.tsx'), 'utf8')).toContain('className="ui-card console-panel"');
    // One padding on all four sides: the tile's `calc(--ui-pad + 0.05rem)` was an eighth of a
    // rem no comment owned, and the card-mode row hard-pinned `0.7rem`, which is what
    // `--ui-pad` already says when density is dense. Comfortable got the dense card.
    expect(consoleCode).not.toMatch(/calc\(var\(--ui-pad\)/);
    expect(rule(consoleCode, '.console-cards .ui-card')).toMatch(/gap: var\(--sp-2\);/);
  });

  it('tints the row under the cursor and still puts the open row first', () => {
    // No row hover existed: nine columns to read across and nothing under the pointer.
    expect(rule(ui, '.ui-table tbody tr:hover')).toMatch(/background: var\(--bg-hover\);/);
    expect(ui).toMatch(/\.ui-table tbody tr:hover\s*\{[^}]*\}\s*\.ui-table tbody tr:last-child td\s*\{[^}]*\}\s*\.ui-table tbody tr\[data-active\]/);
    // Equal specificity, so the order in the file is the tie-break and "this row is open in
    // the editor" has to be the one that wins.
    expect(ui.indexOf('.ui-table tbody tr:hover')).toBeLessThan(ui.indexOf('.ui-table tbody tr[data-active]'));
    expect(rule(ui, '.ui-table tbody tr[data-active]')).toMatch(/background: var\(--bg-active\);/);
    // Translucent washes, not a fourth hex: `--bg-card-subtle` is two units below `--bg-card`,
    // which is not a state anyone can see, and `--bg-secondary` — what every pressed control
    // already wears — measured 3 units *above* the dark card against a hover 15 units above
    // it, which put the ladder backwards in the built app. An overlay composites, so the same
    // pair of numbers steps card → hover → active in both themes.
    expect(tokens).toMatch(/--bg-hover: rgba\(33, 26, 22, 0\.045\);/);
    expect(tokens).toMatch(/--bg-active: rgba\(33, 26, 22, 0\.09\);/);
    expect(siteConfig).toMatch(/"--bg-hover": "rgba\(33, 26, 22, 0\.045\)",/);
    expect(siteConfig).toMatch(/"--bg-active": "rgba\(33, 26, 22, 0\.09\)",/);
    expect(siteConfig).toMatch(/"--bg-hover": "rgba\(245, 238, 230, 0\.07\)",/);
    expect(siteConfig).toMatch(/"--bg-active": "rgba\(245, 238, 230, 0\.13\)",/);
    expect(siteConfig.match(/--bg-hover/g)).toHaveLength(2);
    expect(siteConfig.match(/--bg-active/g)).toHaveLength(2);
    // Light pair first, then dark, each hover below its own active.
    expect([...siteConfig.matchAll(/--bg-(hover|active)": "rgba\([^)]*, ([0-9.]+)\)"/g)].map((m) => Number(m[2]))).toEqual([0.045, 0.09, 0.07, 0.13]);
    // The head is sticky in its own scroll box and needs one layer, not the page's scale.
    expect(rule(ui, '.ui-table thead th')).toMatch(/z-index: 1;/);
    expect(rule(ui, '.ui-table')).toMatch(/border-collapse: separate;/);
    expect(rule(ui, '.ui-table-sort')).toMatch(/min-block-size: var\(--tap\);/);
    expect(listSource).toMatch(/className="ui-table console-table"/);
    expect(listSource).toMatch(/className="ui-table-sort"/);
  });

  it('gives a row one action, in the table and in the card', () => {
    // `.console-row` and `.console-card-body` were the same button written twice.
    expect(rule(ui, '.ui-row-action')).toMatch(/inline-size: 100%;/);
    expect(rule(ui, '.ui-row-action')).toMatch(/overflow-wrap: anywhere;/);
    expect(rule(ui, '.ui-row-action:hover .ui-row-title')).toMatch(/text-decoration: underline;/);
    expect(rule(ui, '.ui-row-title')).toMatch(/font-weight: 600;/);
    expect(surfaceSource).toMatch(/<button type=\{type\} className=\{clsx\('ui-row-action', className\)\}/);
    // A row is an anchor now that it has its own address (240). It keeps the primitive's
    // class so the row looks the same lifted from a card and from a table, and it still
    // carries one action and one title.
    expect(rule(ui, '.ui-row-link')).toMatch(/min-block-size: var\(--tap\);/);
    expect(rule(ui, '.ui-row-link')).toMatch(/text-decoration: none;/);
    expect(listSource).toMatch(/<Link className="ui-row-link console-row-link" href=\{detailHref\(row\)\}>/);
    expect(listSource).toMatch(/<Link className="ui-row-link console-card-link" href=\{detailHref\(row\)\}>/);
    // The key is a `code`: it is literal text a person may have to type into another screen.
    expect(surfaceSource).toMatch(/<code className=\{clsx\('ui-row-key', className\)\}/);
  });

  it('has no capsule written by hand in either sheet', () => {
    // The site's capsule family still reads its shared pill token.
    expect(ui).not.toMatch(/border-radius: 999px/);
    for (const selector of ['.ui-chip', '.ui-chip-tag', '.ui-chip-x']) {
      expect(rule(ui, selector)).toMatch(/border-radius: var\(--radius-pill\);/);
    }
    // The console owns its pill and its arch, both drawn from its own token block.
    expect(consoleCode).toMatch(/--c-r-pill: 999px;/);
    // 19.3c's lesson, carried to the rest of the family: a pill that inherits the table
    // cell's `anywhere` sets its own column's width by character.
    expect(rule(ui, '.ui-chip')).toMatch(/overflow-wrap: normal;/);
    expect(rule(ui, '.ui-chip')).toMatch(/min-block-size: var\(--tap\);/);
    expect(rule(ui, '.ui-chip')).toMatch(/padding: var\(--sp-1\) var\(--sp-4\);/);
    // The capsule is `content-box` because it draws the 1px the two halves sit inside: with
    // border-box each measured 43 and the floor is the *tappable* height.
    expect(rule(ui, '.ui-chip-tag')).toMatch(/box-sizing: content-box;/);
    expect(rule(ui, '.ui-chip-tag')).toMatch(/align-items: stretch;/);
    expect(rule(ui, '.ui-chip-x')).toMatch(/min-inline-size: var\(--tap\);/);
    expect(chipSource).toMatch(/clsx\('ui-chip', className\)/);
    expect(listSource).toMatch(/<ChipRow label=\{labels\['content\.filter\.all'\]\}>/);
    expect(listSource).toMatch(/<ChipTag key=\{row\.id\}>/);
    expect(listSource).toMatch(/<ChipRemove aria-label=\{`\$\{labels\['content\.view\.remove'\]\}: \$\{row\.name\}`\}/);
    // Three `9999px` literals are still in `globals.css`, on the public site's own pills —
    // the same value, so nothing draws wrong today. They are 19.7's to take.
    expect((globals.match(/border-radius: 9999px/g) ?? []).length).toBe(3);
  });

  it('wires the tablist it claims', () => {
    // The console had the roles and none of the behaviour: no `aria-controls`, no panel, no
    // roving `tabIndex`, no arrow keys. A screen reader said "tab 1 of 2" and then nothing.
    for (const hook of [
      'role="tablist"',
      'role="tab"',
      'role="tabpanel"',
      'aria-selected={selected}',
      'aria-controls={hasPanel ? panelId : undefined}',
      'aria-labelledby={tabId(value)}',
      'tabIndex={selected ? 0 : -1}',
    ]) {
      expect(tabsSource, `${hook} is on the tab group`).toContain(hook);
    }
    expect(rule(ui, '.ui-tabs')).toMatch(/gap: var\(--ui-gap-tight\);/);
    expect(listScreenSource).toMatch(/<Tabs/);
    expect(listScreenSource).toMatch(/idBase=\{`scope-\$\{kind\}`\}/);
    // The row's own page has the same pair, named for the row so two pages open in two
    // tabs cannot claim the same panel id.
    expect(detailSource).toMatch(/<Tabs/);
    expect(detailSource).toMatch(/idBase=\{`detail-\$\{kind\}-\$\{row\.id\}`\}/);
    // The arrows follow the reading direction — in Arabic the first tab is on the right, so
    // Right goes back — and `document.dir` is read at the keypress because the console's own
    // theme switch flips it without reloading.
    expect(tabsSource).toMatch(/\['ArrowRight', 'ArrowLeft', 'Home', 'End'\]/);
    expect(tabsSource).toMatch(/document\.documentElement\.dir === 'rtl'/);
    expect(tabsSource).toMatch(/event\.preventDefault\(\);\s*\n\s*focusTab\(next\);/);
    // Manual activation, on purpose: selecting a tab rewrites the URL and fetches another
    // page, so automatic activation would make a held Right-arrow a request and a history
    // entry per step.
    const handler = tabsSource.slice(tabsSource.indexOf('function onKeyDown'), tabsSource.indexOf('return ('));
    expect(handler).not.toContain('onChange');
    expect(handler).toContain('focusTab');
    expect(tabsSource).toMatch(/onClick=\{\(\) => onChange\(item\.id\)\}/);
    // No `tabIndex` on the panel: it is full of controls a visitor has to reach anyway.
    expect(tabsSource).not.toMatch(/role="tabpanel"[^>]*tabIndex/);
  });

  it('puts the console overlays on the one scale', () => {
    expect(rule(consoleCode, '.console-topbar')).toMatch(/z-index: var\(--c-z-sticky\);/);
    expect(consoleCode).toMatch(/z-index: var\(--c-z-scrim\);/);
    expect(consoleCode).toMatch(/z-index: var\(--c-z-drawer\);/);
    // The layers that are local to their own scroll box stay local literals, with the
    // reason said out loud: a lead sheet's own bar and a save bar have no argument with
    // the top bar.
    expect((consoleCode.match(/z-index: \d/g) ?? []).length).toBe(2);
    expect(rule(consoleCode, '.console-editor-bar')).toMatch(/z-index: 6;/);
    expect(consoleCode).toMatch(/--c-z-sticky: 30;[\s\S]*--c-z-scrim: 35;[\s\S]*--c-z-drawer: 40;/);
  });
});
