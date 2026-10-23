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
    // The console gets it by reading `globals.css`, like every other root — so there is
    // no third surface that can be added with the control layer missing.
    const layout = readFileSync(join(process.cwd(), 'src/app/console/layout.tsx'), 'utf8');
    expect(layout).not.toContain('ui.css');
    expect(ui).not.toMatch(/@import/);
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
    const names = [...new Set([...ui.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))];
    expect(names.length).toBeGreaterThan(12);
    for (const name of names) {
      expect(globals, `${name} is defined in globals.css`).toMatch(new RegExp(`\\n\\s*${name}:`));
    }
  });

  it('leaves the console no second definition of a button', () => {
    expect(consoleCode).not.toMatch(/\.console-button/);
    expect(consoleCode).not.toMatch(/--console-tap/);
    for (const name of ['ConsoleControls', 'ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ContentWorkspace', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
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
    expect(globals).toMatch(/--tap-field: 2\.75rem;/);
    expect(consoleCode).toMatch(/\[data-density='dense'\] \{\s*--tap-field: /);
    expect(consoleCode).not.toMatch(/--tap:/);
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
    // The console sheet may not reach past the primitive for an element it now owns.
    for (const match of consoleCode.matchAll(/([^{}]+)\{/g)) {
      const selector = match[1].trim();
      expect(selector, `console.css styles a bare element: ${selector}`).not.toMatch(/(^|[\s,>+~(])(input|textarea|select)(?![\w-])/);
      expect(selector, `console.css overrides the primitive: ${selector}`).not.toContain('.ui-');
    }
    for (const name of ['ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ContentWorkspace', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
      const source = readFileSync(join(process.cwd(), 'src/components/console', `${name}.tsx`), 'utf8');
      // `console-search` and `console-cell-check` survive as the console's own layout —
      // how wide the filter box is, how wide a checkbox column is. The sheet that decided
      // what a field looked like is the one that must not come back.
      expect(source, `${name} still paints a field`).not.toMatch(/console-field/);
    }
  });
});
