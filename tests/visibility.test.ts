/**
 * A2: the box that hides a row says so, in both languages, and the list shows what it hides.
 *
 * The owner's words were *"working Move Up/Down and Visible/Hidden, persistence after reload,
 * effect on `/results` and Home … hiding never deletes data"*. The arrows were proven elsewhere
 * (`tests/list-order.test.ts`, and `tests/results-page.test.ts` for what the order reaches).
 * This file is the other half of that sentence, which no test covered: until now the control was
 * a box labelled "Enabled" whose only feedback was the word "Yes" or "No" — the same words an
 * offer's *On sale* box prints — and a hidden row in the list printed exactly the chips a visible
 * one did. An owner who hid a case could not tell, from the screen, whether the site was showing
 * it or not.
 *
 *   - **the words name visibility**, not a flag: the label, the note under it, the list chip and
 *     the filter chip all say the same thing in Arabic and in English, and the note says out
 *     loud that hiding deletes nothing — the claim the brief asks for, in the place a person
 *     reads it just before they press.
 *   - **a hidden row is marked**, in the table a desktop gets and the cards a phone gets, beside
 *     the publish chip rather than instead of it: a row can be published *and* hidden, and the
 *     two questions are different.
 *   - **a row that says nothing prints nothing**: the chip only appears when the column is
 *     actually off, so a kind without a visibility column keeps its chips unchanged.
 *   - **the other flag keeps its yes/no**, because *On sale* is not about hiding anything.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));

import { ConsoleList, type ConsoleListProps } from '../src/components/console/ConsoleList';
import { catalogFor } from '../src/lib/console/messages';
import { defaultViewFor, filtersFor, sortsFor } from '../src/lib/content/list-view';
import type { ListPage, ListSummary } from '../src/lib/content/summary';
import type { ContentAbilities } from '../src/lib/console/content-screen';

const ar = catalogFor('ar');
const en = catalogFor('en');

/* ------------------------------------------------------------------- the words --- */

describe('the visibility control is named after what it does', () => {
  it('calls the box by what a visitor sees, in both languages', () => {
    expect(ar['content.field.enabled']).toBe('تظهر للزوار');
    expect(en['content.field.enabled']).toBe('Visible to visitors');
  });

  it('says in the note what hiding does, and what it does not do', () => {
    expect(ar['content.visibility.off']).toContain('لا يراها الزوار');
    expect(ar['content.visibility.off']).toContain('لا يحذف');
    expect(en['content.visibility.off']).toMatch(/do not see/i);
    expect(en['content.visibility.off']).toMatch(/deletes nothing/i);
    expect(ar['content.visibility.on']).toContain('يراها الزوار');
    expect(en['content.visibility.on']).toMatch(/visitors see/i);
  });

  it('uses one word for a hidden row everywhere the screen says it', () => {
    // The filter chip and the row chip are the same claim seen from the two directions: the
    // list of hidden rows, and the mark on one row. Two words for one state is how a person
    // ends up looking for a control that was in front of them.
    expect(ar['content.state.hidden']).toBe(ar['content.filter.off']);
    expect(en['content.state.hidden']).toBe(en['content.filter.off']);
    expect(en['content.state.hidden']).toBe('Hidden');
  });

  it('keeps yes/no for a flag that is not about being seen', () => {
    expect(ar['content.flag.on']).toBe('نعم');
    expect(en['content.flag.off']).toBe('No');
  });

  it('reaches the editor through the visibility wording, not the yes/no one', () => {
    // The flag row is one renderer for every column flag, so the branch that picks the words is
    // the whole behaviour: `enabled` reads as visibility and anything else keeps its yes/no.
    const editor = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');
    expect(editor).toContain("name === 'enabled' ? (value ? labels['content.visibility.on'] : labels['content.visibility.off'])");
    expect(editor).toContain("labels['content.flag.on']");
  });
});

/* -------------------------------------------------------------- the list chip --- */

/** A row of the results list, as the console receives it. */
function row(index: number, enabled: boolean | undefined): ListSummary {
  return {
    id: `results-r${index}`,
    kind: 'list_item',
    key: `case-${index}`,
    titleAr: `نتيجة ${index}`,
    titleEn: `Result ${index}`,
    status: 'published',
    version: 1,
    trashed: false,
    pendingAr: false,
    pendingEn: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: '2026-10-01T08:00:00.000Z',
    image: null,
    needsPhoto: false,
    cells: enabled === undefined ? { area_ar: 'الوجه' } : { area_ar: 'الوجه', enabled },
  };
}

const writable: ContentAbilities = {
  create: ['results', 'ar'],
  update: ['results', 'ar'],
  publish: ['results', 'ar'],
  remove: ['results', 'ar'],
};

function draw(rows: ListSummary[], mode: 'card' | 'table', labels: ReturnType<typeof catalogFor>): string {
  const page: ListPage = { rows, total: rows.length, page: 1, pages: 1, per: 25, columns: ['area_ar'], hasImages: false };
  const props: ConsoleListProps = {
    kind: 'list_item',
    scope: { listKey: 'results', locale: null, trash: false, focusKey: null },
    page,
    view: { ...defaultViewFor('list_item'), mode },
    sorts: sortsFor('list_item'),
    filters: filtersFor('list_item', false),
    locale: 'ar',
    labels,
    abilities: writable,
    onScopeChange: () => undefined,
  };
  return renderToStaticMarkup(createElement(ConsoleList, props));
}

/** The words of every badge a page of rows prints, in the order they appear. */
function badges(html: string): string[] {
  return [...html.matchAll(/<span class="console-badge"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]!);
}

describe('the list marks the rows the site is not showing', () => {
  it('prints the chip in the table and in the cards, beside the publish state', () => {
    for (const mode of ['table', 'card'] as const) {
      expect(badges(draw([row(1, false)], mode, ar))).toEqual([ar['content.state.published'], ar['content.state.hidden']]);
    }
    expect(badges(draw([row(1, false)], 'table', en))).toEqual([en['content.state.published'], 'Hidden']);
  });

  it('says nothing about a visible row', () => {
    expect(badges(draw([row(1, true)], 'table', ar))).toEqual([ar['content.state.published']]);
    expect(badges(draw([row(1, true)], 'card', ar))).toEqual([ar['content.state.published']]);
  });

  it('marks each row on its own, not the page', () => {
    const html = draw([row(1, false), row(2, true), row(3, false)], 'table', ar);
    expect(badges(html)).toEqual([
      ar['content.state.published'],
      ar['content.state.hidden'],
      ar['content.state.published'],
      ar['content.state.published'],
      ar['content.state.hidden'],
    ]);
  });

  it('leaves a kind with no visibility column alone', () => {
    // An article's cells hold no `enabled` at all. Printing "Hidden" there would be a claim
    // about a state the row does not have.
    const html = draw([row(1, undefined)], 'table', ar);
    expect(badges(html)).toEqual([ar['content.state.published']]);
  });

  it('offers the filter that lists them, named with the same word', () => {
    expect(filtersFor('list_item', false)).toContain('off');
    // Drawn over a visible row, so the only place this word can come from is the chip.
    expect(draw([row(1, true)], 'table', ar)).toContain(ar['content.filter.off']);
  });
});
