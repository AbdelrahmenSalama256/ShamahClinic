/**
 * npm run db:demo                      -> what the generator would write (writes nothing)
 * npm run db:demo -- --apply           -> replace the demo rows with a fresh 185-day set
 * npm run db:demo -- --purge --apply   -> delete the demo rows and leave the database as it was
 *
 * The Overview is a screen about the site's own traffic. On a fresh install there is no
 * traffic, so the screen is honest and empty — which is correct in production and
 * useless for judging a redesign. This script writes demo rows into `stats_events` and
 * `leads` so the charts can be looked at with something in them, and it refuses to run
 * anywhere it could be mistaken for real data:
 *
 *   - `NODE_ENV=production` stops it before the database is even read;
 *   - a database whose name says "prod" stops it;
 *   - a non-loopback host stops it unless the operator passes `--allow-remote`, which
 *     exists for a disposable staging copy, never for the clinic's site;
 *   - dry-run is the default, and `--apply` is required for every write.
 *
 * Every row it writes is marked: `session_hash` and `visitor_hash` begin with `demo-`,
 * and a lead's `idempotency_key` begins with `demo-`. `--purge` removes exactly those
 * rows and nothing else, so the demo can be removed from the same database the site's
 * own traffic lives in without touching a single real visit or enquiry.
 *
 * The generator is deterministic (a fixed seed): two runs write the same numbers, which
 * makes a screenshot or a test expectation reproducible.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { sql } from 'kysely';
import { destroyDb, readDbConfig } from '../../src/lib/db/index';
import { db } from '../../src/lib/db';
import { dayOf, hourOf } from '../../src/lib/tracking/ingest';
import { recomputeDays } from '../../src/lib/tracking/rollup';

/** 185 days covers the 90-day range and the 90 days it is compared with. */
const DAYS = 185;
const MARK = 'demo-';

// --- the data the site would have produced ------------------------------------

/** Real article slugs, so the "top articles" panel names pages that exist. */
const ARTICLES = [
  'dermapen-with-stem-cells',
  'botox-for-men',
  'facial-plasma',
  'plasma-zoom',
  'derma-pen-with-cosmetics',
  'derma-pen-for-skin-radiance',
];

interface Weighted<T> {
  value: T;
  weight: number;
}

interface Page {
  path: string;
  locale: 'ar' | 'en';
}

const PAGES: Weighted<Page>[] = [
  { value: { path: '/ar', locale: 'ar' }, weight: 30 },
  { value: { path: '/en', locale: 'en' }, weight: 7 },
  { value: { path: '/ar/services', locale: 'ar' }, weight: 15 },
  { value: { path: '/ar/offers', locale: 'ar' }, weight: 12 },
  { value: { path: '/ar/blogs', locale: 'ar' }, weight: 9 },
  { value: { path: '/ar/results', locale: 'ar' }, weight: 7 },
  { value: { path: '/ar/contact', locale: 'ar' }, weight: 7 },
  { value: { path: '/ar/doctors', locale: 'ar' }, weight: 5 },
  { value: { path: '/ar/branches', locale: 'ar' }, weight: 4 },
  { value: { path: '/ar/faq', locale: 'ar' }, weight: 2 },
  { value: { path: '/en/services', locale: 'en' }, weight: 2 },
];

/** Article reads are a long tail, not a landing page: they are entered from `/blogs`. */
const ARTICLE_PAGES: Page[] = ARTICLES.map((slug) => ({ path: `/ar/blogs/${slug}`, locale: 'ar' }));

interface Source {
  source: string;
  medium: string;
  campaign: string;
}

const SOURCES: Weighted<Source>[] = [
  { value: { source: 'google', medium: 'cpc', campaign: 'brand-search' }, weight: 22 },
  { value: { source: 'google', medium: 'cpc', campaign: 'laser-hair-removal' }, weight: 13 },
  { value: { source: 'google', medium: 'organic', campaign: '' }, weight: 19 },
  { value: { source: 'facebook', medium: 'paid_social', campaign: 'autumn-offer' }, weight: 12 },
  { value: { source: 'instagram', medium: 'social', campaign: 'before-after' }, weight: 9 },
  { value: { source: '', medium: '', campaign: '' }, weight: 25 },
];

const CITIES: Weighted<string>[] = [
  { value: 'القاهرة', weight: 30 },
  { value: 'الجيزة', weight: 16 },
  { value: 'القاهرة الجديدة', weight: 14 },
  { value: 'مدينة نصر', weight: 11 },
  { value: 'الشيخ زايد', weight: 8 },
  { value: 'الإسكندرية', weight: 7 },
  { value: 'المنصورة', weight: 5 },
  { value: 'طنطا', weight: 4 },
  { value: '', weight: 5 },
];

