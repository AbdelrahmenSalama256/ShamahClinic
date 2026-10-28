/**
 * The address every editable sentence is stored under, and the one place the site reads it.
 *
 * Three things have to stay true or the texts screen becomes a way to silently break copy:
 * an address names exactly one pair of words, the file holding those addresses is what the
 * components actually render, and a page whose override cannot be read says the words the
 * component says. The first two are arithmetic over `src/lib/copy/catalog.ts`; the third is
 * a real render of `LanguageProvider`, because a `t()` that ignored its bundle would still
 * pass every test that only looks at the database.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { COPY_BY_KEY, COPY_CATALOG } from '../src/lib/copy/catalog';
import {
  COPY_KEY_PATTERN,
  COPY_KEY_PREFIX,
  fillSlots,
  pairKey,
  slotsOf,
  type CopyBundle,
} from '../src/lib/copy/shared';
import { TEXT_AREAS } from '../src/lib/console/texts-center';
import { catalogFor, type MessageKey } from '../src/lib/console/messages';

// The provider reads the language off the path, and the path is the test's to decide.
let mockPath = '/ar/contact';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
}));

const { LanguageProvider, useLanguage } = await import('../src/context/LanguageContext');

/** The generator's own rule, written out again here so a change to one fails the other. */
function keyOf(ar: string, en: string): string {
  return `${COPY_KEY_PREFIX}${createHash('sha256').update(`${ar}\u0000${en}`, 'utf8').digest('hex').slice(0, 12)}`;
}

const AREAS = [...new Set(COPY_CATALOG.map((entry) => entry.area))];

/** A component that renders what `t()` answers, so the overlay is proven in markup. */
function Sentence({ ar, en, values = [] }: Readonly<{ ar: string; en: string; values?: (string | number)[] }>) {
  const { t } = useLanguage();
  return createElement('p', { className: 'sentence' }, t(ar, en, ...values));
}

function drawn(copy: CopyBundle | undefined, locale: 'ar' | 'en', child: ReactElement): string {
  mockPath = `/${locale}/contact`;
  /* eslint-disable react/no-children-prop */
  return renderToStaticMarkup(createElement(LanguageProvider, { copy, children: child }));
  /* eslint-enable react/no-children-prop */
}

