/**
 * S1 — the first proof asked for: the phone number an owner types in Settings is the
 * number the site dials, on every screen with a call or WhatsApp control, with no rebuild.
 *
 * The cause this tests is fixed: `getSettings` already answered from the saved rows, but no
 * public component read it — the header, the footer, the contact page, the call-to-action
 * band and the floating buttons each imported `clinicData`, built from `config/site.ts` at
 * module load. So these tests drive the real save (a PATCH through the guarded settings
 * handler, with a real session) and then render the five screens, rather than asserting a
 * number was passed to a prop.
 *
 * What a node render cannot show is the browser's own cache, so revalidation is asserted at
 * its source: the handler must call `revalidatePath` for the layout and the sitemap. That it
 * reaches a visitor's tab is the browser check left for the owner.
 *
 * Rows touched: `site.phone` and `site.whatsapp` in `shamah_cms_test`, each restored to
 * whatever it held before the run.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { clinicData } from '../src/data/clinic';
import type { ClinicWords } from '../src/lib/content/site';
import { BRAND_DEFAULTS } from '../src/lib/content/brand-shape';
import { PROMO_DEFAULTS } from '../src/lib/content/promo-shape';
import { getClinicWords, getBranchList } from '../src/lib/content/site';
import { getBanner } from '../src/lib/content/banners';
import { organizationJsonLd } from '../src/lib/jsonld';
import { settingsHandler } from '../src/lib/content/api';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { loginHandler } from '../src/lib/auth/login';
import { syncRoles } from '../src/lib/auth/roles';
import { assignRole, createUser } from '../src/lib/auth/users';
import { getMergedTreatments } from '../src/lib/wp/treatments';
import type { NavItem } from '../src/data/nav';

const PHONE_SAVED = '+20 100 555 0143';
const WHATSAPP_SAVED = '+20 100 555 0999';
const WA_DIGITS = '201005550999';
const PHONE_DIALLED = PHONE_SAVED.replace(/\s/g, '');

// `revalidateSite()` swallows the throw a cache-less render produces, so the mock is what
// lets a test see the invalidation actually happened rather than being silently eaten. The
// real module cannot be loaded here — it is a compiler placeholder outside `next build` —
// and `revalidatePath` is the only export of it this graph imports.
const revalidations: unknown[][] = [];
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => {
    revalidations.push(args);
  },
}));

// `next/root-params` is the same kind of placeholder: `next build` rewrites it, and a node
// render has no root parameters. The structured-data read asks which language it is writing
// for, so the mock answers the default the route itself would give.
vi.mock('next/root-params', () => ({ lang: async () => 'ar' }));

// `useLanguage()` reads the locale off the path, and the header needs a router. The mock is
// what lets a node render of these client components work at all.
let mockPath = '/en/contact';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => undefined,
  redirect: () => undefined,
}));

const { LanguageProvider } = await import('../src/context/LanguageContext');
const { ThemeProvider } = await import('../src/context/ThemeContext');
const { BookingProvider } = await import('../src/context/BookingContext');
const { ClinicProvider } = await import('../src/context/ClinicContext');
const { Navbar } = await import('../src/components/layout/Navbar');
const { Footer } = await import('../src/components/layout/Footer');
const { CtaBand } = await import('../src/components/ui/CtaBand');
const { FloatingActions } = await import('../src/components/ui/FloatingActions');
const { ContactClient } = await import('../src/components/pages/ContactClient');

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-s1-2026';
const email = `s1-${run}@example.invalid`;
const userIds: string[] = [];
const prior = new Map<string, string | null>();
const contactProps = {} as {
  branches: Awaited<ReturnType<typeof getBranchList>>;
  services: Awaited<ReturnType<typeof getMergedTreatments>>;
  banner: Awaited<ReturnType<typeof getBanner>>;
};
let session = { token: '', csrf: '' };

/** The header menu, and one branch of its own — a branch phone is data, not the site setting. */
const nav: NavItem[] = [{ href: '/contact', label: { ar: 'تواصلي', en: 'Contact' } }];
const branchPhone = '+20 2 2575 0000';
const branchLite = [{ id: `s1-${run}`, name: { ar: 'فرع', en: 'Branch' }, address: { ar: 'عنوان', en: 'Address' }, phone: branchPhone }];

