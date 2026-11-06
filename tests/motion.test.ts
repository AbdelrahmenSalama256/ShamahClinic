/**
 * MB-2 — the motion table, the lint that defends it, and the two halves agreeing.
 *
 * Item 2 is "transitions and animation restored, site only, via motion tokens; no
 * `transition: all`; a lint that fails on it", and a row like that passes for two reasons
 * that are easy to lose. The first is the lint itself: a checker that reports zero
 * violations because its patterns silently stopped matching is indistinguishable from a
 * clean site, so the fixtures below feed it the exact text the site used to contain — a
 * blanket, a `duration-300`, a hand-written bezier — and fail unless each one is caught.
 * The same fixtures prove the flip side: a `//` inside a URL, the reduced-motion kill
 * switch, and a class inside a comment must NOT be caught, or the rule becomes the noise
 * that gets a suppression comment within a week.
 *
 * The second is the split brain. `src/lib/motion.ts` is the same table written in the unit
 * framer-motion takes, because a JS call site cannot read a CSS custom property. Two copies
 * of a number drift by default, so equality here is checked by parsing both files, not by
 * a comment that asks nicely — and a role with no consumer is removed, which is what keeps
 * the JS half from becoming a museum of every duration the CSS happens to define.
 *
 * Finally, "site only": the console's polish is its own sheet's, at its own numbers, and
 * MB-2 did not move it — which is asserted here, and from the `data-surface` markers that
 * make the split real on all three documents that paint the site.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DUR, EASE_SIGNATURE, motionTransition, milliseconds } from '../src/lib/motion';
import { collectFiles, findInSource, motionVocabulary, run } from '../scripts/motion-check.mjs';
import { sourceText } from './source-text';

const TOKENS = 'src/styles/tokens.css';
const GLOBALS = 'src/app/globals.css';

/** The vocabulary the real token table publishes, for the fixture runs below. */
const vocabulary = () =>
  motionVocabulary(
    [TOKENS, GLOBALS, 'src/components/ui/ui.css'].map((rel) => [
      rel,
      rel,
      sourceText(rel),
    ]),
  );

