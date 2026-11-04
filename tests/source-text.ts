/**
 * Reading a source file inside a test.
 *
 * Two things here exist because of one checkout: the repo commits LF, and a machine
 * with `core.autocrlf` hands the same committed bytes back with CRLF. Every
 * line-anchored pattern in these suites — the `\n` in front of a selector, the `{`
 * that opens a rule — then matches nothing, and a test that means "this stylesheet
 * says X" reports a defect that only exists depending on how the person who ran it
 * cloned the repository. `sourceText` answers what the file says.
 *
 * `declarations` is the second half of the same mistake: a sheet may hold a base rule
 * for a control and a responsive override for it elsewhere, and reading only the first
 * block lets a `flex-wrap: wrap` inside a media query vouch for a floor that lives in
 * the rule that actually paints the bar. What a sheet guarantees about a selector is
 * the union of the bodies it is written in, so that is what gets read.
 */
import { readFileSync } from 'node:fs';

/** The file's text, with any line ending collapsed to `\n`. */
export function sourceText(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

/** Every declaration the sheet writes for exactly this selector, in source order.
 *
 *  The brace-free pattern cannot cross a rule, so an `@media` wrapper drops out and the
 *  rule inside it is read on its own. Comments go first: they name the class they
 *  replaced, and prose is not a promise the sheet makes. */
export function declarations(source: string, selector: string): string {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  for (const [, before, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectorNames(before ?? '').includes(selector)) bodies.push(body ?? '');
  }
  return bodies.join('\n');
}

/** The names a selector list styles: each comma part, plus every name inside an
 *  `:is()`/`:where()` group, because a bar placed by such a group is placed for real. */
function selectorNames(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  const names: string[] = [];
  for (const part of parts) {
    const flat = part.replace(/\s+/g, ' ').trim();
    if (flat !== '') names.push(flat);
    for (const [, inner] of part.matchAll(/:(?:is|where|any)\(([^)]*)\)/g)) {
      for (const one of inner.split(',')) {
        const name = one.replace(/\s+/g, ' ').trim();
        if (name !== '') names.push(name);
      }
    }
  }
  return names;
}
