/**
 * BK-13.3 — the list's query string, with no database in sight.
 *
 * The URL is the only copy of a filter that survives a refresh, a back button and a link
 * pasted into chat, and a saved view stores exactly this string. So the property worth
 * proving is not "the parser handles a typo" but **round-trip**: for every kind, for every
 * order and chip and mode that kind actually offers, writing the view out and reading it
 * back returns the same view. A default that belonged to the module rather than the kind
 * broke that (an offer asked for `?sort=position` and came back descending), which is why
 * the loop below walks each kind's own terms instead of a shared list.
 *
 * The rest is what the browser can type: unknown terms must fall back rather than throw,
 * and a term must never reach SQL as an identifier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_KINDS } from '../src/lib/content/kinds';
import {
  LIST_DIRS,
  LIST_MODES,
  LIST_PER_PAGES,
  canonicalViewQuery,
  defaultViewFor,
  filtersFor,
  listViewParams,
  listViewQuery,
  listScopeParams,
  naturalDir,
  parseListScope,
  parseListView,
  sortsFor,
  withPage,
  withSort,
  withView,
  writeScopeQuery,
  type ListScope,
  type ListView,
} from '../src/lib/content/list-view';

const scope = (patch: Partial<ListScope> = {}): ListScope => ({ listKey: null, locale: null, trash: false, focusKey: null, ...patch });

/** The terms the list itself offers — the same sets the server hands the browser. */
function viewsFor(kind: (typeof CONTENT_KINDS)[number]): ListView[] {
  const base = defaultViewFor(kind);
  const out: ListView[] = [base];
  for (const mode of LIST_MODES) out.push({ ...base, mode });
  for (const sort of sortsFor(kind)) {
    for (const dir of LIST_DIRS) out.push({ ...base, sort, dir });
  }
  for (const filter of filtersFor(kind)) out.push({ ...base, filter });
  for (const per of LIST_PER_PAGES) out.push({ ...base, per });
  for (const page of [1, 2, 40]) out.push({ ...base, page });
  out.push({ ...base, q: 'أسعار' }, { ...base, q: 'a & b = c' }, { ...base, q: 'trailing ' });
  return out;
}

describe('a list view round-trips through its own query string', () => {
  for (const kind of CONTENT_KINDS) {
    it(`${kind}: every view it can draw comes back unchanged`, () => {
      for (const view of viewsFor(kind)) {
        const params = listViewParams(view, kind);
        expect(parseListView(params, kind)).toEqual({ ...view, q: view.q.trim().slice(0, 80) });
      }
    });

    it(`${kind}: the untouched default writes no terms at all`, () => {
      expect(listViewParams(defaultViewFor(kind), kind).toString()).toBe('');
      expect(listViewQuery(defaultViewFor(kind), scope(), kind)).toBe('');
      // …so the address bar of a screen nobody has touched stays as clean as the nav link.
      expect(canonicalViewQuery(new URLSearchParams(''), kind)).toBe('');
    });

    it(`${kind}: a canonical string is stable, which is what a saved view relies on`, () => {
      const once = canonicalViewQuery(new URLSearchParams('sort=title&dir=desc&filter=pending&per=10&page=3&q=%D9%81%D8%B1%D9%88%D8%B9'), kind);
      expect(canonicalViewQuery(new URLSearchParams(once.replace(/^\?/, '')), kind)).toBe(once);
    });
  }

  it('a search term survives spaces, an ampersand and Arabic', () => {
    for (const kind of CONTENT_KINDS) {
      const term = 'price & القائمة 3';
      expect(parseListView(listViewParams({ ...defaultViewFor(kind), q: term }, kind), kind).q).toBe(term);
    }
  });
});

describe('the defaults belong to the kind, not to the module', () => {
  it('an offer and a list start in their authored order, an article in time', () => {
    expect(defaultViewFor('offer').sort).toBe('position');
    expect(defaultViewFor('list_item').sort).toBe('position');
    expect(defaultViewFor('page').sort).toBe('key');
    expect(defaultViewFor('article').sort).toBe('updated');
    // Time reads newest first; a name or an order number reads up.
    expect(naturalDir('updated')).toBe('desc');
    expect(naturalDir('published')).toBe('desc');
    expect(naturalDir('position')).toBe('asc');
  });

  it('the defect that made them per kind: an offer asked for its own default keeps it', () => {
    const view = parseListView(new URLSearchParams('sort=position'), 'offer');
    expect(view).toEqual({ ...defaultViewFor('offer'), dir: 'asc' });
    expect(listViewParams(view, 'offer').toString()).toBe('');
  });

  it('each kind only offers what its columns can answer', () => {
    expect(sortsFor('article')).not.toContain('position');
    expect(sortsFor('offer')).toContain('position');
    expect(sortsFor('list_item')).not.toContain('published');
    expect(sortsFor('page')).toEqual(['title', 'key', 'status', 'updated', 'published']);
    expect(filtersFor('article')).not.toContain('off');
    expect(filtersFor('page')).toContain('off');
    expect(filtersFor('list_item')).toContain('changed');
  });
});

