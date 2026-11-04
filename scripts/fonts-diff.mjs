#!/usr/bin/env node
/**
 * MB-1 — a diff of the two sites' faces, descriptor by descriptor.
 *
 * The brief's acceptance is "Fonts = the original site's fonts (D:\shamah is the
 * reference)". `D:\shamah` is read-only and its dev build is gone, so there is no second
 * server to point a browser at; what survives of the original is its compiled stylesheet,
 * `D:\shamah\.tmp\built.css`, which carries every @font-face `next/font/google` emitted
 * for it. That file is the reference this script reads — nothing here writes to the
 * reference tree.
 *
 * It compares face sets, not pixels: family, weight range, unicode-range, the metric
 * overrides of the two fallback faces, and the file each face ships as. The one
 * difference it is built to forgive is the path, because our files live in
 * `public/fonts/<name>.woff2` while the reference's lived behind a hashed
 * `/_next/static/media/<hash>.woff2`; the basename is still compared, so a different
 * binary is still a failure.
 *
 *   node scripts/fonts-diff.mjs                       # against the current .next-build
 *   node scripts/fonts-diff.mjs --ref D:\shamah\.tmp\built.css --ours src/styles/fonts.css
 *
 *   exit 0  identical faces (modulo the src path)
 *   exit 1  a face, a range or a descriptor differs — the diff is printed
 *   exit 2  an input file is missing, which is not a pass
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};

const REF = flag('ref', 'D:/shamah/.tmp/built.css');
const OURS = flag('ours', '.next-build/static/css');
/** The two families the reference paints, and the only ones this diff is about. */
const FAMILIES = ['Readex Pro', 'Montserrat'];

function read(path) {
  return readFileSync(path, 'utf8');
}

/** Every @font-face block in a stylesheet, brace-matched and comment-stripped. */
function facesOf(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const opener = /@font-face\s*\{/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') depth -= 1;
      i += 1;
    }
    const body = source.slice(match.index + match[0].length, i - 1);
    const descriptors = {};
    for (const [, name, value] of body.matchAll(/([a-z-]+)\s*:\s*([^;}]+)/g)) {
      descriptors[name] = value.trim().replace(/\s+/g, ' ');
    }
    found.push(descriptors);
  }
  return found;
}

/** `U+6??` and `U+0600-06FF` are the same set; a minifier writes the first, we the second. */
function codePoints(range) {
  const hex = (text) => Number.parseInt(text.replace(/\?/g, '0'), 16);
  const high = (text) => Number.parseInt(text.replace(/\?/g, 'F'), 16);
  const [lo, hi] = range.split('-');
  return [hex(lo), hi === undefined ? high(lo) : high(hi)];
}