const DEVICES: Weighted<string>[] = [
  { value: 'mobile', weight: 71 },
  { value: 'desktop', weight: 21 },
  { value: 'tablet', weight: 8 },
];

const CTAS: Weighted<{ cta: string; event: 'cta_click' | 'whatsapp_click' | 'call_click' }>[] = [
  { value: { cta: 'whatsapp-float', event: 'whatsapp_click' }, weight: 46 },
  { value: { cta: 'call-header', event: 'call_click' }, weight: 34 },
  { value: { cta: 'booking-band', event: 'cta_click' }, weight: 20 },
];

const SERVICES: Weighted<string>[] = [
  { value: 'الليزر', weight: 26 },
  { value: 'زراعة الشعر', weight: 20 },
  { value: 'البوتوكس والفيلر', weight: 17 },
  { value: 'تنظيف البشرة', weight: 15 },
  { value: 'الديرما بن', weight: 12 },
  { value: 'علاج حب الشباب', weight: 10 },
];

const BRANCHES: Weighted<string>[] = [
  { value: 'فرع مدينة نصر', weight: 45 },
  { value: 'فرع التجمع الخامس', weight: 33 },
  { value: 'فرع الشيخ زايد', weight: 22 },
];

const NAMES = [
  'منى عبد الرحمن',
  'سارة حسن',
  'أحمد مصطفى',
  'نورهان سامي',
  'ياسمين فؤاد',
  'محمد إبراهيم',
  'هبة الله علي',
  'دينا محمود',
  'كريم عادل',
  'شيماء رضا',
  'أمنية طارق',
  'حسام الدين',
];

/** Cairo peaks twice: late morning bookings and an evening scroll. */
const HOURS: Weighted<number>[] = [
  { value: 9, weight: 4 },
  { value: 10, weight: 7 },
  { value: 11, weight: 8 },
  { value: 12, weight: 7 },
  { value: 13, weight: 6 },
  { value: 14, weight: 5 },
  { value: 15, weight: 5 },
  { value: 16, weight: 6 },
  { value: 17, weight: 7 },
  { value: 18, weight: 8 },
  { value: 19, weight: 9 },
  { value: 20, weight: 9 },
  { value: 21, weight: 8 },
  { value: 22, weight: 6 },
  { value: 23, weight: 4 },
  { value: 0, weight: 2 },
  { value: 1, weight: 1 },
];

// --- helpers -------------------------------------------------------------------

function refuse(message: string): never {
  throw new Error(message);
}

/** The three guards from the header, checked before a row is read or written. */
function checkTarget(): { host: string; database: string } {
  if (process.env.NODE_ENV === 'production') {
    refuse('Refusing to write demo rows with NODE_ENV=production. This script is for development databases only.');
  }
  const { host, database } = readDbConfig();
  if (/prod/i.test(database)) {
    refuse(`Refusing to write demo rows into "${database}": the name says production.`);
  }
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!loopback && !process.argv.includes('--allow-remote')) {
    refuse(
      `Refusing to write demo rows into ${host}/${database}. A remote database needs --allow-remote, and that flag is for a disposable copy, never the clinic's site.`,
    );
  }
  return { host, database };
}

/** Mulberry32: a small deterministic generator, so a rerun writes the same demo. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: Weighted<T>[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1]!.value;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The instant a Cairo wall clock names. Egypt switches between UTC+2 and UTC+3, so both
 * offsets are tried against the site's own formatters instead of assuming one; the pair
 * that reads back as the requested day and hour wins.
 */
function cairoInstant(day: string, hour: number, minute: number): Date {
  for (const offset of [2, 3]) {
    const at = new Date(Date.parse(`${day}T${pad(hour)}:${pad(minute)}:00Z`) - offset * 3_600_000);
    if (dayOf(at) === day && hourOf(at) === hour) return at;
  }
  return new Date(`${day}T${pad(hour)}:${pad(minute)}:00Z`);
}

function daysBack(count: number): string[] {
  const today = dayOf();
  const noon = Date.parse(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) days.push(dayOf(new Date(noon - index * 86_400_000)));
  return days;
}

function weekdayOf(day: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' }).format(
    new Date(`${day}T12:00:00Z`),
  );
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

function hash(seed: string): string {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return `${MARK}${state.toString(16).padStart(8, '0')}${seed.length.toString(16).padStart(4, '0')}`;
}

// --- the two writers -----------------------------------------------------------

interface DemoEvent {
  day: string;
  hour: number;
  event_type: 'page_view' | 'cta_click' | 'whatsapp_click' | 'call_click' | 'form_submit';
  path: string;
  locale: 'ar' | 'en';
  referrer_host: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landing: string;
  session_hash: string;
  visitor_hash: string;
  city: string;
  device: string;
  cta_key: string;
  meta: string | null;
  bot: 0;
  created_at: Date;
}

