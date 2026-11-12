/**
 * The mobile app API end to end, through the real route handler and the test database:
 * register → login → profile → branches → booking store/list/show/cancel → favourites →
 * addresses → loyalty → contact → logout, plus the api-password and token gates.
 *
 * Every fixture is tagged `mob-<run>` and removed in `afterAll`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { resetThrottleForTests } from '../src/lib/mobile/http';
import { GET, POST } from '../src/app/api/mobile/[...path]/route';
import { updateBooking } from '../src/lib/mobile/console';

const run = randomUUID().slice(0, 8);
const BRANCH = `mob-${run}-branch`;
const PASSWORD = 'test-mobile-password';
// 01[0125] + 8 digits, unique per run.
const PHONE = `010${String(Date.now()).slice(-8)}`;
const LEAD_PHONE = `+20${PHONE.slice(1)}`;
const createdListItems: string[] = [];
let createdList: string | null = null;

async function call(
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> = {},
  token = '',
  apiPassword = PASSWORD,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = { api_password: apiPassword, ...body };
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let req: Request;
  if (method === 'GET') {
    const url = new URL(`http://localhost/api/mobile/${path}`);
    for (const [k, v] of Object.entries(payload)) url.searchParams.set(k, String(v));
    req = new Request(url, { method, headers });
  } else {
    req = new Request(`http://localhost/api/mobile/${path}`, { method, headers, body: JSON.stringify(payload) });
  }
  const handler = method === 'GET' ? GET : POST;
  const res = await handler(req, { params: Promise.resolve({ path: path.split('/') }) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  assertTestDb();
  process.env.MOBILE_API_PASSWORD = PASSWORD;
  resetThrottleForTests();
  let list = await db.selectFrom('lists').select('id').where('list_key', '=', 'branches').executeTakeFirst();
  if (!list) {
    createdList = randomUUID();
    await db.insertInto('lists').values({ id: createdList, list_key: 'branches', label: 'Branches', item_schema: '{}' } as never).execute();
    list = { id: createdList };
  }
  const id = randomUUID();
  createdListItems.push(id);
  const doc = JSON.stringify({
    name_ar: 'فرع اختبار',
    name_en: 'Test branch',
    address_ar: 'عنوان',
    address_en: 'Address',
    phone: '01000000000',
    latitude: '30.05',
    longitude: '31.33',
  });
  await db
    .insertInto('list_items')
    .values({ id, list_id: list.id, uid: BRANCH, position: 999, enabled: 1, draft: doc, published: doc, status: 'published' } as never)
    .execute();
});

afterAll(async () => {
  const customers = await db.selectFrom('app_customers').select('id').where('phone', '=', PHONE).execute();
  const ids = customers.map((c) => c.id);
  if (ids.length) {
    const leadIds = (await db.selectFrom('app_bookings').select('lead_id').where('customer_id', 'in', ids).execute())
      .map((r) => r.lead_id)
      .filter((v): v is string => Boolean(v));
    if (leadIds.length) await db.deleteFrom('leads').where('id', 'in', leadIds).execute();
    await db.deleteFrom('leads').where('phone', '=', LEAD_PHONE).execute();
    for (const table of ['app_bookings', 'app_tokens', 'app_favourites', 'app_addresses', 'app_loyalty'] as const) {
      await db.deleteFrom(table).where('customer_id', 'in', ids).execute();
    }
    await db.deleteFrom('app_customers').where('id', 'in', ids).execute();
  }
  if (createdListItems.length) await db.deleteFrom('list_items').where('id', 'in', createdListItems).execute();
  if (createdList) await db.deleteFrom('lists').where('id', '=', createdList).execute();
  await destroyDb();
});

describe('mobile api', () => {
  let token = '';
  let code = '';

  it('refuses a wrong api password with the Laravel-style 401 body', async () => {
    const res = await call('GET', 'fetch_all_branches', {}, '', 'nope');
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ message: 'Unauthenticated.' });
  });

  it('validates registration per field', async () => {
    const res = await call('POST', 'register', { first_name: 'A', second_name: '', phone_number: '123', password: 'short' });
    expect(res.status).toBe(422);
    const error = res.json.error as Record<string, string[]>;
    expect(Object.keys(error).sort()).toEqual(['first_name', 'password', 'phone_number', 'second_name']);
  });

  it('registers, rejects a duplicate phone, and logs in', async () => {
    const reg = await call('POST', 'register', {
      first_name: 'Sara',
      second_name: 'Test',
      phone_number: `+2${PHONE}`,
      password: 'abc12345',
    });
    expect(reg.status).toBe(200);
    expect(reg.json.success).toBe(true);
    expect(typeof reg.json.token).toBe('string');
    const user = reg.json.user as Record<string, unknown>;
    expect(user.phone_number).toBe(PHONE);
    expect(user.full_name).toBe('Sara Test');

    const dup = await call('POST', 'register', { first_name: 'Sara', second_name: 'Test', phone_number: PHONE, password: 'abc12345' });
    expect(dup.status).toBe(422);

    const bad = await call('POST', 'login', { phone_number: PHONE, password: 'wrong123' });
    expect(bad.status).toBe(401);
    expect(bad.json.success).toBe(false);

    const login = await call('POST', 'login', { phone_number: PHONE, password: 'abc12345', mobileapp_notification_token: '' });
    expect(login.status).toBe(200);
    token = String(login.json.token);
    expect(token.length).toBeGreaterThan(20);
  });

  it('needs a valid bearer token for account endpoints', async () => {
    expect((await call('GET', 'fetch_user')).status).toBe(401);
    expect((await call('GET', 'fetch_user', {}, 'not-a-token')).status).toBe(401);
    const me = await call('GET', 'fetch_user', {}, token);
    expect(me.status).toBe(200);
    expect((me.json.user as Record<string, unknown>).first_name).toBe('Sara');
  });

  it('updates the profile', async () => {
    const res = await call('POST', 'update_user', { first_name: 'Sarah', second_name: 'Tester', phone_number: PHONE }, token);
    expect(res.status).toBe(200);
    expect((res.json.user as Record<string, unknown>).full_name).toBe('Sarah Tester');
  });

  it('lists branches and orders the nearby read by distance', async () => {
    const all = await call('GET', 'fetch_all_branches');
    const rows = all.json.data as Array<Record<string, unknown>>;
    expect(rows.some((row) => row.id === BRANCH)).toBe(true);

    const near = await call('GET', 'fetch_nearby_stores_branches_long_lat', { latitude: '30.050000', longitude: '31.330000' });
    const first = (near.json.data as Array<Record<string, unknown>>)[0];
    expect(first.id).toBe(BRANCH);
    expect(first.distance).toBe(0);
  });

  it('stores a booking, de-duplicates a double tap, lists, shows and cancels it', async () => {
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const body = {
      branch_id: BRANCH,
      product_id: 'botox',
      start_at_date: day,
      start_at_time: '14:00',
      end_at_date: day,
      end_at_time: '18:00',
    };
    const store = await call('POST', 'booking/store', body, token);
    expect(store.status).toBe(200);
    code = String(store.json.booking_code);
    expect(code).toMatch(/^SH\d+$/);

    const again = await call('POST', 'booking/store', body, token);
    expect(again.json.booking_code).toBe(code);

    const past = await call('POST', 'booking/store', { ...body, start_at_date: '2020-01-01', end_at_date: '2020-01-01' }, token);
    expect(past.status).toBe(422);

    const list = await call('GET', 'booking/list', {}, token);
    const rows = list.json.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(code);
    expect(rows[0].status).toBe(1);
    expect(rows[0].start_at).toBe(`${day} 14:00:00`);
    expect((rows[0].service_item as Record<string, unknown>).name).toBeTruthy();
    expect((rows[0].invoice_item as Record<string, unknown>).price).toBeTruthy();

    const lead = await db.selectFrom('leads').select(['source', 'phone']).where('phone', '=', LEAD_PHONE).where('source', '=', 'app-booking').executeTakeFirst();
    expect(lead?.source).toBe('app-booking');

    const show = await call('GET', 'booking/show', { booking_code: code }, token);
    expect((show.json.data as Record<string, unknown>).code).toBe(code);

    const cancel = await call('POST', 'booking/canceled', { booking_code: code }, token);
    expect(cancel.status).toBe(200);
    expect((cancel.json.data as Record<string, unknown>).status).toBe(6);
  });

  it('console: visited awards the visit points once, and the patient sees them', async () => {
    const day = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    const store = await call('POST', 'booking/store', { branch_id: BRANCH, product_id: 'fillers', start_at_date: day, start_at_time: '10:00', end_at_date: day, end_at_time: '14:00' }, token);
    const booking = await db.selectFrom('app_bookings').select(['id', 'price']).where('code', '=', String(store.json.booking_code)).executeTakeFirstOrThrow();
    expect(booking.price).toBe('3200.00');
    const actor = randomUUID();
    await updateBooking(booking.id, { status: 4 }, actor);
    await updateBooking(booking.id, { status: 2 }, actor);
    await updateBooking(booking.id, { status: 4 }, actor);
    const earned = await db.selectFrom('app_loyalty').select('points').where('booking_id', '=', booking.id).execute();
    expect(earned).toEqual([{ points: 320 }]);
    const list = await call('GET', 'booking/list', {}, token);
    const row = (list.json.data as Array<Record<string, unknown>>).find((r) => r.code === store.json.booking_code);
    expect(row?.status).toBe(4);
    await db.deleteFrom('app_loyalty').where('booking_id', '=', booking.id).execute();
  });

  it('toggles favourites and pages them', async () => {
    const add = await call('POST', 'add_or_remove_favourite_product', { product_id: 'fillers' }, token);
    expect(add.json.data).toBe(1);
    const page = await call('GET', 'all_favourite_products', { page: 1 }, token);
    const data = page.json.data as Record<string, unknown>;
    expect(data.current_page).toBe(1);
    expect((data.data as Array<Record<string, unknown>>)[0].id).toBe('fillers');
    const remove = await call('POST', 'add_or_remove_favourite_product', { product_id: 'fillers' }, token);
    expect(remove.json.data).toBe(2);
  });

  it('saves addresses, the first one chosen', async () => {
    const add = await call('POST', 'add_address', { street_name: 'Abbas El Akkad', bulding_number: '8', floor: '3', apartment_number: '', phone_number: PHONE, extra_info: '' }, token);
    expect(add.status).toBe(200);
    const list = await call('GET', 'fetch_address', {}, token);
    const rows = list.json.data as Array<Record<string, unknown>>;
    expect(rows[0].fav).toBe(1);
    expect(rows[0].bulding_number).toBe('8');
    expect(rows[0].client_name).toBe('Sarah Tester');
  });

  it('reads the loyalty ledger and balance', async () => {
    const customer = await db.selectFrom('app_customers').select('id').where('phone', '=', PHONE).executeTakeFirstOrThrow();
    await db.insertInto('app_loyalty').values({ id: randomUUID(), customer_id: customer.id, type: 0, cat: 1, points: 120 }).execute();
    await db.insertInto('app_loyalty').values({ id: randomUUID(), customer_id: customer.id, type: 1, cat: 3, points: 20, note: 'Redeemed' }).execute();
    const res = await call('GET', 'fetch_loyalty_program', {}, token);
    expect((res.json.data as unknown[]).length).toBe(2);
    const me = await call('GET', 'fetch_user', {}, token);
    expect((me.json.user as Record<string, unknown>).loyalty_program_points).toBe(100);
  });

  it('sends a contact message into leads', async () => {
    const res = await call('POST', 'contactus', { subject: 'Question', content: 'When do you open on Friday?' }, token);
    expect(res.status).toBe(200);
    const lead = await db.selectFrom('leads').select('source').where('phone', '=', LEAD_PHONE).where('source', '=', 'app-contact').executeTakeFirst();
    expect(lead?.source).toBe('app-contact');
  });

  it('logs out and the token stops working', async () => {
    expect((await call('POST', 'logout', {}, token)).status).toBe(200);
    expect((await call('GET', 'fetch_user', {}, token)).status).toBe(401);
  });

  it('answers unknown endpoints and wrong methods clearly', async () => {
    expect((await call('GET', 'nope')).status).toBe(404);
    expect((await call('GET', 'login')).status).toBe(405);
  });
});
