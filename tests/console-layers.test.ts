/**
 * The console has two sheets and one painter per object.
 *
 * `console-kit.css` draws a button, a chip, a badge, an alert, a note and a count.
 * `console.css` places them. The failure this suite prevents is the one it was written
 * after: every kit class was painted a second time, unconditionally, by the surface
 * sheet — so the kit's light and dark values were dead code, and a change to the kit
 * showed up nowhere.
 *
 * The checks read the source, because the two sheets are the only place the answer
 * lives: the browser sees one merged cascade and could not say which file won.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (name: string): string => readFileSync(join(ROOT, 'src/app/(console)/console', name), 'utf8');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const blankComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

const ORDER = '@layer reset, tokens, kit, screens;';

/** Rules declared directly inside a named layer, at its own depth (not inside @media). */
function layerBody(css: string, layer: string): string {
  const text = blankComments(css);
  const marker = `@layer ${layer} {`;
  const layerStart = text.indexOf(marker);
  if (layerStart < 0) throw new Error(`layer ${layer} not found`);
  let depth = 0;
  const bodyStart = layerStart + marker.length;
  let layerEnd = -1;
  for (let index = bodyStart - 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        layerEnd = index;
        break;
      }
    }
  }
  if (layerEnd < 0) throw new Error(`layer ${layer} does not close`);
  return text.slice(bodyStart, layerEnd);
}

/** Every selector in a layer body, including those inside @media/@supports wrappers. */
function selectorsInLayer(css: string, layer: string): string[] {
  const out: string[] = [];
  const walk = (text: string): void => {
    let headerStart = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '{') continue;
      let depth = 0;
      let close = index;
      for (; close < text.length; close += 1) {
        if (text[close] === '{') depth += 1;
        else if (text[close] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const header = text.slice(headerStart, index).trim();
      const body = text.slice(index + 1, close);
      if (/^@(media|supports|container)\b/.test(header)) walk(body);
      else if (!header.startsWith('@')) out.push(...splitSelectors(header));
      index = close;
      headerStart = close + 1;
    }
  };
  walk(layerBody(css, layer));
  return out;
}

function rulesInLayer(css: string, layer: string): { selector: string; body: string }[] {
  const text = blankComments(css);
  const layerStart = text.indexOf(`@layer ${layer} {`);
  if (layerStart < 0) throw new Error(`layer ${layer} not found`);
  let depth = 0;
  const bodyStart = layerStart + `@layer ${layer} {`.length;
  let layerEnd = -1;
  for (let index = bodyStart - 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        layerEnd = index;
        break;
      }
    }
  }
  if (layerEnd < 0) throw new Error(`layer ${layer} does not close`);

  const rules: { selector: string; body: string }[] = [];
  let localDepth = 0;
  let selectorStart = bodyStart;
  let blockStart = -1;
  for (let index = bodyStart; index < layerEnd; index += 1) {
    const char = text[index];
    if (char === '{') {
      if (localDepth === 0) {
        blockStart = index;
        rules.push({ selector: text.slice(selectorStart, index).trim(), body: '' });
      }
      localDepth += 1;
    } else if (char === '}') {
      localDepth -= 1;
      if (localDepth === 0) {
        rules[rules.length - 1]!.body = text.slice(blockStart + 1, index);
        selectorStart = index + 1;
      }
    }
  }
  return rules;
}

/** Split a selector list on commas that are not inside :is()/:where()/:not(). */
function splitSelectors(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      out.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  out.push(selector.slice(start));
  return out.map((part) => part.trim()).filter(Boolean);
}

/** The element a selector actually paints: everything after the last combinator. */
function subject(selector: string): string {
  let depth = 0;
  let cut = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index]!;
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0 && (char === ' ' || char === '>' || char === '+' || char === '~')) cut = index + 1;
  }
  return selector.slice(cut).trim();
}

/** Classes the kit itself paints. */
function kitClasses(kit: string): Set<string> {
  const names = new Set<string>();
  for (const rule of rulesInLayer(kit, 'kit')) {
    for (const selector of splitSelectors(rule.selector)) {
      for (const match of subject(selector).matchAll(/\.(console-[\w-]+)/g)) names.add(match[1]!);
    }
  }
  return names;
}

