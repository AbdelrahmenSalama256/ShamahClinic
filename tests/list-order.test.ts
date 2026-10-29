/**
 * #264 / review item 2: an authored order is moved with buttons, not typed into a box.
 *
 * The owner's words were *"position is still a bare number box. Add up/down buttons …
 * Keep it keyboard-accessible and working in RTL. Remove the 'Order' number box from the
 * editor, and renumber positions when saving so they never clash."* A number box asks a
 * person to know every other row's number before they can pick one, and two rows that
 * claim the same number trade places between two page loads — so the column now has one
 * writer (`src/lib/content/order.ts`), reached only through `POST …/<id>/move`.
 *
 * `tests/content.test.ts` proves the route. This file proves the screen, which no test
 * in that file can see:
 *
 *   - **the arrows are drawn**, one pair per row, each naming the row it moves in its own
 *     accessible label — the only way a keyboard or screen-reader user learns which of
 *     six identical icon buttons is theirs.
 *   - **the ends are closed**: the first row's *up* and the last row's *down* are drawn
 *     disabled, so the control says what it cannot do instead of failing after a press.
 *   - **the number printed is the row's place**, dense from 1, not the raw column — a
 *     list the WordPress import left every row of at `0` would otherwise read as six
 *     identical zeros, which is the number that caused the defect.
 *   - **they appear only where moving means something**: the whole list in its own order,
 *     not the Trash, not under a filter or a search, and never for a role that cannot
 *     write the scope. Elsewhere the screen says how to get the arrows back.
 *   - **the editor offers no box**, and a save cannot post a number, so an open form can
 *     never undo a colleague's move.
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
import { defaultViewFor, filtersFor, sortsFor, withView, type ListScope } from '../src/lib/content/list-view';
import type { ListPage, ListSummary } from '../src/lib/content/summary';
import type { ContentAbilities } from '../src/lib/console/content-screen';
import { kindSpec, type ContentKind } from '../src/lib/content/kinds';
import { fieldsFromForm, formOf } from '../src/lib/console/editor-form';
import type { ContentRow, FieldView } from '../src/lib/content/store';

const labels = catalogFor('ar');
const editorSource = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');

/** One row of a list, as the console receives it. */
function summary(kind: ContentKind, index: number, cells: Record<string, string | number | boolean | null>): ListSummary {
  return {
    id: `${kind}-r${index}`,
    kind,
    key: `row-${index}`,
    titleAr: `سطر ${index}`,
    titleEn: `Row ${index}`,
    status: 'published',
    version: 1,
    trashed: false,
    pendingAr: false,
    pendingEn: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: '2026-10-01T08:00:00.000Z',
    image: null,
    needsPhoto: false,
    cells,
  };
}

function page(kind: ContentKind, rows: ListSummary[], over: Partial<ListPage> = {}): ListPage {
  const spec = kindSpec(kind);
  return {
    rows,
    total: rows.length,
    page: 1,
    pages: 1,
    per: 25,
    columns: spec.table === 'list_items' ? ['question_ar'] : [...spec.number.map((f) => f.name), ...spec.flag.map((f) => f.name)],
    hasImages: false,
    ...over,
  };
}

const writable: ContentAbilities = { create: ['faq', 'ar'], update: ['faq', 'ar'], publish: ['faq', 'ar'], remove: ['faq', 'ar'] };
const readOnly: ContentAbilities = { create: [], update: [], publish: [], remove: [] };

const listScope: ListScope = { listKey: 'faq', locale: null, trash: false, focusKey: null };
const offerScope: ListScope = { listKey: null, locale: 'ar', trash: false, focusKey: null };

