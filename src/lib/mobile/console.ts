/**
 * The console's view of the mobile app: bookings to confirm, patients to look up, and
 * loyalty points to grant or take. Permission is the `lead` grant — whoever may work
 * the leads may work the bookings that arrive with them.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '@/lib/db';
import { BOOKING_STATUS } from './handlers';
import { listBranches } from './catalog';
import { leadContactVisible } from '@/lib/auth/redaction';
import type { Grant } from '@/lib/auth/permissions';

export const BOOKING_STATUS_CODES = Object.keys(BOOKING_STATUS).map(Number);

/** Points granted for a visit: price × rate, rounded down. 0.1 = one point per 10 EGP. */
export function visitPoints(price: string | null): number {
  const rate = Number(process.env.MOBILE_POINTS_PER_EGP ?? 0.1);
  const value = Number.parseFloat(price ?? '');
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value * rate);
}

function stamp(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace('T', ' ') : '';
}

export interface ConsoleBooking {
  id: string;
  code: string;
  status: number;
  startAt: string;
  endAt: string;
  branch: string;
  service: string;
  price: string;
  note: string;
  customer: { id: string; name: string; phone: string; code: string };
  createdAt: string;
}

export interface ConsoleCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  points: number;
  bookings: number;
  blocked: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface AppOverview {
  bookings: ConsoleBooking[];
  customers: ConsoleCustomer[];
  counts: Record<string, number>;
  customerTotal: number;
}

export async function appOverview(options: { status?: number | null; q?: string; scope?: 'upcoming' | 'all' } = {}): Promise<AppOverview> {
  const branchNames = new Map((await listBranches()).map((b) => [b.uid, b.name.ar || b.name.en]));
  const q = (options.q ?? '').trim().slice(0, 80);

  let bookings = db
    .selectFrom('app_bookings as b')
    .innerJoin('app_customers as c', 'c.id', 'b.customer_id')
    .select([
      'b.id',
      'b.code',
      'b.status',
      'b.start_at',
      'b.end_at',
      'b.branch_uid',
      'b.service_name_ar',
      'b.service_name_en',
      'b.price',
      'b.clinic_note',
      'b.created_at',
      'c.id as customer_id',
      'c.first_name',
      'c.second_name',
      'c.phone',
      'c.code as customer_code',
    ]);
  if (options.status) bookings = bookings.where('b.status', '=', options.status);
  if (options.scope !== 'all') bookings = bookings.where('b.start_at', '>=', new Date(Date.now() - 86_400_000));
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    bookings = bookings.where((eb) =>
      eb.or([eb('b.code', 'like', like), eb('c.phone', 'like', like), eb('c.first_name', 'like', like), eb('c.second_name', 'like', like)]),
    );
  }
  const bookingRows = await bookings.orderBy('b.start_at', options.scope === 'all' ? 'desc' : 'asc').limit(300).execute();

  const countRows = await db
    .selectFrom('app_bookings')
    .select(['status', sql<number>`COUNT(*)`.as('n')])
    .groupBy('status')
    .execute();

  let customers = db
    .selectFrom('app_customers as c')
    .select([
      'c.id',
      'c.code',
      'c.first_name',
      'c.second_name',
      'c.phone',
      'c.blocked',
      'c.created_at',
      'c.last_login_at',
      sql<number>`(SELECT COALESCE(SUM(CASE WHEN l.type = 1 THEN -ABS(l.points) ELSE l.points END), 0) FROM app_loyalty l WHERE l.customer_id = c.id)`.as('points'),
      sql<number>`(SELECT COUNT(*) FROM app_bookings x WHERE x.customer_id = c.id)`.as('bookings'),
    ])
    .where('c.deleted_at', 'is', null);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    customers = customers.where((eb) =>
      eb.or([eb('c.code', 'like', like), eb('c.phone', 'like', like), eb('c.first_name', 'like', like), eb('c.second_name', 'like', like)]),
    );
  }
  const customerRows = await customers.orderBy('c.created_at', 'desc').limit(200).execute();
  const total = await db
    .selectFrom('app_customers')
    .select(sql<number>`COUNT(*)`.as('n'))
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  return {
    bookings: bookingRows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      startAt: stamp(row.start_at),
      endAt: stamp(row.end_at),
      branch: branchNames.get(row.branch_uid) ?? row.branch_uid,
      service: row.service_name_ar || row.service_name_en,
      price: row.price ?? '',
      note: row.clinic_note,
      customer: {
        id: row.customer_id,
        name: [row.first_name, row.second_name].filter(Boolean).join(' '),
        phone: row.phone,
        code: row.customer_code,
      },
      createdAt: stamp(row.created_at),
    })),
    customers: customerRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: [row.first_name, row.second_name].filter(Boolean).join(' '),
      phone: row.phone,
      points: Number(row.points) || 0,
      bookings: Number(row.bookings) || 0,
      blocked: Number(row.blocked) === 1,
      createdAt: stamp(row.created_at),
      lastLoginAt: stamp(row.last_login_at),
    })),
    counts: Object.fromEntries(countRows.map((row) => [String(row.status), Number(row.n)])),
    customerTotal: Number(total?.n ?? 0),
  };
}