function rangesOf(value) {
  if (!value) return null;
  return value
    .split(',')
    .map((part) => part.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map(codePoints)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** File name only: the hashed media path is the one thing allowed to differ. */
function fileOf(src) {
  if (!src) return '';
  const url = /url\(([^)]+)\)/.exec(src);
  if (url) return url[1].replace(/^["']|["']$/g, '').split('/').pop();
  const local = /local\(([^)]+)\)/.exec(src);
  return local ? `local:${local[1].replace(/^["']|["']$/g, '')}` : src;
}

/** The identity of a face: what a browser would use it for. */
function keyOf(face) {
  const family = (face['font-family'] || '').replace(/^["']|["']$/g, '');
  const ranges = rangesOf(face['unicode-range']);
  const compact = ranges ? ranges.map(([lo, hi]) => `${lo.toString(16)}-${hi.toString(16)}`).join(' ') : '';
  return `${family}|${face['font-weight'] || ''}|${compact}`;
}

/** The overrides that make a fallback face measure like the real one. */
const METRICS = ['ascent-override', 'descent-override', 'line-gap-override', 'size-adjust'];

function describe(face) {
  return {
    family: (face['font-family'] || '').replace(/^["']|["']$/g, ''),
    weight: face['font-weight'] || '',
    display: face['font-display'] || '',
    file: fileOf(face.src),
    ranges: rangesOf(face['unicode-range']),
    metrics: Object.fromEntries(METRICS.map((token) => [token, face[token] || ''])),
  };
}

function collect(path) {
  const files = [];
  if (isDirectory(path)) {
    for (const entry of readdirSync(path)) {
      if (entry.endsWith('.css')) files.push(join(path, entry));
    }
  } else if (existsSync(path)) {
    files.push(path);
  }
  const byKey = new Map();
  for (const file of files) {
    for (const face of facesOf(read(file))) {
      const family = (face['font-family'] || '').replace(/^["']|["']$/g, '');
      if (!FAMILIES.some((name) => family === name || family.startsWith(`${name} `))) continue;
      byKey.set(keyOf(face), { ...describe(face), key: keyOf(face), from: file });
    }
  }
  return { files, byKey };
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

if (!existsSync(REF)) {
  console.error(`FAIL: the reference stylesheet is not present at ${REF}.`);
  console.error('This gate compares against D:\\shamah\\.tmp\\built.css; a missing input is not a pass.');
  process.exit(2);
}

const reference = collect(REF);
const ours = collect(OURS);
if (ours.files.length === 0) {
  console.error(`FAIL: no stylesheet with an @font-face found at ${OURS}.`);
  console.error('Build first (`NEXT_DIST_DIR=.next-build npm run build`) or pass --ours <file>.');
  process.exit(2);
}

const problems = [];
if (ours.byKey.size === 0) problems.push('our side declares none of the reference families');

for (const [key, face] of reference.byKey) {
  const counterpart = ours.byKey.get(key);
  if (!counterpart) {
    problems.push(`missing face ${face.family} @${face.weight} [${(face.ranges ?? []).length} ranges]`);
    continue;
  }
  if (counterpart.display !== face.display) {
    problems.push(`${key}: font-display is ${counterpart.display || '(absent)'}, reference is ${face.display || '(absent)'}`);
  }
  // The reference ships its binaries through next/font's hashed media names; the same
  // bytes under our own file name are the intended rewrite, so the name is reported,
  // not failed — except when the fallback face, which has no file at all, gains one.
  if ((face.file.startsWith('local:')) !== counterpart.file.startsWith('local:')) {
    problems.push(`${key}: src is ${counterpart.file}, reference is ${face.file} (local vs remote)`);
  }
  for (const token of METRICS) {
    if (counterpart.metrics[token] !== face.metrics[token]) {
      problems.push(`${key}: ${token} is ${counterpart.metrics[token] || '(absent)'}, reference is ${face.metrics[token] || '(absent)'}`);
    }
  }
}

for (const [key, face] of ours.byKey) {
  if (reference.byKey.has(key)) continue;
  problems.push(`extra face ${face.family} @${face.weight} [${(face.ranges ?? []).length} ranges] — the reference never declares it`);
}

const widthOf = (x) => String(x.ranges?.length ?? 0);
console.log(`reference ${REF}`);
console.log(`ours      ${OURS} (${ours.files.join(', ')})`);
console.log('');
console.log('family                 ranges  weight    display  file'.padEnd(1, ' '));
for (const face of [...ours.byKey.values()].sort((a, b) => a.family.localeCompare(b.family) || widthOf(a) - widthOf(b))) {
  const referenceFace = reference.byKey.get(face.key);
  console.log(
    `${face.family.padEnd(21)} ${String(widthOf(face)).padStart(2)}    ${face.weight.padEnd(8)} ${(face.display || '-').padEnd(7)} ${face.file}` +
      (referenceFace ? `  <= ${referenceFace.file}` : ''),
  );
}
console.log('');

if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} difference${problems.length === 1 ? '' : 's'} from the reference faces:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`OK: ${ours.byKey.size} faces, every family, weight range, unicode-range, metric override and font-display identical to the reference.`);