const PAINT =
  /(^|;)\s*(color|background(-[a-z-]+)?|border(-[a-z-]+)?|box-shadow|text-shadow|font(-[a-z-]+)?|letter-spacing|text-decoration(-[a-z-]+)?|text-transform|fill|stroke|opacity)\s*:/;

const consoleCss = read('console.css');
const consoleKit = read('console-kit.css');

describe('the console stylesheets are four named layers (S6)', () => {
  it('declares the same order in both sheets, before any rule', () => {
    for (const [name, sheet] of [
      ['console.css', consoleCss],
      ['console-kit.css', consoleKit],
    ] as const) {
      const first = strip(sheet).trim().split('\n')[0]!.trim();
      expect(first, `${name} opens with the layer order`).toBe(ORDER);
    }
  });

  it('keeps every rule inside a layer, so no unlayered selector can outrank the kit', () => {
    for (const [name, sheet] of [
      ['console.css', consoleCss],
      ['console-kit.css', consoleKit],
    ] as const) {
      const head = strip(sheet).slice(strip(sheet).indexOf(ORDER) + ORDER.length);
      let depth = 0;
      let lastClose = 0;
      for (let index = 0; index < head.length; index += 1) {
        if (head[index] === '{') depth += 1;
        else if (head[index] === '}') {
          depth -= 1;
          if (depth === 0) lastClose = index;
        }
      }
      expect(depth, `${name} has balanced layer blocks`).toBe(0);
      expect(head.slice(lastClose + 1).trim(), `${name} has nothing after its last layer`).toBe('');
    }
  });

  it('splits the objects from the screens', () => {
    expect(rulesInLayer(consoleKit, 'kit').length).toBeGreaterThan(20);
    // The surface sheet has no kit layer at all: a rule there cannot be mistaken for the kit.
    expect(strip(consoleCss)).not.toContain('@layer kit');
    expect(rulesInLayer(consoleCss, 'screens').length).toBeGreaterThan(20);
    expect(rulesInLayer(consoleCss, 'tokens').length).toBeGreaterThan(0);
    expect(rulesInLayer(consoleCss, 'reset').length).toBeGreaterThan(0);
  });

  it('lets the kit be the only painter of a kit class', () => {
    const painted = kitClasses(consoleKit);
    expect(painted.has('console-btn')).toBe(true);
    expect(painted.has('console-badge')).toBe(true);
    expect(painted.has('console-note')).toBe(true);
    expect(painted.has('console-chip')).toBe(true);
    expect(painted.has('console-alert')).toBe(true);

    const offenders: string[] = [];
    for (const rule of rulesInLayer(consoleCss, 'screens')) {
      for (const selector of splitSelectors(rule.selector)) {
        const named = [...subject(selector).matchAll(/\.(console-[\w-]+)/g)]
          .map((match) => match[1]!)
          .filter((name) => painted.has(name));
        if (named.length === 0) continue;
        const paint = PAINT.exec(rule.body);
        if (paint) offenders.push(`${selector.trim()} → ${paint[2]}`);
      }
    }
    expect(offenders, 'a kit class painted a second time by console.css').toEqual([]);
  });

  it('names the count once, and only as a placement', () => {
    const rules = rulesInLayer(consoleCss, 'screens').filter((rule) =>
      splitSelectors(rule.selector).some((selector) => subject(selector) === '.console-count'),
    );
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.body, `${rule.selector} paints the count`).not.toMatch(PAINT);
    }
  });

  it('scopes every selector to a class, an attribute or an id', () => {
    const offenders: string[] = [];
    for (const [name, sheet] of [
      ['console.css', consoleCss],
      ['console-kit.css', consoleKit],
    ] as const) {
      for (const layer of ['reset', 'tokens', 'kit', 'screens']) {
        if (!strip(sheet).includes(`@layer ${layer} {`)) continue;
        for (const selector of selectorsInLayer(sheet, layer)) {
          // The reset reaches elements through `[data-surface="console"]`, which is a scope;
          // a bare `h1` or `*` would repaint every document that shares the chunk.
          if (!/[.#\[]/.test(selector)) offenders.push(`${name} @layer ${layer}: ${selector}`);
        }
      }
    }
    expect(offenders, 'an element selector with no class, attribute or id to scope it').toEqual([]);
  });
});
