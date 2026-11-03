/**
 * B4c — the service list says, in one glance, what each page is missing.
 *
 * The brief asked for marks on the rows a visitor would find thin — no summary, no hero
 * picture, no questions, no button that books — and asked for them *without* stopping anybody
 * from saving a draft. Both halves are load-bearing here:
 *
 *   - **the rule is the model's, not the screen's.** The four gaps are read through
 *     `serviceWarningsOfDoc`, the same function the meter and the public page agree with, so a
 *     badge cannot claim a row has no FAQ while the editor next door counts one.
 *   - **the read is the server's.** The list already pulls each item's document to name the row,
 *     so the marks come from that same page of rows — no second query per row, and no client
 *     that has to open every service to know which four need a picture.
 *   - **a mark is not a gate.** The publish chip keeps its place beside them, the row opens for
 *     editing exactly like a clean one, and only the services list is measured: a results row is
 *     a pair of photographs, and telling its owner to add a booking button would be a lie.
 *
 * No real clinic wording, no prices, no photographs: every fixture is obviously test copy.
 */
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));

import { catalogFor } from '../src/lib/console/messages';
import { ConsoleList, type ConsoleListProps } from '../src/components/console/ConsoleList';
import type { ContentAbilities } from '../src/lib/console/content-screen';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { publishRow } from '../src/lib/content/publish';
import { defaultViewFor } from '../src/lib/content/list-view';
import { createRow, saveDraft, type StoreResult } from '../src/lib/content/store';
import { listSummaries, type ListPage, type ListSummary } from '../src/lib/content/summary';
import { serviceWarningsOfDoc } from '../src/lib/content/service-doc';

const ar = catalogFor('ar');
const en = catalogFor('en');
const ALL = ['no_intro', 'no_hero_image', 'no_faq', 'no_primary_cta'] as const;

/* --------------------------------------------------------------- the rule itself --- */

describe('the four gaps are read off the document the row holds', () => {
  it('names the three a page cannot do without, and no more', () => {
    // The booking button is not among them: a row that never touched the switch gets the one
    // the page has always had, so telling its owner to add it would be advice about nothing.
    expect(serviceWarningsOfDoc({ name: { ar: 'تجربة', en: 'Test' } }, 'svc')).toEqual(['no_intro', 'no_hero_image', 'no_faq']);
    expect(serviceWarningsOfDoc({ name: { ar: 'تجربة', en: 'Test' }, ctaPrimary: 'none' }, 'svc')).toEqual([...ALL]);
  });

  it('says nothing about a page that holds the summary, the picture and the questions', () => {
    expect(
      serviceWarningsOfDoc(
        {
          name: { ar: 'تجربة', en: 'Test' },
          intro: { ar: 'جملة اختبار', en: 'A test line' },
          image: '/uploads/test.jpg',
          faqInline: [{ question: { ar: 'سؤال', en: 'A question' }, answer: { ar: 'جواب', en: 'An answer' } }],
        },
        'svc',
      ),
    ).toEqual([]);
  });

  it('counts a question the row names by id as well as one it typed', () => {
    const named = serviceWarningsOfDoc({ name: 'X', faq: ['faq-1'] }, 'svc');
    expect(named).not.toContain('no_faq');
  });

  it('takes a sentence in either language, because an old row is often written in one', () => {
    expect(serviceWarningsOfDoc({ name: 'X', intro: { ar: 'جملة عربية', en: '' } }, 'svc')).not.toContain('no_intro');
    expect(serviceWarningsOfDoc({ name: 'X', intro: { ar: '', en: 'An English line' } }, 'svc')).not.toContain('no_intro');
  });

  it('marks the booking button missing only when the row actually switched it off', () => {
    // An empty field means the button the page has always had, so saying "no booking button"
    // about it would send an owner to fix something that is not broken.
    expect(serviceWarningsOfDoc({ name: 'X' }, 'svc')).not.toContain('no_primary_cta');
    expect(serviceWarningsOfDoc({ name: 'X', ctaPrimary: 'none' }, 'svc')).toContain('no_primary_cta');
    expect(serviceWarningsOfDoc({ name: 'X', ctaPrimary: 'whatsapp' }, 'svc')).not.toContain('no_primary_cta');
  });

  it('names a picture by the path it holds, not by the field standing empty', () => {
    expect(serviceWarningsOfDoc({ name: 'X', image: '   ' }, 'svc')).toContain('no_hero_image');
    expect(serviceWarningsOfDoc({ name: 'X', image: '/uploads/a.jpg' }, 'svc')).not.toContain('no_hero_image');
  });
});

