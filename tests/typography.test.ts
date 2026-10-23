/**
 * BK-19.2 — the type system, proved from the tree.
 *
 * A font swap is the kind of change that looks finished because the page still
 * renders: if `next/font`'s generated family never reaches the element, the browser
 * silently paints the system face and every ratio, leading and metric below it is
 * still "correct" on a page nobody can tell apart. So these are structural proofs —
 * what the module declares, what the files on disk actually are, and what the two
 * stylesheets consume — rather than screenshots.
 *
 * The offline half matters for BK-11: `next/font/google` downloads at compile time,
 * so a build host without DNS fails the whole build. Nothing in `src` may import it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const fontsModule = read('src/lib/fonts/index.ts');
const globals = read('src/app/globals.css');
const consoleCss = read('src/app/console/console.css');

/** Every `.ts`/`.tsx` under `src`, so a stray import cannot hide in a file nobody reads. */
function sourceFiles(dir = 'src', found: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Source with its comments blanked, character for character so line numbers survive.
 *  These sweeps are about what the tree paints, and prose in a doc comment paints
 *  nothing — cutting it is what keeps a comment from being either an offender or an
 *  escape hatch. A `//` preceded by a colon is a protocol, not a comment. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1');
}

/** The text of a `@layer base { … }` block, brace-matched, or '' when absent. Anchored
 *  to the start of a line because the phrase also appears inside an explanation. */
function layerBlock(css: string, layer: string): string {
  const match = new RegExp(`^@layer ${layer}\\s*\\{`, 'm').exec(css);
  if (!match) return '';
  let depth = 0;
  for (let i = match.index + match[0].length - 1; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}' && (depth -= 1) === 0) return css.slice(match.index, i + 1);
  }
  return '';
}

const DOCUMENT_ROOTS = [
  'src/app/[lang]/layout.tsx',
  'src/app/console/layout.tsx',
  'src/components/pages/NotFoundDocument.tsx',
];

