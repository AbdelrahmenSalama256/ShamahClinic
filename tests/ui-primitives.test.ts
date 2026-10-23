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
    // `--tone-*` are the one set this file declares for itself: the `[data-tone]` rules fill
    // three names and each member reads them with its own neutral default, which is what
    // lets a badge and an alert disagree about "no tone" without a heavier selector. They
    // belong to no theme, so `globals.css` has no business naming them — but they still have
    // to be written down somewhere, so the same proof runs against this file.
    const names = [...new Set([...ui.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))];
    expect(names.length).toBeGreaterThan(12);
    for (const name of names) {
      const home = name.startsWith('--tone-') ? ui : globals;
      expect(home, `${name} is defined`).toMatch(new RegExp(`\\n\\s*${name}:`));
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
    // The console sheet may not reach past the primitive for an element it now owns —
    // with one exception, and it is a narrow one. A `Note` is a span so that the pager's
    // "of 4" can live inside a row, which means a caption standing alone on a page only
    // becomes a line of its own if the surface says so. Space is the surface's business and
    // paint is the primitive's (19.3c), so a `.ui-*` selector in `console.css` may declare
    // `display` and a margin and nothing else: enough to place a caption, never enough to
    // re-decide what a caption looks like on one screen and not the others.
    for (const match of consoleCode.matchAll(/([^{}]+)\{/g)) {
      const selector = match[1].trim();
      expect(selector, `console.css styles a bare element: ${selector}`).not.toMatch(/(^|[\s,>+~(])(input|textarea|select)(?![\w-])/);
      if (!selector.includes('.ui-')) continue;
      const open = match.index + match[0].length;
      const body = consoleCode.slice(open, consoleCode.indexOf('}', open));
      for (const line of body.split(';').map((part) => part.trim()).filter(Boolean)) {
        expect(line, `console.css re-paints a primitive: ${line}`).toMatch(/^(display|margin(-block|-inline)?(-(start|end|top|bottom|left|right))?):/);
      }
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
    ...['ConsolePalette', 'ConsoleShell', 'ContentWorkspace', 'LoginForm', 'PasswordForm', 'SettingsWorkspace'].map((name) =>
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
    for (const name of ['ContentWorkspace', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
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
      ...['ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ConsoleShell', 'ContentWorkspace', 'LoginForm', 'PasswordForm', 'SettingsWorkspace'].map((name) => `src/components/console/${name}.tsx`),
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
    expect(consoleCode).toMatch(/\.console-table th,\s*\.console-table td\s*\{[^}]*overflow-wrap: anywhere;/);
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
    // `--radius-pill` had no consumer until the badge took the radius the chip wrote by hand.
    // Three literals survive in the console sheet, all of them inside the saved-view chips —
    // the controls 19.3d owns when it takes the card, the table and the tabs.
    expect(globals).toMatch(/--radius-pill: 9999px;/);
  });
});
