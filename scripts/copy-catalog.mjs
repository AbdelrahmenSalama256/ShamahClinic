#!/usr/bin/env node
/**
 * The site's editable copy, gathered from the code that renders it.
 *
 * Every visible string on the public site is written as `t("العربية", "English")`, and
 * that pair *is* the default: the site renders it byte-for-byte until an owner saves an
 * override. This script walks the components, finds every `t()` whose two arguments are
 * string literals, and writes them to `src/lib/copy/catalog.ts` with a stable address:
 * `copy.` plus the first 12 hex of sha256(`ar\u0000en`).
 *
 * A pair used in two places is one entry. That is deliberate: "كل الخدمات" in the header
 * and in the home page's "view all" is the same sentence, and an owner who changes it
 * means both. The entry counts its uses so the console can say so.
 *
 * A call whose arguments are not literals — `t(branch.name.ar, branch.name.en)` — is data
 * from a console row, already editable on the screen that owns that row. It is not copy
 * and has no entry; `--check` prints how many such calls exist so the number is known
 * rather than assumed.
 *
 * A sentence that carries a number is written with a slot — `t("… {0} …", "… {0} …", n)` —
 * because `` t(`${total} نتيجة`) `` is not one string but an unbounded family of them, and
 * an address has to be one of something. Any other shape fails the run.
 *
 * Usage:
 *   node scripts/copy-catalog.mjs           # rewrite src/lib/copy/catalog.ts
 *   node scripts/copy-catalog.mjs --check   # exit 1 if the file is missing or stale
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const outFile = join(root, 'src/lib/copy/catalog.ts');
const check = process.argv.includes('--check');

/** Stable, content-addressed, short enough for `content_fields.field_key` (191 chars). */
function keyOf(ar, en) {
  return `copy.${createHash('sha256').update(`${ar}\u0000${en}`, 'utf8').digest('hex').slice(0, 12)}`;
}

function areaOf(file) {
  if (file.startsWith('src/components/layout/')) return 'shell';
  if (file.startsWith('src/components/home/')) return 'home';
  if (file.startsWith('src/components/pages/')) return 'pages';
  if (file.startsWith('src/components/cards/')) return 'cards';
  if (file.startsWith('src/components/booking/')) return 'booking';
  if (file.startsWith('src/components/tracking/')) return 'tracking';
  if (file.startsWith('src/components/shared/') || file.startsWith('src/components/ui/')) return 'common';
  if (file.startsWith('src/app/')) return 'app';
  return 'components';
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

/** `foo.bar.ar` / `foo.bar.en`, the shape a bilingual console row already has. */
function isLocaleMember(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    (node.name.text === 'ar' || node.name.text === 'en')
  );
}

/**
 * The written-out text of an argument, or null when it is not written out.
 *
 * A template literal is only a string here when nothing is interpolated into it.
 * `${total} نتيجة` is not one string but an unbounded family of them, so it cannot be an
 * address; the component says so with `t("… {0} …", "… {0} …", total)` and the placeholder
 * keeps the entry addressable while the number still comes from the page.
 */
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function scan() {
  const files = [...walk(join(root, 'src/components')), ...walk(join(root, 'src/app'))];
  const entries = new Map();
  const dataDriven = [];
  const unexpected = [];

  for (const absolute of files) {
    const source = readFileSync(absolute, 'utf8');
    const file = relative(root, absolute).split(sep).join('/');
    const script = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const lineOf = (node) => script.getLineAndCharacterOfPosition(node.getStart(script)).line + 1;

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 't' &&
        node.arguments.length >= 2
      ) {
        const [first, second] = node.arguments;
        const ar = literalText(first);
        const en = literalText(second);
        if (ar !== null && en !== null) {
          const key = keyOf(ar, en);
          const existing = entries.get(key);
          if (existing) {
            existing.uses += 1;
          } else {
            entries.set(key, { key, ar, en, area: areaOf(file), file, line: lineOf(node), uses: 1 });
          }
        } else if (isLocaleMember(first) && isLocaleMember(second)) {
          dataDriven.push({ file, line: lineOf(node) });
        } else {
          unexpected.push({ file, line: lineOf(node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(script);
  }

  return {
    files: files.length,
    entries: [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    dataDriven,
    unexpected,
  };
}

function render(result) {
  const rows = result.entries.map(
    (entry) =>
      `  {\n    key: ${JSON.stringify(entry.key)},\n    ar: ${JSON.stringify(entry.ar)},\n    en: ${JSON.stringify(entry.en)},\n    area: ${JSON.stringify(entry.area)},\n    file: ${JSON.stringify(entry.file)},\n    line: ${entry.line},\n    uses: ${entry.uses},\n  },`,
  );
  return `/**
 * GENERATED by \`scripts/copy-catalog.mjs\` — do not edit by hand.
 *
 * Every literal \`t("ar", "en")\` pair the public components render, with the address the
 * console writes and the default the site falls back to. \`npm run copy:catalog\` rewrites
 * this file; \`npm run build\` fails when it is stale.
 *
 * ${result.entries.length} entries from ${result.files} components. Data-driven calls
 * (\`t(row.name.ar, row.name.en)\`) are console rows, not copy, and are not listed here.
 */
export interface CopyEntry {
  /** \`copy.<12 hex of sha256(ar\\0en)>\`. Reword either language and the address changes
   *  with it: the override was written against these words, so it stops applying. */
  key: string;
  ar: string;
  en: string;
  /** The console group: shell, home, pages, cards, booking, common, tracking, app. */
  area: string;
  /** Where the pair first appears, for a person looking for it in the code. */
  file: string;
  line: number;
  /** How many components render this pair; one entry edits all of them. */
  uses: number;
}

export const COPY_CATALOG: readonly CopyEntry[] = [
${rows.join('\n')}
];

export const COPY_BY_KEY: ReadonlyMap<string, CopyEntry> = new Map(COPY_CATALOG.map((entry) => [entry.key, entry]));
`;
}

const result = scan();
const generated = render(result);

if (result.unexpected.length > 0) {
  console.error('copy-catalog: t() calls whose arguments are not a written-out pair:');
  for (const call of result.unexpected) console.error(`  ${call.file}:${call.line}`);
  console.error(
    'An interpolated string is not one address. Write it as t("… {0} …", "… {0} …", value).',
  );
  process.exit(1);
}

if (check) {
  let current = '';
  try {
    current = readFileSync(outFile, 'utf8');
  } catch {
    /* missing is stale */
  }
  if (current !== generated) {
    console.error(`copy-catalog: src/lib/copy/catalog.ts is out of date. Run: npm run copy:catalog`);
    process.exit(1);
  }
  console.log(
    `copy-catalog: ${result.entries.length} entries current; ${result.dataDriven.length} data-driven calls skipped.`,
  );
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, generated);
  console.log(
    `copy-catalog: wrote ${result.entries.length} entries from ${result.files} components ` +
      `(${result.dataDriven.length} data-driven calls skipped).`,
  );
}
