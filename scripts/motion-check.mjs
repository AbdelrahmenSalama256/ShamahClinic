#!/usr/bin/env node
/**
 * MB-2 — the lint the row asks for: "Transitions and animation restored, site only, via
 * motion tokens; no `transition: all`; a lint that fails on it."
 *
 * Two tiers, because the row has two halves.
 *
 *   Tier 1 — every source file, console included. `transition: all` is a defect on either
 *     surface: it animates properties the component never meant to move, it costs a reflow
 *     when one of them is `width` or `padding`, and in a `!important`-less cascade it is
 *     simply impossible to override by name. The console already writes none, so this tier
 *     costs nothing today and keeps the site's blanket from creeping back.
 *
 *   Tier 2 — the site surface only. A site file may not write a duration, a curve or a
 *     framer `transition` number at the call site; it asks for a role. `duration-hover`,
 *     `ease-brand`, `motionTransition("hover")`, `var(--dur-reveal)`. Item 3 gives the
 *     console its own rules, so this tier deliberately does not reach into it.
 *
 * Rules, in the order they are reported:
 *   blanket-transition   `transition: all` / `transition-property: all` / class `transition-all`
 *   numeric-duration     `duration-300`, `duration-[400ms]` — bakes a number into the sheet
 *   arbitrary-ease       `ease-[cubic-bezier(.22,1,.36,1)]` — same, and unreadable
 *   raw-curve            a `cubic-bezier(` written outside the token table
 *   raw-duration-number  `duration: 0.25` in a framer `transition` prop
 *   raw-time-literal     `"700ms"` in a style object, or a `<time>` in a CSS transition or
 *                        animation value. Zero lengths (`0ms`) and the reduced-motion kill
 *                        switch (`0.001ms`) are allowed: they stop motion, they are not motion.
 *   unknown-token        `duration-<name>` / `ease-<name>` that no `--transition-duration-*`
 *                        or `--ease-*` theme key defines. A typo here is not a lint nit:
 *                        Tailwind emits nothing, the class is inert, and the control silently
 *                        falls back to `--default-transition-duration`.
 *
 *   node scripts/motion-check.mjs              # site + console, human output
 *   node scripts/motion-check.mjs --json       # machine output (tests)
 *   node scripts/motion-check.mjs --strict     # ignore the exemption table, to measure it
 *   node scripts/motion-check.mjs --file src/app/globals.css
 *
 *   exit 0  clean
 *   exit 1  a violation, printed with file:line and the offending text
 *   exit 2  an input is missing — the token table unreadable is not a pass
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const ROOT = 'src';

/** Files that are the console's surface, and so outside tier 2. */
const isConsole = (rel) =>
  rel.startsWith('src/app/(console)/') ||
  rel.startsWith('src/components/console/') ||
  rel.endsWith('console.css') ||
  rel.endsWith('console-kit.css');

/** `tokens.css` owns the numbers; that is what it is for. */
const TOKEN_TABLE = 'src/styles/tokens.css';

/**
 * Per-file, per-rule exemptions. Each one carries the reason and the issue that retires it,
 * so this list can only shrink.
 */
const EXEMPT = {
  'src/components/pages/TreatmentDetailClient.tsx': {
    rules: ['numeric-duration', 'arbitrary-ease', 'raw-curve', 'raw-duration-number', 'raw-time-literal'],
    reason:
      'Q-24: this page carries another pass\'s uncommitted work (877 lines in the tree today). ' +
      'MB-2 swept every other site file; splitting this one\'s hunks would have staged that work. ' +
      'Retire when the service-page pass lands and three `duration-300` plus one `ease-[cubic-bezier(…)]` become tokens.',
  },
};

/** Time lengths that stop motion rather than describe it. */
const TIME_ALLOW = new Set(['0ms', '0s', '0', '0.001ms']);