/**
 * A role that may only read leads (Viewer) sees that bookings and patients exist, never a
 * phone number or a name — the same rule `leadContactVisible()` applies to the leads screen.
 */
export function redactOverview(data: AppOverview, grants: readonly Grant[]): AppOverview & { contactHidden: boolean } {
  const visible = leadContactVisible(grants, { source: 'app-booking' });
  if (visible) return { ...data, contactHidden: false };
  return {
    ...data,
    contactHidden: true,
    bookings: data.bookings.map((b) => ({ ...b, note: '', customer: { ...b.customer, name: '', phone: '' } })),
    customers: data.customers.map((c) => ({ ...c, name: '', phone: '' })),
  };
}

/**
 * Move a booking. Marking it visited grants the visit's points once; the flag stays set
 * if the status is moved again, so flipping visited → confirmed → visited pays once.
 */
export async function updateBooking(
  id: string,
  change: { status?: number; note?: string; price?: string | null },
  actorId: string,
): Promise<{ before: Record<string, unknown>; after: Record<string, unknown> } | null> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('app_bookings')
      .select(['id', 'status', 'clinic_note', 'price', 'points_awarded', 'customer_id', 'lead_id'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    const status = change.status ?? row.status;
    const price = change.price === undefined ? row.price : change.price;
    const award = status === 4 && !row.points_awarded ? visitPoints(price) : 0;

    await trx
      .updateTable('app_bookings')
      .set({
        status,
        clinic_note: change.note === undefined ? row.clinic_note : change.note.slice(0, 1000),
        price,
        updated_by: actorId,
        ...(status === 4 && !row.points_awarded ? { points_awarded: 1 } : {}),
        ...(status === 7 ? { cancelled_at: new Date() } : {}),
      })
      .where('id', '=', id)
      .execute();

    if (award > 0) {
      await trx
        .insertInto('app_loyalty')
        .values({
          id: randomUUID(),
          customer_id: row.customer_id,
          type: 0,
          cat: 1,
          points: award,
          amount_spent: price,
          booking_id: id,
          created_by: actorId,
        })
        .execute();
    }
    // Keep the lead the booking created in step with it, so the leads screen agrees.
    if (row.lead_id && status !== row.status) {
      const leadStatus = status === 4 ? 'done' : status === 2 || status === 3 ? 'booked' : status >= 6 ? 'lost' : status === 5 ? 'contacted' : null;
      if (leadStatus) await trx.updateTable('leads').set({ status: leadStatus }).where('id', '=', row.lead_id).execute();
    }
    return {
      before: { status: row.status, note: row.clinic_note, price: row.price },
      after: { status, note: change.note ?? row.clinic_note, price, pointsAwarded: award },
    };
  });
}

export async function adjustPoints(customerId: string, points: number, note: string, actorId: string): Promise<boolean> {
  const exists = await db.selectFrom('app_customers').select('id').where('id', '=', customerId).executeTakeFirst();
  if (!exists || !Number.isInteger(points) || points === 0) return false;
  await db
    .insertInto('app_loyalty')
    .values({
      id: randomUUID(),
      customer_id: customerId,
      type: points < 0 ? 1 : 0,
      cat: 3,
      points: Math.abs(points),
      note: note.slice(0, 500),
      created_by: actorId,
    })
    .execute();
  return true;
}

export async function setCustomerBlocked(customerId: string, blocked: boolean): Promise<boolean> {
  const result = await db.updateTable('app_customers').set({ blocked: blocked ? 1 : 0 }).where('id', '=', customerId).executeTakeFirst();
  if (blocked) {
    await db.updateTable('app_tokens').set({ revoked_at: new Date() }).where('customer_id', '=', customerId).where('revoked_at', 'is', null).execute();
  }
  return Number(result.numUpdatedRows) > 0;
}