describe('a sentence has one address', () => {
  it('names the pair of words it was written against', () => {
    for (const entry of COPY_CATALOG) {
      expect(entry.key, entry.ar).toBe(keyOf(entry.ar, entry.en));
      expect(entry.key).toMatch(COPY_KEY_PATTERN);
    }
  });

  it('is unique, and the map the API writes through holds the same entries', () => {
    const keys = COPY_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size, 'two different pairs sharing one address').toBe(keys.length);
    expect(COPY_BY_KEY.size).toBe(keys.length);
    for (const entry of COPY_CATALOG) expect(COPY_BY_KEY.get(entry.key)).toBe(entry);
    // `content_fields.field_key` is 191 characters. A hash is nowhere near it, but a key
    // built out of the sentence itself would be, and this is where that would show up.
    for (const key of keys) expect(key.length).toBeLessThanOrEqual(191);
  });

  it('is listed in a stable order, so re-running the generator is not a diff', () => {
    const keys = COPY_CATALOG.map((entry) => entry.key);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('the catalog is what the components render', () => {
  it('is current: the generator agrees with the file', () => {
    // Not a reimplementation — the build gate itself, run the way the build runs it.
    const out = execFileSync(process.execPath, ['scripts/copy-catalog.mjs', '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toContain('entries current');
  });

  it('points at files that exist, holding wording worth editing', () => {
    for (const entry of COPY_CATALOG) {
      expect(existsSync(join(process.cwd(), entry.file)), `${entry.file} is gone`).toBe(true);
      expect(entry.file).toMatch(/\.tsx$/);
      expect(entry.line).toBeGreaterThan(0);
      expect(entry.uses).toBeGreaterThanOrEqual(1);
      // A blank default would make an override and the fallback impossible to tell apart.
      expect(entry.ar.trim().length, `${entry.key} Arabic`).toBeGreaterThan(0);
      expect(entry.en.trim().length, `${entry.key} English`).toBeGreaterThan(0);
    }
    // A scanner that walked nothing would still pass every assertion above.
    expect(COPY_CATALOG.length).toBeGreaterThan(150);
  });

  it('groups into areas the console has a heading for', () => {
    for (const locale of ['ar', 'en'] as const) {
      const labels = catalogFor(locale);
      for (const area of [...AREAS, ...TEXT_AREAS]) {
        expect(labels[`texts.area.${area}` as MessageKey], `${area} ${locale}`).toBeTruthy();
      }
    }
  });
});

describe('the words of the screen itself', () => {
  const keys = (Object.keys(catalogFor('ar')) as MessageKey[]).filter((key) => key.startsWith('texts.'));

  it('are written in both languages, and not the same words', () => {
    const ar = catalogFor('ar');
    const en = catalogFor('en');
    expect(keys.length).toBeGreaterThan(25);
    for (const key of keys) {
      expect(ar[key].trim().length, key).toBeGreaterThan(0);
      expect(en[key].trim().length, key).toBeGreaterThan(0);
      expect(ar[key], `${key} is untranslated`).not.toBe(en[key]);
    }
  });

  it('exist on both sides of the catalog', () => {
    expect(Object.keys(catalogFor('en')).sort()).toEqual(Object.keys(catalogFor('ar')).sort());
  });

  it('carry the placeholders the screen substitutes', () => {
    // The screen replaces these by name; a label that lost its slot would print a count
    // that is not there, or the brace characters, into the console.
    for (const locale of ['ar', 'en'] as const) {
      const labels = catalogFor(locale);
      expect(labels['texts.used'], 'texts.used').toContain('{n}');
      expect(labels['texts.count'], 'texts.count').toContain('{changed}');
      expect(labels['texts.count']).toContain('{total}');
    }
  });
});

describe('the lookup a component does', () => {
  it('joins the pair with a separator no sentence contains', () => {
    expect(pairKey('أ', 'B')).toBe('أ␟B');
    // Joining the two strings outright would make ('a', 'bc') and ('ab', 'c') the same
    // address, so a real override could answer a sentence nobody wrote.
    expect(pairKey('a', 'bc')).not.toBe(pairKey('ab', 'c'));
  });

  it('finds only the slots it was given, and ignores the rest', () => {
    expect(slotsOf('no braces')).toEqual([]);
    expect(slotsOf('{0} of {1}')).toEqual(['{0}', '{1}']);
    expect(slotsOf('{name}')).toEqual([]);
    expect(fillSlots('{0} and {1}', ['x', 'y'])).toBe('x and y');
    expect(fillSlots('{1} then {0}', ['first', 'second'])).toBe('second then first');
    expect(fillSlots('{0}', [7])).toBe('7');
    expect(fillSlots('nothing to fill', ['ignored'])).toBe('nothing to fill');
    // A repeated slot is filled everywhere, and the values past it are dropped, not appended.
    expect(fillSlots('{0}, {0} again', ['مرة'])).toBe('مرة, مرة again');
    expect(fillSlots('{0}', ['a', 'b'])).toBe('a');
  });
});

describe('a page renders the owner wording and nothing else', () => {
  const AR = 'احجزي موعدك الآن';
  const EN = 'Book your appointment now';
  const WRITTEN = { ar: 'احجزي عندنا', en: 'Book with us' };
  const sentence = createElement(Sentence, { ar: AR, en: EN });

  it('keeps the words the component says when no override exists', () => {
    for (const locale of ['ar', 'en'] as const) {
      const authored = locale === 'ar' ? AR : EN;
      expect(drawn(undefined, locale, sentence), `${locale} without a bundle`).toContain(authored);
      expect(drawn({ locale, values: {} }, locale, sentence), `${locale} with an empty bundle`).toContain(authored);
    }
  });

  it('replaces them once the owner has written over this pair', () => {
    for (const locale of ['ar', 'en'] as const) {
      const html = drawn({ locale, values: { [pairKey(AR, EN)]: WRITTEN[locale] } }, locale, sentence);
      expect(html).toContain(WRITTEN[locale]);
      expect(html).not.toContain(locale === 'ar' ? AR : EN);
    }
  });

  it('never lets one language dictionary speak on the other page', () => {
    // The client can change the path a moment before the server-rendered bundle does.
    // Wrong words for one frame is worse than the authored words for one frame.
    const html = drawn({ locale: 'ar', values: { [pairKey(AR, EN)]: WRITTEN.ar } }, 'en', sentence);
    expect(html).not.toContain(WRITTEN.ar);
    expect(html).toContain(EN);
  });

  it('fills the slots of the wording the owner typed', () => {
    const bundle = (locale: 'ar' | 'en'): CopyBundle => ({
      locale,
      values: {
        [pairKey('لديك {0} نتيجة', 'You have {0} result')]: locale === 'ar' ? '{0} نتيجة عندنا' : '{0} results here',
      },
    });
    const withSlot = createElement(Sentence, { ar: 'لديك {0} نتيجة', en: 'You have {0} result', values: [12] });
    expect(drawn(bundle('ar'), 'ar', withSlot)).toContain('12 نتيجة عندنا');
    expect(drawn(bundle('en'), 'en', withSlot)).toContain('12 results here');
    // A sentence the owner left alone still takes its number from the component.
    expect(drawn(bundle('en'), 'en', createElement(Sentence, { ar: 'أخرى {0}', en: 'Another {0}', values: [3] }))).toContain(
      'Another 3',
    );
  });

  it('leaves a pair it was not told about exactly as written', () => {
    const other = createElement(Sentence, { ar: 'الأسعار', en: 'Prices' });
    const html = drawn({ locale: 'ar', values: { [pairKey(AR, EN)]: WRITTEN.ar } }, 'ar', other);
    expect(html).toContain('الأسعار');
    expect(html).not.toContain(WRITTEN.ar);
  });
});