const RULES = [
  { id: 'blanket-transition', tier: 1, langs: ['css'], re: /transition(?:-property)?\s*:\s*[^;{}]*?\ball\b[^;{}]*/g },
  { id: 'blanket-transition', tier: 1, langs: ['tsx', 'ts'], re: /\btransition-all\b/g },
  { id: 'numeric-duration', tier: 2, langs: ['tsx', 'ts'], re: /\bduration-\[?\d[^\s"'`]*\b/g },
  { id: 'arbitrary-ease', tier: 2, langs: ['tsx', 'ts'], re: /\bease-\[[^\]]*\]/g },
  { id: 'raw-curve', tier: 2, langs: ['tsx', 'ts', 'css'], re: /\bcubic-bezier\s*\(/g },
  { id: 'raw-duration-number', tier: 2, langs: ['tsx', 'ts'], re: /\bduration:\s*\d+(?:\.\d+)?(?![\w.])/g },
  { id: 'raw-time-literal', tier: 2, langs: ['tsx', 'ts'], re: /["'`]\d+(?:\.\d+)?m?s["'`]/g },
  { id: 'raw-time-literal', tier: 2, langs: ['css'], re: /(?:transition|animation)[a-z-]*\s*:\s*[^;{}]*?\b\d+(?:\.\d+)?m?s\b/g },
];

/** Replace every comment with spaces, keeping newlines, so offsets and line numbers hold. */
export function maskComments(source, lang) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  const css = lang === 'css';
  let i = 0;
  let depth = 0; // template-literal `${` nesting
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      blank(i, end === -1 ? source.length : end + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (!css && two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (!css && (source[i] === '"' || source[i] === "'")) {
      const q = source[i];
      let j = i + 1;
      while (j < source.length && source[j] !== q) {
        if (source[j] === '\\') j += 1;
        if (source[j] === '\n') break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (!css && source[i] === '`') {
      // template literal: contents are class strings, so they stay visible to the rules;
      // only `${ … }` is walked, and a `//` inside the text is not a comment.
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '`') break;
        if (source[j] === '$' && source[j + 1] === '{') {
          depth = 1;
          j += 2;
          while (j < source.length && depth > 0) {
            if (source[j] === '{') depth += 1;
            else if (source[j] === '}') depth -= 1;
            j += 1;
          }
          continue;
        }
        j += 1;
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** The names Tailwind will accept on a `duration-*` / `ease-*` utility. */
function utilityNames(files) {
  const names = new Set(['in', 'out', 'in-out', 'linear']); // Tailwind's own easing keys
  for (const [, , css] of files) {
    const masked = maskComments(css, 'css');
    for (const m of masked.matchAll(/--transition-duration-([a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
    for (const m of masked.matchAll(/--ease-([a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** The `--dur-*` / `--ease-*` custom properties the token table actually defines. */
function varNames(files) {
  const names = new Set();
  for (const [, , css] of files) {
    const masked = maskComments(css, 'css');
    for (const m of masked.matchAll(/(--(?:dur|ease)-[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** Both halves of the vocabulary, for findInSource(). */
export function motionVocabulary(files) {
  return { utilities: utilityNames(files), vars: varNames(files) };
}

function langOf(file) {
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
}

/** Is this matched text only about lengths that stop motion? Then it is not a finding. */
function onlyAllowedTimes(text) {
  const times = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)];
  return times.length > 0 && times.every((m) => TIME_ALLOW.has(`${m[1]}${m[2]}`));
}

/** Findings for one file, as {rule, line, text}. */
export function findInSource(rel, source, theme, options = {}) {
  const themeNames = theme.utilities ?? theme; // a bare name set still works for the utility rules
  const lang = langOf(rel);
  const masked = maskComments(source, lang);
  // --strict ignores the exemption table, which is the only way to measure what it hides.
  const exempt = options.strict ? undefined : EXEMPT[rel];
  const tier2 = !isConsole(rel) && rel !== TOKEN_TABLE;
  const found = [];
  for (const rule of RULES) {
    if (!rule.langs.includes(lang)) continue;
    if (rule.tier === 2 && !tier2) continue;
    if (exempt?.rules.includes(rule.id)) continue;
    for (const m of masked.matchAll(rule.re)) {
      const text = m[0].trim();
      if (onlyAllowedTimes(text)) continue;
      found.push({ rule: rule.id, line: lineOf(masked, m.index), text });
    }
  }
  // undefined-var: `var(--dur-x)` the token table never defines. A typo here is an invalid
  // value, and an invalid value on a transition is not an error — the property simply does
  // not animate, which is how `duration-300` came to compute to nothing for a year.
  if (tier2 && theme.vars && !exempt?.rules.includes('undefined-var')) {
    for (const m of masked.matchAll(/var\(\s*(--(?:dur|ease)-[a-zA-Z0-9-]+)\s*\)/g)) {
      if (!theme.vars.has(m[1])) found.push({ rule: 'undefined-var', line: lineOf(masked, m.index), text: m[1] });
    }
  }
  // unknown-token: a motion utility whose name no theme key defines
  if (tier2) {
    if (!exempt?.rules.includes('unknown-token')) {
      for (const m of masked.matchAll(/\b(?:[a-z-]+:)*duration-([a-z][\w-]*)/g)) {
        if (!themeNames.has(m[1])) found.push({ rule: 'unknown-token', line: lineOf(masked, m.index), text: `duration-${m[1]}` });
      }
      for (const m of masked.matchAll(/\b(?:[a-z-]+:)*ease-([a-z][\w-]*)/g)) {
        if (!themeNames.has(m[1])) found.push({ rule: 'unknown-token', line: lineOf(masked, m.index), text: `ease-${m[1]}` });
      }
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

export function collectFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(css|tsx|ts)$/.test(entry.name)) out.push(abs);
    }
  };
  walk(root);
  return out;
}

export function run({ cwd = process.cwd(), only, strict = false } = {}) {
  const abs = only ? [join(cwd, only)] : collectFiles(join(cwd, ROOT));
  const files = [];
  for (const path of abs) {
    if (!existsSync(path)) return { missing: path, findings: [], scanned: 0 };
    files.push([path.slice(cwd.length + 1).split(sep).join('/'), path, readFileSync(path, 'utf8')]);
  }
  const theme = motionVocabulary(files.filter(([, path]) => path.endsWith('.css')));
  const findings = [];
  let consoleSkipped = 0;
  for (const [rel, , source] of files) {
    if (isConsole(rel)) consoleSkipped += 1;
    for (const f of findInSource(rel, source, theme, { strict })) findings.push({ file: rel, ...f });
  }
  return { findings, scanned: files.length, consoleSkipped, missing: null };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const onlyAt = argv.indexOf('--file');
  const result = run({ only: onlyAt >= 0 ? argv[onlyAt + 1] : undefined, strict: argv.includes('--strict') });
  if (result.missing) {
    console.error(`motion-check: no such file: ${result.missing}`);
    process.exit(2);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const f of result.findings) {
      console.log(`${f.file}:${f.line}  ${f.rule}  ${f.text.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    if (result.findings.length === 0) {
      const exemptions = Object.keys(EXEMPT).length;
      console.log(
        `motion-check: ${result.scanned} files scanned, ${result.consoleSkipped} console files on tier 1 only, ` +
          `${exemptions} documented exemption${exemptions === 1 ? '' : 's'} — 0 violations`,
      );
    } else {
      console.error(`motion-check: ${result.findings.length} violation(s) in ${new Set(result.findings.map((f) => f.file)).size} file(s)`);
      for (const rel of Object.keys(EXEMPT)) console.error(`  exempt (tier 2, partial): ${rel}`);
    }
  }
  process.exit(result.findings.length ? 1 : 0);
}