const words: ClinicWords = { phone: PHONE_SAVED, whatsapp: WHATSAPP_SAVED, whatsappUrl: `https://wa.me/${WA_DIGITS}`, brand: BRAND_DEFAULTS, promo: PROMO_DEFAULTS };

function readSetting(key: string): Promise<string | null> {
  return db
    .selectFrom('settings')
    // The document as it is stored, not as the driver parses it: a restore has to write
    // valid JSON back, and a phone number that came home as a bare string is not valid JSON.
    .select(sql<string>`CAST(value AS CHAR)`.as('json_text'))
    .where('group_name', '=', 'site')
    .where('setting_key', '=', key)
    .executeTakeFirst()
    .then((row) => (row ? row.json_text : null));
}

async function restoreSettings(): Promise<void> {
  for (const [key, value] of prior) {
    if (value === null) {
      await db.deleteFrom('settings').where('group_name', '=', 'site').where('setting_key', '=', key).execute();
    } else {
      await db
        .updateTable('settings')
        .set({ value })
        .where('group_name', '=', 'site')
        .where('setting_key', '=', key)
        .execute();
    }
  }
}

/**
 * The tree a public page really builds: the site layout's providers, then the component.
 * `null` words leave the `ClinicProvider` off, which is how a control rendered above the
 * layout — or a page whose database is unreachable — still reaches a real number.
 *
 * React 19 types a provider's `children` as a required prop, and `createElement` will not
 * accept the third argument in its place, while the lint rule wants exactly the opposite.
 * The props form is the one that compiles, so the rule is silenced for the nest.
 */
/* eslint-disable react/no-children-prop */
function drawn(child: ReactElement, from: ClinicWords | null, language: 'ar' | 'en'): string {
  mockPath = `/${language}/contact`;
  const supplied = from ? createElement(ClinicProvider, { value: from, children: child }) : child;
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      {
        children: createElement(ThemeProvider, {
          children: createElement(BookingProvider, { branches: branchLite, treatments: [], specialists: [], children: supplied }),
        }),
      },
    ),
  );
}
/* eslint-enable react/no-children-prop */