interface DemoLead {
  id: string;
  source: 'booking' | 'contact-form';
  form_id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  fields: string;
  status: 'new' | 'contacted' | 'booked' | 'done' | 'lost';
  locale: 'ar' | 'en';
  page_path: string;
  referrer: string;
  landing_page: string;
  first_referrer: string;
  gclid: string;
  fbclid: string;
  device: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm: string;
  city: string;
  day: string;
  session_hash: string;
  visitor_hash: string;
  idempotency_key: string;
  assignee_id: null;
  sheets_sent_at: null;
  created_by: null;
  updated_by: null;
  deleted_at: null;
  created_at: Date;
  updated_at: Date;
}

function build(days: string[]): { events: DemoEvent[]; leads: DemoLead[]; first: string; last: string } {
  const random = generator(20261029);
  const events: DemoEvent[] = [];
  const leads: DemoLead[] = [];
  const first = days[0]!;
  const last = days[days.length - 1]!;

  days.forEach((day, dayIndex) => {
    const weekend = weekdayOf(day) === 5 || weekdayOf(day) === 6 ? 1.18 : 1;
    const growth = 0.6 + (0.4 * dayIndex) / Math.max(1, days.length - 1);
    // A gentle week-to-week wobble, so the sparkline has shape without inventing spikes.
    const wobble = 0.88 + random() * 0.24;
    const visitors = Math.round(58 * growth * weekend * wobble);

    for (let visitor = 0; visitor < visitors; visitor += 1) {
      const page = pick(random, PAGES);
      const article = random() < 0.1 ? ARTICLE_PAGES[Math.floor(random() * ARTICLE_PAGES.length)] : null;
      const source = pick(random, SOURCES);
      const city = pick(random, CITIES);
      const device = pick(random, DEVICES);
      const hour = pick(random, HOURS);
      const minute = Math.floor(random() * 60);
      const session = hash(`${day}:${visitor}`);
      const visitorHash = hash(`v:${day}:${visitor}`);
      const started = cairoInstant(day, hour, minute);
      const landing = page.path;

      const shared = {
        day,
        locale: page.locale,
        referrer_host: source.medium === 'organic' ? 'www.google.com' : '',
        utm_source: source.source,
        utm_medium: source.medium,
        utm_campaign: source.campaign,
        landing,
        session_hash: session,
        visitor_hash: visitorHash,
        city,
        device,
        bot: 0 as const,
      };

      const depth = random() < 0.42 ? 1 : random() < 0.78 ? 2 : 3;
      for (let view = 0; view < depth; view += 1) {
        const at = new Date(started.getTime() + view * 95_000);
        const next = view === 0 ? page : article && view === 1 ? article : pick(random, PAGES);
        events.push({
          ...shared,
          hour: hourOf(at),
          event_type: 'page_view',
          path: next.path,
          locale: next.locale,
          cta_key: '',
          meta: null,
          created_at: at,
        });
      }

      if (random() < 0.19) {
        const cta = pick(random, CTAS);
        const at = new Date(started.getTime() + depth * 95_000 + 20_000);
        events.push({
          ...shared,
          hour: hourOf(at),
          event_type: cta.event,
          path: landing,
          cta_key: cta.cta,
          meta: null,
          created_at: at,
        });
      }
    }

    // Enquiries: a fraction of the day's visitors, more of them on the campaign days.
    const enquiryRate = 0.032 + random() * 0.022;
    const count = Math.max(1, Math.round(visitors * enquiryRate));
    for (let index = 0; index < count; index += 1) {
      const page = pick(random, PAGES);
      const source = pick(random, SOURCES);
      const city = pick(random, CITIES);
      const device = pick(random, DEVICES);
      const hour = pick(random, HOURS);
      const at = cairoInstant(day, hour, Math.floor(random() * 60));
      const age = days.length - 1 - dayIndex;
      const status =
        age <= 1
          ? 'new'
          : age <= 6
            ? random() < 0.45
              ? 'contacted'
              : random() < 0.5
                ? 'booked'
                : 'new'
            : random() < 0.34
              ? 'done'
              : random() < 0.4
                ? 'booked'
                : random() < 0.55
                  ? 'contacted'
                  : 'lost';
      const branch = pick(random, BRANCHES);
      const service = pick(random, SERVICES);
      const affiliate = source.medium === 'cpc' || source.medium === 'paid_social';

      leads.push({
        id: `demo-lead-${day}-${index}`,
        source: random() < 0.62 ? 'booking' : 'contact-form',
        form_id: 'site',
        name: NAMES[Math.floor(random() * NAMES.length)]!,
        phone: `01${Math.floor(10 + random() * 89)}${String(Math.floor(random() * 10_000_000)).padStart(7, '0')}`,
        email: '',
        message: '',
        fields: JSON.stringify({ service, branch }),
        status,
        locale: page.locale,
        page_path: page.path,
        referrer: source.medium === 'organic' ? 'https://www.google.com/' : '',
        landing_page: page.path,
        first_referrer: source.medium === 'organic' ? 'https://www.google.com/' : '',
        gclid: affiliate && source.source === 'google' ? hash(`g:${day}:${index}`) : '',
        fbclid: affiliate && source.source === 'facebook' ? hash(`f:${day}:${index}`) : '',
        device,
        utm_source: source.source,
        utm_medium: source.medium,
        utm_campaign: source.campaign,
        utm: JSON.stringify(
          source.source ? { utm_source: source.source, utm_medium: source.medium, utm_campaign: source.campaign } : {},
        ),
        city,
        day,
        session_hash: hash(`s:${day}:${index}`),
        visitor_hash: hash(`lv:${day}:${index}`),
        idempotency_key: `${MARK}${day}-${index}`,
        assignee_id: null,
        sheets_sent_at: null,
        created_by: null,
        updated_by: null,
        deleted_at: null,
        created_at: at,
        updated_at: at,
      });
    }
  });

  return { events, leads, first, last };
}

