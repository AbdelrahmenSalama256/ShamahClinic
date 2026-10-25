/**
 * BK-20 S0.4 — the console is a separate document, not a themed page.
 *
 * Slices 0.1–0.3 gave the console its own palette, reset, kit and controls. This suite is
 * the fence around that work, because the failure it prevents is slow and silent: one
 * `var(--text-muted)` copied from a site rule, one `.ui-card` left in a console screen, or
 * one `import '../globals.css'` added to make something look right, and the two surfaces
 * are coupled again — a site token change repaints the console, and a console class starts
 * leaking onto public pages.
 *
 * Four guards, one per sentence of the brief:
 *   (a) every `var()` the console sheets read is declared by the console, and none is a site token;
 *   (b) no site stylesheet selects `[data-surface="console"]`, `.console-*` or `.console-body`;
 *   (c) the console root's import graph reaches neither `globals.css` nor the site sheets,
 *       and the site root's graph reaches neither console sheet;
 *   (d) no console component names a `ui-*` class.
 *
 * They are static proofs on purpose: the two sheets never share a page, so a browser could
 * not show a conflict even if one existed. Comments are stripped before every sweep, since
 * the sheets quote the names they retired.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const stripCss = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Source with its comments blanked, so prose about a retired class cannot pass for one. */
const stripSource = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1');

const CONSOLE = 'src/app/console';
const CONSOLE_SHEETS = [`${CONSOLE}/console.css`, `${CONSOLE}/console-kit.css`];
const SITE_SHEETS = ['src/app/globals.css', 'src/components/ui/ui.css', 'src/styles/tokens.css'];
const SITE_TOKEN_FILE = 'src/styles/tokens.css';

/** The one variable the console reads without declaring it: `next/font` writes it on the
 *  root from `tajawal.variable`, and `--c-font` names it first in its stack. */
const FONT_VARIABLE = '--font-tajawal';

/** `--name:` at the start of a declaration, not `var(--name)` or a `--name` in prose. */
function declared(css: string): Set<string> {
  return new Set([...css.matchAll(/(?:^|[\s;{])(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!));
}

function readVariables(css: string): Set<string> {
  return new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!));
}

/** Selector text of every declaration block. The pattern cannot cross a brace, so an
 *  `@media` wrapper drops out and its inner selectors are read on their own. */
function selectorsOf(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1]!.replace(/\s+/g, ' ').trim())
    .filter((selector) => !selector.startsWith('@'));
}

/** `import './x.css'` in a TS/TSX module, resolved against the module's own directory. */
function cssImportsOf(file: string): string[] {
  return [...stripSource(read(file)).matchAll(/import\s+['"]([^'"]+\.css)['"]/g)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => normalize(join(dirname(file), specifier)).replace(/\\/g, '/'));
}

/** `@import "…"` inside a stylesheet, resolved against the sheet's own directory. */
function sheetImportsOf(file: string): string[] {
  return [...stripCss(read(file)).matchAll(/@import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => normalize(join(dirname(file), specifier)).replace(/\\/g, '/'));
}

/** Every stylesheet reachable from a TypeScript root, following `@import`s too. */
function styleGraphOf(rootFile: string): Set<string> {
  const seen = new Set<string>();
  const queue = [rootFile];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const next = file.endsWith('.css') ? sheetImportsOf(file) : cssImportsOf(file);
    queue.push(...next);
  }
  seen.delete(rootFile);
  return seen;
}

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

describe('the console reads only what it declares (S0.4)', () => {
  const consoleCss = stripCss(CONSOLE_SHEETS.map(read).join('\n'));
  const consoleDeclared = declared(consoleCss);
  const siteDeclared = declared(stripCss(read(SITE_TOKEN_FILE)));

  it('resolves every var() to a --c-* token, or the one font variable', () => {
    const names = readVariables(consoleCss);
    expect(names.size).toBeGreaterThan(40);
    for (const name of names) {
      expect(
        name.startsWith('--c-') || name === FONT_VARIABLE,
        `${name} is not a console variable`,
      ).toBe(true);
      expect(
        consoleDeclared.has(name) || name === FONT_VARIABLE,
        `${name} is read but never declared by the console`,
      ).toBe(true);
    }
  });

  it('names no site token, even one whose value happens to match', () => {
    for (const name of readVariables(consoleCss)) {
      expect(siteDeclared.has(name), `${name} belongs to ${SITE_TOKEN_FILE}`).toBe(false);
    }
  });
});

describe('no site stylesheet reaches the console (S0.4)', () => {
  it('selects nothing under the console scope or class family', () => {
    for (const sheet of SITE_SHEETS) {
      for (const selector of selectorsOf(stripCss(read(sheet)))) {
        expect(selector, `${sheet} paints the console`).not.toMatch(
          /\[data-surface=["']console["']\]|\.console-[a-z]/,
        );
      }
    }
  });
});

describe('the two roots never share a stylesheet (S0.4)', () => {
  const consoleGraph = styleGraphOf(`${CONSOLE}/layout.tsx`);
  const siteGraph = styleGraphOf('src/app/[lang]/layout.tsx');

  it('loads the console kit and the console sheet, and nothing from the site', () => {
    expect([...consoleGraph].sort()).toEqual(
      [`${CONSOLE}/console-kit.css`, `${CONSOLE}/console.css`].sort(),
    );
    for (const siteSheet of SITE_SHEETS) {
      expect(consoleGraph.has(siteSheet), `${siteSheet} is not in the console graph`).toBe(false);
    }
  });

  it('leaves the site graph on its own three sheets', () => {
    expect([...siteGraph].sort()).toEqual([...SITE_SHEETS].sort());
    for (const consoleSheet of CONSOLE_SHEETS) {
      expect(siteGraph.has(consoleSheet), `${consoleSheet} is not in the site graph`).toBe(false);
    }
  });

  it('lets no console page import a stylesheet behind the root`s back', () => {
    for (const file of filesUnder(CONSOLE, /\.tsx$/)) {
      if (file.endsWith('layout.tsx')) continue;
      for (const imported of cssImportsOf(file)) {
        expect(CONSOLE_SHEETS, `${file} imports ${imported}`).toContain(imported);
      }
    }
  });

  it('does not restyle itself from the site theme', () => {
    const layout = stripSource(read(`${CONSOLE}/layout.tsx`));
    expect(layout).not.toMatch(/siteTheme/);
    expect(layout).not.toMatch(/\sstyle=/);
    // Dark is a child of the console's own root, never of the site's document attribute.
    expect(consoleCssOf('console.css')).not.toMatch(/html\[data-theme/);
  });

  function consoleCssOf(name: string): string {
    return stripCss(read(`${CONSOLE}/${name}`));
  }
});

describe('no console component names a site class (S0.4)', () => {
  it('writes only console-* classes in class attributes and clsx calls', () => {
    for (const file of filesUnder(CONSOLE, /\.tsx$/).concat(filesUnder('src/components/console', /\.tsx$/))) {
      const source = stripSource(read(file));
      for (const match of source.matchAll(/className\s*=\s*(?:\{[^}]*\}|["'][^"']*["'])/g)) {
        expect(match[0], `${file} paints a ui-* class`).not.toMatch(/["'`{]ui-[a-z]/);
      }
      for (const match of source.matchAll(/clsx\(\s*["'`]ui-[a-z][\w-]*/g)) {
        expect(match[0], `${file} paints a ui-* class`).not.toMatch(/ui-/);
      }
    }
  });
});