async function save(key: string, value: unknown): Promise<Response> {
  return settingsHandler(
    new Request('http://localhost/api/console/settings', {
      method: 'PATCH',
      headers: {
        cookie: `shamah_session=${session.token}`,
        [CSRF_HEADER]: session.csrf,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({ group: 'site', key, value }),
    }),
  );
}

beforeAll(async () => {
  assertTestDb();
  for (const key of ['phone', 'whatsapp']) prior.set(key, await readSetting(key));

  await syncRoles({ dryRun: false, database: readDbConfig().database });
  const roles = new Map((await db.selectFrom('roles').select(['id', 'name']).execute()).map((role) => [role.name, role.id]));
  const id = await createUser({ email, password: PASSWORD, name: `S1 ${run}` });
  await assignRole(id, roles.get('Owner') ?? '');
  userIds.push(id);

  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const line = cookies.find((cookie) => cookie.startsWith('shamah_session='));
  if (!line) throw new Error('login did not set a session cookie');
  session = {
    token: decodeURIComponent(line.slice('shamah_session='.length).split(';')[0]),
    csrf: (await res.json()).csrfToken,
  };

  // Nothing hand-built for the contact page: these are the props it passes, read the way it
  // reads them, so the render below is the page's and not the test's.
  Object.assign(contactProps, {
    branches: await getBranchList(),
    services: await getMergedTreatments(),
    banner: await getBanner('contact'),
  });
});

afterAll(async () => {
  await restoreSettings();
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await destroyDb();
});

describe('a saved number reaches the reader', () => {
  it('saves through the guarded handler and revalidates the public pages', async () => {
    revalidations.length = 0;
    expect((await save('phone', PHONE_SAVED)).status).toBe(200);
    expect((await save('whatsapp', WHATSAPP_SAVED)).status).toBe(200);

    expect(revalidations).toContainEqual(['/[lang]', 'layout']);
    expect(revalidations).toContainEqual(['/sitemap.xml', 'page']);

    const read = await getClinicWords();
    expect(read.phone).toBe(PHONE_SAVED);
    expect(read.whatsapp).toBe(WHATSAPP_SAVED);
    // A `wa.me` address with a `+` or a space in it does not open, so the link is the digits.
    expect(read.whatsappUrl).toBe(`https://wa.me/${WA_DIGITS}`);
  });

  it('answers the structured data from the same read', async () => {
    const json = (await organizationJsonLd()) as { telephone?: string };
    expect(json.telephone).toBe(PHONE_SAVED);
  });

  it('clears one key without dragging the other down with it', async () => {
    expect((await save('phone', '')).status).toBe(200);
    const blank = await getClinicWords();
    // CMS owns the number. A field the operator emptied renders empty rather than
    // reaching into `config/site.ts` for a value nobody can edit from the console
    // (`docs/inventory.md` — "Missing values stay blank"). The Settings screen still
    // *shows* the shipped number as the field's default, which is where config belongs.
    expect(blank.phone).toBe('');
    // The other field is still saved, so a blank phone cannot drag the link down with it.
    expect(blank.whatsappUrl).toBe(`https://wa.me/${WA_DIGITS}`);
  });
});

describe('the five screens dial the saved number', () => {
  it('header: the call link and the number written beside it', () => {
    const html = drawn(createElement(Navbar, { nav, hiddenPaths: [] }), words, 'en');
    expect(html).toContain(`href="tel:${PHONE_DIALLED}"`);
    expect(html).toContain(`<span>${PHONE_SAVED}</span>`);
    expect(html).toContain(`href="https://wa.me/${WA_DIGITS}?text=`);
  });

  it('footer: the site number, and each branch line still its own', () => {
    const html = drawn(createElement(Footer, { branches: branchLite, nav, hiddenPaths: [] }), words, 'en');
    expect(html).toContain(`href="tel:${PHONE_DIALLED}"`);
    expect(html).toContain(`<span>${PHONE_SAVED}</span>`);
    // Each branch keeps its own number, spacing and all — the site setting cannot
    // overwrite a branch line, and that line is not this read path's to normalize.
    expect(html).toContain(`href="tel:${branchPhone}"`);
  });

  it('contact page: the dial card and the WhatsApp continue link', () => {
    const html = drawn(createElement(ContactClient, contactProps), words, 'en');
    expect(html).toContain(`href="tel:${PHONE_DIALLED}"`);
    expect(html).toContain(PHONE_SAVED);
    expect(html).toContain(`href="https://wa.me/${WA_DIGITS}?text=`);
  });

  it('call-to-action band: both buttons of the band', () => {
    const html = drawn(createElement(CtaBand, {}), words, 'en');
    expect(html).toContain(`href="tel:${PHONE_DIALLED}"`);
    expect(html).toContain(`<span>${PHONE_SAVED}</span>`);
    expect(html).toContain(`href="https://wa.me/${WA_DIGITS}?text=`);
  });

  it('floating actions: the sticky call and WhatsApp, in Arabic too', () => {
    expect(drawn(createElement(FloatingActions), words, 'en')).toContain(`href="tel:${PHONE_DIALLED}"`);
    expect(drawn(createElement(FloatingActions), words, 'en')).toContain(`href="https://wa.me/${WA_DIGITS}?text=`);
    expect(drawn(createElement(FloatingActions), words, 'ar')).toContain(`href="tel:${PHONE_DIALLED}"`);
  });

  it('and when nothing supplies the words, the shipped number still dials', () => {
    for (const html of [
      drawn(createElement(Navbar, { nav, hiddenPaths: [] }), null, 'en'),
      drawn(createElement(FloatingActions), null, 'en'),
      drawn(createElement(CtaBand, {}), null, 'en'),
    ]) {
      expect(html).toContain(`href="tel:${clinicData.phone.replace(/\s/g, '')}"`);
      expect(html).not.toContain('href="tel:"');
    }
  });
});

describe('the cause stays fixed', () => {
  it('the layout feeds the provider from the database read', () => {
    const layout = readFileSync(join(process.cwd(), 'src', 'app', '[lang]', 'layout.tsx'), 'utf8');
    expect(layout).toContain('getClinicWords()');
    expect(layout).toContain('<ClinicProvider value={clinic}>');
  });

  it('no public component imports the module-loaded clinic data any more', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && readFileSync(path, 'utf8').includes('from "@/data/clinic"')) offenders.push(path);
      }
    };
    walk(join(process.cwd(), 'src', 'components'));
    // `ClinicContext` is allowed: it is the fallback, and the only file that may read it.
    expect(offenders.filter((path) => !path.endsWith('ClinicContext.tsx'))).toEqual([]);
  });
});