describe('a query string the browser typed by hand falls back, it never throws', () => {
  it('an order or chip the kind does not have is dropped, not obeyed', () => {
    expect(parseListView(new URLSearchParams('sort=position'), 'article').sort).toBe('updated');
    expect(parseListView(new URLSearchParams('filter=off'), 'article').filter).toBe('all');
    expect(parseListView(new URLSearchParams('filter=changed'), 'article').filter).toBe('all');
    expect(parseListView(new URLSearchParams('sort=published'), 'list_item').sort).toBe('position');
  });

  it('Trash is another result set, so a state chip in it falls back to All', () => {
    // Measured: toggling Trash from a Drafts view carried `filter=draft` into a list whose
    // every row is trashed, and the screen went blank over two rows that were still there.
    expect(filtersFor('article', true)).toEqual(['all']);
    expect(filtersFor('list_item', true)).toEqual(['all']);
    expect(parseListView(new URLSearchParams('trash=1&filter=draft'), 'article').filter).toBe('all');
    const query = listViewQuery({ ...defaultViewFor('article'), filter: 'draft' }, scope({ trash: true }), 'article');
    expect(query).toBe('?trash=1');
    expect(parseListView(new URLSearchParams(query.slice(1)), 'article')).toEqual(defaultViewFor('article'));
  });

  it('a direction is kept even on its own, because that is what flipping the default column writes', () => {
    // The default view is `updated, desc`; one click on that column drops `sort` (it is
    // the kind's own default) and leaves the direction as the only term in the bar.
    const flipped = parseListView(new URLSearchParams('dir=asc'), 'article');
    expect(flipped).toEqual({ ...defaultViewFor('article'), dir: 'asc' });
    expect(listViewParams(flipped, 'article').toString()).toBe('dir=asc');
    expect(parseListView(new URLSearchParams('sort=title&dir=asc'), 'article').dir).toBe('asc');
    expect(parseListView(new URLSearchParams('dir=sideways'), 'article').dir).toBe('desc');
  });

  it('a number outside its set or a word instead of one is the default', () => {
    for (const query of ['per=7', 'per=0', 'per=abc', 'per=-25', 'per=1000']) {
      expect(parseListView(new URLSearchParams(query), 'article').per).toBe(25);
    }
    for (const query of ['page=0', 'page=-3', 'page=x', 'page=1.5']) {
      expect(parseListView(new URLSearchParams(query), 'article').page).toBe(1);
    }
    expect(parseListView(new URLSearchParams('per=50&page=4'), 'article').per).toBe(50);
  });

  it('a term is trimmed and capped, because it becomes a LIKE pattern', () => {
    expect(parseListView(new URLSearchParams('q=%20%20%D9%81%D8%B1%D9%88%D8%B9%20'), 'article').q).toBe('فروع');
    const long = parseListView(new URLSearchParams(`q=${'ا'.repeat(300)}`), 'article').q;
    expect(long).toHaveLength(80);
  });

  it('nothing from a hand-typed query survives into the string the server would rebuild', () => {
    const hostile = new URLSearchParams("mode=table;drop&filter=%27&sort=(SELECT&dir=sideways&page=2;--");
    // Every term is either unknown or malformed, so the whole line collapses to the
    // default view — and a value that cannot be read is never sent on as SQL.
    expect(parseListView(hostile, 'article')).toEqual(defaultViewFor('article'));
    expect(listViewParams(parseListView(hostile, 'article'), 'article').toString()).toBe('');
  });

  it('the scope keeps its own terms, verbatim and separate from the view', () => {
    const parsed = parseListScope(new URLSearchParams('list=branches&locale=ar&trash=1&key=xyz'));
    expect(parsed).toEqual({ listKey: 'branches', locale: 'ar', trash: true, focusKey: 'xyz' });
    expect(parseListScope(new URLSearchParams('trash=yes')).trash).toBe(false);
    expect(listScopeParams(parsed).toString()).toBe('list=branches&locale=ar&trash=1&key=xyz');
  });

  it('a saved view stores the list, not the row someone happened to have open', () => {
    expect(canonicalViewQuery(new URLSearchParams('list=branches&key=a-row&q=test'), 'list_item')).toBe('?list=branches&q=test');
  });

  it('the scope is written before the view, so the URL reads like the navigation', () => {
    const line = listViewQuery({ ...defaultViewFor('list_item'), filter: 'pending' }, scope({ listKey: 'faqs' }), 'list_item');
    expect(line).toBe('?list=faqs&filter=pending');
    // Trash keeps its place at the front and drops the chip behind it.
    const inTrash = listViewQuery({ ...defaultViewFor('list_item'), filter: 'pending' }, scope({ listKey: 'faqs', trash: true }), 'list_item');
    expect(inTrash).toBe('?list=faqs&trash=1');
  });
});