async function purge(): Promise<{ events: number; leads: number; from: string; to: string }> {
  const span = await sql<{ first_day: string | null; last_day: string | null }>`
    SELECT DATE_FORMAT(MIN(day), '%Y-%m-%d') AS first_day, DATE_FORMAT(MAX(day), '%Y-%m-%d') AS last_day
    FROM stats_events
    WHERE session_hash LIKE ${`${MARK}%`} OR visitor_hash LIKE ${`${MARK}%`}
  `.execute(db);
  const removed = await db
    .deleteFrom('stats_events')
    .where((eb) => eb.or([eb('session_hash', 'like', `${MARK}%`), eb('visitor_hash', 'like', `${MARK}%`)]))
    .executeTakeFirst();
  const gone = await db
    .deleteFrom('leads')
    .where('idempotency_key', 'like', `${MARK}%`)
    .executeTakeFirst();
  return {
    events: Number(removed.numDeletedRows ?? 0),
    leads: Number(gone.numDeletedRows ?? 0),
    from: span.rows[0]?.first_day ?? '',
    to: span.rows[0]?.last_day ?? '',
  };
}

async function write(events: DemoEvent[], leads: DemoLead[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    for (let index = 0; index < events.length; index += 400) {
      await trx.insertInto('stats_events').values(events.slice(index, index + 400)).execute();
    }
    for (let index = 0; index < leads.length; index += 200) {
      await trx.insertInto('leads').values(leads.slice(index, index + 200)).execute();
    }
  });
}

// --- the run -------------------------------------------------------------------

async function main(): Promise<void> {
  const { host, database } = checkTarget();
  const apply = process.argv.includes('--apply');
  const onlyPurge = process.argv.includes('--purge');
  const days = daysBack(DAYS);
  const { events, leads, first, last } = build(days);

  const existingEvents = await db
    .selectFrom('stats_events')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where((eb) => eb.or([eb('session_hash', 'like', `${MARK}%`), eb('visitor_hash', 'like', `${MARK}%`)]))
    .executeTakeFirst();
  const existingLeads = await db
    .selectFrom('leads')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('idempotency_key', 'like', `${MARK}%`)
    .executeTakeFirst();

  console.log(`Database : ${database} on ${host}`);
  console.log(`Demo rows: ${Number(existingEvents?.n ?? 0)} events, ${Number(existingLeads?.n ?? 0)} leads already present`);
  if (onlyPurge) {
    console.log('Effect   : delete the demo rows, keep every real visit and enquiry');
  } else {
    console.log(`Effect   : replace them with ${events.length} events and ${leads.length} leads, ${first} .. ${last}`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
    return;
  }

  const removed = await purge();
  if (onlyPurge) {
    if (removed.from && removed.to) await recomputeDays(removed.from, removed.to);
    console.log(`\nRemoved ${removed.events} demo event(s) and ${removed.leads} demo lead(s).`);
    return;
  }

  await write(events, leads);
  // The daily tables are what the rest of the console reads; a demo that only filled the
  // raw events would show numbers on the Overview and zeros on every report.
  const rebuilt = await recomputeDays(first, last);
  console.log(`\nWrote ${events.length} events and ${leads.length} leads.`);
  console.log(`Rebuilt ${rebuilt.length} daily table(s) for ${first} .. ${last}.`);
  console.log('Remove them again with: npm run db:demo -- --purge --apply');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