/* ---------------------------------------------------------------- the words shown --- */

describe('the marks are words an owner can act on', () => {
  it('names each of the four in both languages', () => {
    for (const gap of ALL) {
      const key = `content.service.warn.${gap}` as const;
      expect(ar[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
      expect(ar[key]).not.toBe(en[key]);
    }
    expect(en['content.service.warn.no_intro']).toMatch(/summary/i);
    expect(en['content.service.warn.no_hero_image']).toMatch(/hero/i);
    expect(en['content.service.warn.no_faq']).toMatch(/faq/i);
    expect(en['content.service.warn.no_primary_cta']).toMatch(/book/i);
  });
});

/* --------------------------------------------------------------------- the list read --- */

const run = randomUUID().slice(0, 8);
const keyOf = (name: string): string => `svcwarn-${run}-${name}`;
const actor = { id: randomUUID(), email: `svcwarn-${run}@example.invalid` };
const writable: ContentAbilities = {
  create: ['services', 'ar'],
  update: ['services', 'ar'],
  publish: ['services', 'ar'],
  remove: ['services', 'ar'],
};

function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

async function ensureList(listKey: string): Promise<void> {
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto('lists')
    .values({ id: randomUUID(), list_key: listKey, label: listKey, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: 0 })
    .execute();
}

/** Write a service row through the store, so the read is the one the console screen uses. */
async function seedService(name: string, doc: Record<string, unknown>): Promise<string> {
  const uid = keyOf(name);
  const created = unwrap(await createRow('list_item', { key: uid, listKey: 'services', actorId: actor.id }), `create ${name}`);
  unwrap(
    await saveDraft('list_item', {
      id: created.id,
      locale: 'en',
      fields: { data: { name: { ar: `تجربة ${run}`, en: `Test ${run} ${name}` }, ...doc }, position: 0, enabled: true },
      expectedVersion: created.version,
      actorId: actor.id,
    }),
    `save ${name}`,
  );
  unwrap(await publishRow('list_item', { id: created.id, locales: ['en'], actor }), `publish ${name}`);
  return uid;
}

async function seedResult(name: string): Promise<string> {
  const uid = keyOf(name);
  const created = unwrap(await createRow('list_item', { key: uid, listKey: 'results', actorId: actor.id }), `create ${name}`);
  unwrap(
    await saveDraft('list_item', {
      id: created.id,
      locale: 'en',
      fields: { data: { title: { ar: `نتيجة ${run}`, en: `Result ${run}` }, before: '/uploads/before.jpg' }, position: 0, enabled: true },
      expectedVersion: created.version,
      actorId: actor.id,
    }),
    `save ${name}`,
  );
  unwrap(await publishRow('list_item', { id: created.id, locales: ['en'], actor }), `publish ${name}`);
  return uid;
}

/** Only the rows this run wrote: the term matches the token in their names. */
const scoped = () => ({ ...defaultViewFor('list_item'), q: run });

beforeAll(async () => {
  assertTestDb();
  await ensureList('services');
  await ensureList('results');
  await seedService('bare', {});
  await seedService('ready', {
    intro: { ar: 'جملة اختبار', en: 'A test line' },
    image: `/uploads/${run}.jpg`,
    faqInline: [{ question: { ar: 'سؤال', en: 'A question' }, answer: { ar: 'جواب', en: 'An answer' } }],
  });
  await seedService('nocta', { ctaPrimary: 'none', intro: { ar: 'جملة', en: 'A line' }, image: '/uploads/x.jpg', faq: ['faq-1'] });
  await seedResult('pair');
});

afterAll(async () => {
  const ids = await db.selectFrom('list_items').select('id').where('uid', 'like', `svcwarn-${run}%`).execute();
  await db.deleteFrom('list_items').where('uid', 'like', `svcwarn-${run}%`).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids.map((row) => row.id)).execute();
  await destroyDb();
});

describe('the list read carries each service row by its gaps', () => {
  it('marks the thin row and leaves the written one alone', async () => {
    const page = await listSummaries('list_item', { view: scoped(), listKey: 'services', trash: false, locale: 'en' });
    const byKey = new Map(page.rows.map((row) => [row.key, row]));

    expect(byKey.get(keyOf('bare'))?.warnings).toEqual(['no_intro', 'no_hero_image', 'no_faq']);
    expect(byKey.get(keyOf('ready'))?.warnings).toEqual([]);
    // A row that switched its own booking button off is the only one told about it.
    expect(byKey.get(keyOf('nocta'))?.warnings).toEqual(['no_primary_cta']);
  });

  it('keeps the publish state beside the marks, because neither replaces the other', async () => {
    const page = await listSummaries('list_item', { view: scoped(), listKey: 'services', trash: false, locale: 'en' });
    const bare = page.rows.find((row) => row.key === keyOf('bare'));
    expect(bare?.status).toBe('published');
    expect(bare?.trashed).toBe(false);
  });

  it('measures no other list', async () => {
    // A result case is two photographs. Four service badges on its row would be advice about a
    // page it never claimed to be.
    const page = await listSummaries('list_item', { view: scoped(), listKey: 'results', trash: false, locale: 'en' });
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.warnings.length === 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------------- the screen --- */

function rowOf(warnings: string[], over: Partial<ListSummary> = {}): ListSummary {
  return {
    id: 'svc-row-1',
    kind: 'list_item',
    key: 'test-service',
    titleAr: 'خدمة اختبار',
    titleEn: 'Test service',
    status: 'published',
    version: 3,
    trashed: false,
    pendingAr: false,
    pendingEn: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: '2026-10-01T08:00:00.000Z',
    image: null,
    needsPhoto: false,
    warnings: warnings as ListSummary['warnings'],
    cells: {},
    ...over,
  };
}

function draw(rows: ListSummary[], mode: 'card' | 'table', labels: ReturnType<typeof catalogFor>): string {
  const page: ListPage = { rows, total: rows.length, page: 1, pages: 1, per: 25, columns: [], hasImages: false };
  const props: ConsoleListProps = {
    kind: 'list_item',
    scope: { listKey: 'services', locale: null, trash: false, focusKey: null },
    page,
    view: { ...defaultViewFor('list_item'), mode },
    sorts: ['title', 'key', 'status', 'updated', 'published'],
    filters: ['all', 'draft', 'published'],
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

describe('the list prints one mark per gap, in both drawings', () => {
  it('marks a thin row in Arabic, after the publish chip it still keeps', () => {
    for (const mode of ['table', 'card'] as const) {
      expect(badges(draw([rowOf(['no_intro', 'no_hero_image'])], mode, ar))).toEqual([
        ar['content.state.published'],
        ar['content.service.warn.no_intro'],
        ar['content.service.warn.no_hero_image'],
      ]);
    }
  });

  it('marks the same row in English', () => {
    expect(badges(draw([rowOf(['no_faq', 'no_primary_cta'])], 'table', en))).toEqual([
      'Published',
      en['content.service.warn.no_faq'],
      en['content.service.warn.no_primary_cta'],
    ]);
  });

  it('says nothing about a row that holds all four', () => {
    expect(badges(draw([rowOf([])], 'table', ar))).toEqual([ar['content.state.published']]);
    expect(badges(draw([rowOf([])], 'card', ar))).toEqual([ar['content.state.published']]);
  });

  it('marks each row on its own', () => {
    const html = badges(draw([rowOf(['no_faq']), rowOf([]), rowOf(['no_intro'])], 'table', ar));
    expect(html).toEqual([
      ar['content.state.published'],
      ar['content.service.warn.no_faq'],
      ar['content.state.published'],
      ar['content.state.published'],
      ar['content.service.warn.no_intro'],
    ]);
  });

  it('sends the marks with the row link, so opening the row is the way to fix them', () => {
    // Cards carry their marks inside the link itself; the table keeps them in the state column
    // beside the chip, which the ordering above already pins.
    const cards = draw([rowOf(['no_hero_image'])], 'card', ar);
    const link = cards.match(/<a[^>]*>[\s\S]*?<\/a>/);
    expect(link?.[0] ?? '').toContain(ar['content.state.published']);
    expect(link?.[0] ?? '').toContain(ar['content.service.warn.no_hero_image']);
  });

  it('leaves the row a row: no control on the list waits for a gap to close', () => {
    // The list's own buttons are bulk actions on checked rows; none of them is disabled by a
    // warning, because an incomplete draft is a draft an owner is still writing.
    const html = draw([rowOf([...ALL])], 'table', ar);
    expect(html).not.toMatch(/disabled="disabled"[^>]*aria-label="[^"]*(?:publish|save)/i);
    expect(html).toContain('<input');
  });
});