describe('the controls change one term and reset the page', () => {
  const view = { ...defaultViewFor('article'), page: 3, filter: 'pending' as const };

  it('clicking the sorted column flips it; a new column starts in its natural direction', () => {
    expect(withSort(view, 'updated')).toEqual({ ...view, dir: 'asc', page: 1 });
    expect(withSort({ ...view, dir: 'asc' }, 'updated')).toEqual({ ...view, dir: 'desc', page: 1 });
    expect(withSort(view, 'title')).toEqual({ ...view, sort: 'title', dir: 'asc', page: 1 });
  });

  it('any other term changed also leaves page one', () => {
    expect(withView(view, { filter: 'draft' })).toEqual({ ...view, filter: 'draft', page: 1 });
    expect(withView(view, { q: 'x' }).page).toBe(1);
    expect(withView(view, { page: 7 }).page).toBe(7);
    expect(withPage(view, 0).page).toBe(1);
  });
});

describe('the screen writes the address bar from that one string', () => {
  // A "?" written twice is not cosmetic. `?locale=en` becomes a parameter named
  // "?locale", which the guard never reads, so every reload a chip triggers drops the
  // scope of the screen it came from — a list would come back asking for no list.
  // The component therefore concatenates what `listViewQuery` returns and adds nothing.
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleList.tsx'), 'utf8');

  it('puts no second question mark in front of the query line', () => {
    expect(source, 'the query line already carries its own ?').not.toMatch(/[?\x27"`]\?\$\{/);
  });

  it('so the scope survives the trip to the api path', () => {
    const line = listViewQuery(defaultViewFor('article'), scope({ locale: 'ar', trash: true }), 'article');
    const url = new URL(`http://console.local/api/console/content/article${line}`);
    expect(url.search).toBe(line);
    expect(url.searchParams.get('locale')).toBe('ar');
    expect(url.searchParams.get('trash')).toBe('1');
  });
});

describe('a write names its scope with one term, spelled in one place (BK-13.5)', () => {
  const components = ['ConsoleList', 'ConsoleEditor', 'ContentWorkspace'].map((name) => [
    name,
    readFileSync(join(process.cwd(), 'src', 'components', 'console', `${name}.tsx`), 'utf8'),
  ]);

  it('chooses the list when there is one and the language when there is not', () => {
    expect(writeScopeQuery({ listKey: 'branches', locale: 'ar' })).toBe('?list=branches');
    expect(writeScopeQuery({ listKey: null, locale: 'ar' })).toBe('?locale=ar');
    // An unnamed list is not a scope: the language is what the guard can actually read.
    expect(writeScopeQuery({ listKey: '', locale: 'en' })).toBe('?locale=en');
  });

  it('sends no term at all rather than a scope nobody named', () => {
    expect(writeScopeQuery({ listKey: null, locale: null })).toBe('');
  });

  it('encodes a key that needs it, because a raw & would end the term early', () => {
    expect(writeScopeQuery({ listKey: 'a b&c', locale: 'ar' })).toBe('?list=a%20b%26c');
  });

  it('leaves no component to invent the either/or', () => {
    // Three spellings of one rule is three chances to send both terms, and a request that
    // names a list *and* a locale is judged against whichever the guard reads first.
    for (const [name, source] of components) {
      expect(source, `${name} names a list`).not.toMatch(/list=\$\{/);
      expect(source, `${name} names a locale`).not.toMatch(/locale=\$\{/);
    }
  });
});