/** The screen, with the props the workspace passes it. */
function draw(props: Partial<ConsoleListProps> & { kind: ContentKind }): string {
  const { kind, ...rest } = props;
  const view = props.view ?? defaultViewFor(kind);
  const all: ConsoleListProps = {
    kind,
    scope: kind === 'list_item' ? listScope : offerScope,
    page: page(kind, []),
    view,
    sorts: sortsFor(kind),
    filters: filtersFor(kind, Boolean(props.scope?.trash)),
    locale: 'ar',
    labels,
    abilities: writable,
    onScopeChange: () => undefined,
    ...rest,
  };
  return renderToStaticMarkup(createElement(ConsoleList, all));
}

/** Every `<button>` opening tag whose label starts with this phrase. */
function buttons(html: string, label: string): string[] {
  return html.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`, 'g')) ?? [];
}

const up = (html: string): string[] => buttons(html, labels['content.order.up']);
const down = (html: string): string[] => buttons(html, labels['content.order.down']);

describe('a list moves its rows with arrows', () => {
  const three = ['a', 'b', 'c'].map((name, index) => summary('list_item', index + 1, { position: 0, question_ar: `سؤال ${name}` }));

  it('draws one labelled pair per row, and closes the two ends', () => {
    const html = draw({ kind: 'list_item', page: page('list_item', three) });
    expect(up(html)).toHaveLength(3);
    expect(down(html)).toHaveLength(3);
    // Each button names the row it moves: six identical icons in one column are otherwise
    // indistinguishable to the two people this control has to serve — a keyboard and a
    // screen reader.
    expect(up(html)[0]).toContain('aria-label="تحريك لأعلى: سطر 1"');
    expect(down(html)[2]).toContain('aria-label="تحريك لأسفل: سطر 3"');

    // The ends have nothing beyond them, so the press is drawn as unavailable rather than
    // asked for and refused.
    expect(up(html)[0]).toContain('disabled');
    expect(down(html)[0]).not.toContain('disabled');
    expect(down(html)[2]).toContain('disabled');
    expect(up(html)[2]).not.toContain('disabled');
  });

  it('prints each row’s place in the list, not the raw number behind it', () => {
    // Every one of these rows holds `0`, which is exactly what the WordPress import left
    // behind. Printed as stored, the column is six identical zeros and a person learns
    // nothing; the list is read top to bottom, so the screen counts them.
    const html = draw({ kind: 'list_item', page: page('list_item', three) });
    const places = ['سطر 1', 'سطر 2', 'سطر 3'].map((title) => {
      const row = html.slice(html.indexOf(title), html.indexOf(title) + 900);
      return (row.match(/<bdi>(\d+)<\/bdi>/)?.[1] ?? '') as string;
    });
    expect(places).toEqual(['1', '2', '3']);

    // Page two continues the count, so a row never changes number because it moved page.
    const second = draw({ kind: 'list_item', page: page('list_item', three.slice(0, 2), { page: 2, per: 2, total: 5 }) });
    expect(up(second)[0]).not.toContain('disabled');
    expect(second).toContain('<bdi>3</bdi>');
  });

  it('offers the arrows on an offer list too, on the locale its screen names', () => {
    const offers = ['one', 'two'].map((name, index) => summary('offer', index + 1, { position: index + 1, price: 100 + index, enabled: true }));
    const html = draw({ kind: 'offer', page: page('offer', offers) });
    expect(up(html)).toHaveLength(2);
    expect(down(html)).toHaveLength(2);
  });

  it('draws them in the card list a phone gets, not only in the table', () => {
    const html = draw({ kind: 'list_item', view: withView(defaultViewFor('list_item'), { mode: 'card' }), page: page('list_item', three) });
    expect(up(html)).toHaveLength(3);
    // Cards hold no `<table>`, so the same cell has to reach the same rows there.
    expect(html).not.toContain('<table');
  });

  it('stays out of the way when the rows on the screen are not the whole order', () => {
    // Under a search or a filter the row above may be several places away in the real
    // order, so a press would move this one past rows the person cannot see.
    const searched = draw({ kind: 'list_item', view: withView(defaultViewFor('list_item'), { q: 'سؤال a' }), page: page('list_item', three.slice(0, 2), { total: 5 }) });
    expect(up(searched)).toHaveLength(0);
    expect(searched).toContain(labels['content.order.locked']);
    expect(searched).toContain(labels['content.order.show']);

    const sorted = draw({ kind: 'list_item', view: withView(defaultViewFor('list_item'), { sort: 'title' }), page: page('list_item', three) });
    expect(up(sorted)).toHaveLength(0);
    // …and there the column prints what it holds, because the rank of a title-sorted page
    // is not an order anyone authored.
    expect(sorted).toContain(labels['content.order.locked']);

    const trashed = draw({ kind: 'list_item', scope: { ...listScope, trash: true }, view: withView(defaultViewFor('list_item'), { filter: 'all' }), page: page('list_item', three) });
    expect(up(trashed)).toHaveLength(0);

    // One row has no order to change.
    const single = draw({ kind: 'list_item', page: page('list_item', [three[0]!]) });
    expect(up(single)).toHaveLength(0);
  });

  it('draws no control the caller has no grant to press', () => {
    const html = draw({ kind: 'list_item', abilities: readOnly, page: page('list_item', three) });
    expect(up(html)).toHaveLength(0);
    // A person who cannot reorder is not told how to, and is not left wondering where the
    // buttons went: the number still reads as their list's order.
    expect(html).not.toContain(labels['content.order.show']);
    expect(html).toContain('<bdi>1</bdi>');
  });

  it('shows nothing of the sort on a kind that has no order', () => {
    const articles = [1, 2].map((n) => summary('article', n, {}));
    const html = draw({ kind: 'article', page: page('article', articles) });
    expect(up(html)).toHaveLength(0);
    expect(html).not.toContain(labels['content.order.locked']);
  });
});

describe('the order reaches the screen through one route', () => {
  it('presses the move route with a direction and the scope the list is showing', () => {
    // The written form of the address is what the guard reads its permission from, so the
    // screen spells it through the same helper every other console write uses.
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleList.tsx'), 'utf8');
    expect(source).toContain("`${api}/${row.id}/move${scopeQuery}`");
    expect(source).toContain("'POST', { direction }");
    expect(source).toContain('await load(query)');
  });

  it('takes no number from the editor, and posts none', () => {
    const spec = kindSpec('list_item');
    const fields: Record<string, FieldView> = {};
    for (const text of spec.text) fields[text.name] = { kind: 'text', value: '', pending: false, immediate: false, multiline: false, max: text.max ?? 0 };
    for (const number of spec.number) fields[number.name] = { kind: 'number', value: 4, pending: false, immediate: false, multiline: false, max: 0 };
    for (const flag of spec.flag) fields[flag.name] = { kind: 'flag', value: true, pending: false, immediate: false, multiline: false, max: 0 };
    fields.data = { kind: 'json', draftJson: { question_ar: 'سؤال؟', question_en: 'A question?' }, pending: false, immediate: false, multiline: false, max: 0 };
    const row: ContentRow = {
      id: 'r1',
      kind: 'list_item',
      key: 'q1',
      listKey: 'faq',
      status: 'draft',
      version: 1,
      trashed: false,
      updatedAt: '2026-10-01T08:00:00.000Z',
      publishedAt: null,
      pendingLocales: [],
      fields,
    };

    const form = formOf(row, 'ar');
    expect(form.position).toBe('4');
    const posted = fieldsFromForm(row, form);
    // The row still carries the column — the list reads it — but a save never writes it, so
    // a form left open across a colleague's move cannot put the row back where it found it.
    expect(posted.fields).not.toHaveProperty('position');
    expect(posted.fields.data).toMatchObject({ question_ar: 'سؤال؟' });

    // …and the box itself is not drawn.
    expect(editorSource).toContain("name === 'position' && isOrderedKind(row.kind)");
    const listSource = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleList.tsx'), 'utf8');
    expect(listSource).toContain("orderable = sorts.includes('position')");
  });
});