describe('BK-19.2 the type system', () => {
  it('needs no network at build time', () => {
    const offenders = sourceFiles().filter((file) =>
      /from\s+['"]next\/font\/google['"]/.test(read(file)),
    );
    expect(offenders).toEqual([]);
    expect(fontsModule).toMatch(/from\s+["']next\/font\/local["']/);
  });

  it('declares four weights and every file it names is a real woff2', () => {
    const entries = [...fontsModule.matchAll(/path:\s*"([^"]+)",\s*weight:\s*"(\d+)"/g)];
    expect(entries.map((entry) => entry[2])).toEqual(['400', '500', '700', '800']);
    for (const [, rawPath, weight] of entries) {
      const path = join('src/lib/fonts', rawPath.replace(/^\.\//, ''));
      const buffer = readFileSync(join(process.cwd(), path));
      expect(buffer.subarray(0, 4).toString('latin1'), `${path} is woff2`).toBe('wOF2');
      // A silently truncated binary is the failure a text diff cannot see.
      expect(buffer.byteLength, `${path} is a whole Tajawal weight`).toBeGreaterThan(15_000);
      expect(path).toContain(`-${weight}.woff2`);
    }
  });

  it('carries the license the binaries travel under', () => {
    const ofl = read('src/lib/fonts/OFL.txt');
    expect(ofl).toMatch(/Copyright.*Boutros/i);
    expect(ofl).toMatch(/SIL Open Font License/i);
    expect(statSync(join(process.cwd(), 'src/lib/fonts/OFL.txt')).size).toBeGreaterThan(1000);
  });

  it('names one family, and no element paints a second', () => {
    expect(globals).toMatch(
      /--font-ui:\s*var\(--font-tajawal,\s*"Segoe UI", Tahoma, Arial, sans-serif\)/,
    );
    for (const css of [globals, consoleCss]) {
      for (const line of css.split('\n').filter((l) => l.includes('font-family:'))) {
        expect(line.trim(), 'every family declaration goes through the one token').toBe(
          'font-family: var(--font-ui);',
        );
      }
    }
    // The two faces this replaced must not survive as a name anywhere.
    expect(sourceFiles().join('\n')).not.toMatch(/readex|montserrat/i);
  });

  it('applies the family at all three document roots', () => {
    for (const file of DOCUMENT_ROOTS) {
      const source = read(file);
      expect(source).toMatch(/import\s*\{\s*tajawal\s*\}\s*from\s*["']@\/lib\/fonts["']/);
      expect(source).toMatch(/\$\{tajawal\.variable\}/);
      // One family, so exactly one variable onto the document.
      expect(source.match(/\.variable/g)).toHaveLength(1);
    }
  });

  it('keeps the scale in the base layer so a component can still name its own size', () => {
    // Unlayered rules outrank every Tailwind utility; an unlayered `h1 { font-size }`
    // would flatten `text-4xl md:text-6xl` into the scale instead of filling the gap.
    const base = layerBlock(globals, 'base');
    expect(base).not.toBe('');
    for (const token of ['--fs-h1', '--fs-h2', '--fs-h3', '--fs-h4', '--lh-tight']) {
      expect(globals).toMatch(new RegExp(`\\s${token}:`));
    }
    expect(base).toMatch(/h1\s*\{\s*font-size:\s*var\(--fs-h1\);/);
    expect(base).toMatch(/h4\s*\{\s*font-size:\s*var\(--fs-h4\);/);
    expect(base).toMatch(/text-wrap:\s*balance/);
    expect(globals.indexOf('--fs-h1:')).toBeLessThan(globals.indexOf(base));
  });

  it('never tracks Arabic, in either direction', () => {
    // Arabic letters join, so tracking apart from them is a defect whatever its sign:
    // `-0.015em` separates the tooth from the join, `0.3em` dissolves the kashida.
    // The fix is one rule that flattens the scale in RTL, not a `[dir="rtl"]` twin at
    // each of the twelve places that used to ask for tracking by hand.
    const zeroing = /\[dir="rtl"\]\s*\{[^}]*\}/.exec(globals)?.[0] ?? '';
    expect(zeroing, 'RTL has no tracked step').not.toBe('');
    for (const token of ['--ls-heading', '--ls-eyebrow', '--ls-label', '--ls-soft']) {
      expect(zeroing, `${token} resolves to nothing in Arabic`).toMatch(
        new RegExp(`${token}:\\s*0;`),
      );
    }
    // The heading rule asks for the token unqualified, because the token is what knows
    // which way the page runs.
    expect(layerBlock(globals, 'base')).toMatch(
      /h1,\s*h2\s*\{\s*letter-spacing:\s*var\(--ls-heading\);/,
    );
    // Tailwind's own names route through the same tokens, so a component that writes
    // `tracking-tight` is asking for the house value and not for -0.025em.
    expect(globals).toMatch(/@theme\s*\{[^}]*--tracking-tight:\s*var\(--ls-heading\);/);
    expect(globals).toMatch(/--tracking-eyebrow:\s*var\(--ls-eyebrow\);/);
    // …and nothing in the tree still names a tracking value per call site.
    const literal = sourceFiles()
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => /tracking-\[/.test(read(file)));
    expect(literal).toEqual([]);
  });

  it('has no physical directional property in either stylesheet', () => {
    const physical =
      /(^|\s)(margin|padding)-(left|right):|text-align:\s*(left|right)|border-(left|right):/m;
    for (const [name, css] of [
      ['globals.css', globals],
      ['console.css', consoleCss],
    ] as const) {
      const hits = css.split('\n').filter((line) => physical.test(line));
      expect(hits, `${name} uses logical properties only`).toEqual([]);
    }
  });

  it('reserves a digit cell geometrically instead of asking for tnum', () => {
    // Measured off the shipped binaries: no `tnum` in GSUB at any weight, the ten Latin
    // digits span 375–553 units of a 1000 upem, and the Arabic-Indic ones the Arabic
    // pages actually render span 207–633. So alignment is inline-size, not OpenType.
    expect(globals).toMatch(/no `tnum`/);
    expect(globals).toMatch(/--num-cell:\s*max\(1ch, 0\.64em\)/);
    expect(globals).toMatch(
      /@utility num\s*\{[\s\S]*?min-inline-size:\s*calc\(var\(--num-digits, 1\)\s*\*\s*var\(--num-cell\)\);/,
    );
    // The declaration that cannot do anything here is gone from the tree, not left
    // behind as documentation of an intent nobody checked.
    const offenders = sourceFiles('src/components').filter((file) => /tabular-nums/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('mirrors horizontal motion with the reading direction', () => {
    // Every file that animates along x has to say it knows which way the page runs —
    // a slide that enters from the right enters from the trailing edge in Arabic.
    const animated = sourceFiles().filter((file) =>
      /(?:initial|animate|exit|whileInView)=\{\{[^}]*\bx:/.test(read(file)),
    );
    expect(animated.length, 'the sweep would pass vacuously if nothing moved on x').toBeGreaterThan(0);
    for (const file of animated) {
      expect(
        read(file),
        `${file} slides without consulting the direction`,
      ).toMatch(/rtl|language === ['"]ar['"]|dir === ['"]rtl['"]/);
    }
  });

  it('gives the site sections no physical direction to inherit', () => {
    // The stylesheets are proved above; the components carry the same rule as classes.
    const physical =
      /(^|["'\s:])((m|p)(l|r)|left|right)-[a-z0-9[]|text-(left|right)\b|border-(l|r)-|rounded-(l|r)-|origin-(l|r)\b|space-x-/;
    const offenders = sourceFiles()
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => physical.test(withoutComments(read(file))));
    expect(offenders).toEqual([]);
    // Both halves of that pass have to be load-bearing: a sweep that matches nothing is
    // a sweep that stopped catching the class it was written for.
    expect(physical.test('className="flex items-center text-left"'), 'the rule still bites code').toBe(true);
    expect(physical.test(withoutComments('/** use text-left here */')), 'the rule skips prose').toBe(false);
  });
});