describe('the lint has teeth', () => {
  const theme = vocabulary();
  const probe = (lang: 'css' | 'tsx', source: string) =>
    findInSource(`src/probe.${lang}`, source, theme).map((f) => f.rule);

  // The fixture below is the text `shamah/no-blanket-transition` exists to reject, and a
  // test that proves a lint has teeth has to hold the banned string in plain sight. The
  // suppression is scoped to this one case, so the rule still guards the rest of the file —
  // and it reported this line before the comment existed, which is its own proof.
  /* eslint-disable shamah/no-blanket-transition */
  it('fails the text the site used to contain', () => {
    expect(probe('css', 'a { transition: all .3s ease-in-out !important }')).toEqual(
      expect.arrayContaining(['blanket-transition', 'raw-time-literal']),
    );
    expect(probe('tsx', '<a className="transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)]" />')).toEqual(
      expect.arrayContaining(['blanket-transition', 'numeric-duration', 'arbitrary-ease', 'raw-curve']),
    );
    expect(probe('tsx', '<m.div transition={{ duration: 0.25, ease }} />')).toContain('raw-duration-number');
    expect(probe('tsx', '<div style={{ transitionDuration: "700ms" }} />')).toContain('raw-time-literal');
    expect(probe('css', '.x { transition: color var(--dur-hovr) var(--ease-signature) }')).toContain('undefined-var');
    expect(probe('tsx', '<a className="duration-hovr" />')).toContain('unknown-token');
  });
  /* eslint-enable shamah/no-blanket-transition */

  it('leaves alone the forms that are allowed on purpose', () => {
    // the reference quoted in prose, not written as a rule
    expect(probe('css', '/* the original writes `* { transition: all .3s ease-in-out }` */ a { color: red }')).toEqual([]);
    // the reduced-motion kill switch stops motion; it is not motion
    expect(probe('css', '*, *::before { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important }')).toEqual([]);
    expect(probe('tsx', '<div style={{ transitionDuration: reduce ? "0ms" : undefined }} />')).toEqual([]);
    // the token forms, both surfaces of the table
    expect(probe('tsx', '<a className="transition-colors duration-hover ease-brand" />')).toEqual([]);
    expect(probe('tsx', '<m.div transition={{ duration: DUR.enter, delay: 0.35 }} />')).toEqual([]);
    expect(probe('css', '.x { transition: color var(--dur-hover) var(--ease-signature) }')).toEqual([]);
    // a `//` inside a string is a path, not a comment
    expect(probe('tsx', '<img src="https://example.com/a//b.png" className="duration-hover" />')).toEqual([]);
  });

  it('reads the site as clean and knows precisely what it exempts', () => {
    const clean = run();
    expect(clean.missing, 'the source tree is where the checker thinks it is').toBeNull();
    expect(clean.findings, JSON.stringify(clean.findings)).toEqual([]);
    // --strict removes the exemption table, so the table's cost is a number, not a rumour.
    const strict = run({ strict: true });
    expect([...new Set(strict.findings.map((f: { file: string }) => f.file))]).toEqual([
      'src/components/pages/TreatmentDetailClient.tsx',
    ]);
    expect(strict.findings).toHaveLength(5);
  });

  it('runs as the command the gates call', () => {
    const out = execFileSync(process.execPath, ['scripts/motion-check.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toContain('0 violations');
  });
});

describe('the two halves of the table agree', () => {
  const tokens = sourceText(TOKENS);
  const cssDuration = new Map(
    [...tokens.matchAll(/--dur-([a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

  const asMs = (value: string): number => {
    const m = /^([\d.]+)(ms|s)$/.exec(value);
    if (!m) return Number.NaN;
    return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
  };

  it('mirrors a CSS token, never a private number', () => {
    for (const [role, seconds] of Object.entries(DUR)) {
      const declared = cssDuration.get(role);
      expect(declared, `--dur-${role} must exist in the CSS table`).toBeDefined();
      expect(asMs(declared as string), `--dur-${role} is not ${seconds}s`).toBe(
        Math.round(seconds * 1000),
      );
    }
  });

  it('carries the house curve once, in both units', () => {
    const curve = /--ease-signature:\s*cubic-bezier\(([^)]+)\)/.exec(tokens);
    expect(curve?.[1].split(',').map(Number)).toEqual([...EASE_SIGNATURE]);
    expect(motionTransition('hover')).toEqual({ duration: 0.3, ease: EASE_SIGNATURE });
    expect(milliseconds('count')).toBe(1400);
  });

  it('every role has a call site today', () => {
    // The CSS table earns its place by having a consumer; the JS half is held to the same
    // rule, or it quietly becomes a list of durations nobody can use.
    const site = collectFiles('src')
      .map((file: string) => file.replace(/\\/g, '/'))
      .filter(
        (file: string) =>
          !file.startsWith('src/app/(console)/') &&
          !file.startsWith('src/components/console/') &&
          !file.endsWith('motion.ts'),
      )
      .map((file: string) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const role of Object.keys(DUR)) {
      const used = new RegExp(
        `motionTransition\\("${role}"\\)|milliseconds\\("${role}"\\)|\\bDUR\\.${role}\\b`,
      ).test(site);
      expect(used, `no site file asks for the "${role}" role`).toBe(true);
    }
  });
});

describe('the surface split the row asks for', () => {
  const globals = sourceText(GLOBALS);

  it('re-scopes Tailwind defaults on the site only', () => {
    const site = /\[data-surface="site"\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? '';
    expect(site).toContain('--default-transition-duration: var(--dur-hover)');
    expect(site).toContain('--default-transition-timing-function: var(--ease-signature)');
    // nowhere else in the sheet: a console document that inherited these would move.
    const rest = globals.replace(/\[data-surface="site"\]\s*\{[^}]*\}/, '');
    expect(rest).not.toMatch(/--default-transition-(duration|timing-function)\s*:/);
  });

  it('keeps the console polish at the length it computes today', () => {
    const consoleSheet = sourceText('src/app/(console)/console/console.css');
    const consoleRule =
      /\[data-surface="console"\]\s*:where\(a, button, input, select, textarea, summary\)\s*\{([^}]*)\}/.exec(consoleSheet)?.[1] ?? '';
    expect(consoleRule).not.toBe('');
    expect(consoleRule).toContain('transition-duration: var(--c-dur-base)');
    expect(consoleRule).toContain('transition-timing-function: var(--c-ease-soft)');
    // …and it never lived in the site's sheet: the two import graphs do not meet, so a
    // console-scoped rule in globals.css is dead code that reads like a promise.
    expect(globals).not.toContain('[data-surface="console"]');
  });

  it('puts the site polish where a component can outrank it', () => {
    // The layer is the whole point: unlayered, this rule beat every utility in
    // `@layer utilities`, which is how 132 duration classes came to compute to nothing.
    expect(globals).toMatch(/@layer base\s*\{\s*\[data-surface="site"\]\s*:is\(/);
    const siteRule = /\[data-surface="site"\]\s*:is\([^)]*\)\s*\{([^}]*)\}/.exec(globals)?.[1] ?? '';
    expect(siteRule).toContain('var(--dur-hover)');
    expect(siteRule.match(/var\(--ease-[a-z]+\)/g)).toContain('var(--ease-signature)');
  });

  it('marks every site document, or the polish silently skips it', () => {
    // Three documents render the site: the [lang] layout, and the two 404 routes that
    // compose their own document outside it. A fourth <html> without the marker would
    // load the sheet and get none of it.
    expect(sourceText('src/app/[lang]/layout.tsx')).toContain('data-surface="site"');
    expect(sourceText('src/components/pages/NotFoundDocument.tsx')).toContain('data-surface="site"');
    expect(sourceText('src/app/(console)/console/layout.tsx')).toContain('data-surface="console"');
  });
});
