/**
 * One function per endpoint the app calls. Paths and keys are the ones in the app's
 * `lib/core/networking/api_endpoints.dart` and its request/response models — see
 * docs/MOBILE-API.md for the full table.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordLead } from '@/lib/leads/store';
import {
  checkPassword,
  createCustomer,
  customerByPhone,
  hashPassword,
  issueToken,
  passwordOk,
  revokeAllTokens,
  revokeToken,
  userJson,
  type Customer,
} from './accounts';
import { absoluteUrl, findBranch, haversineKm, listBranches, pick, resolveService } from './catalog';
import {
  EGYPT_MOBILE,
  clientIpOf,
  failure,
  invalid,
  normalizePhone,
  success,
  text,
  throttled,
  type Input,
  type Lang,
} from './http';

export interface Ctx {
  req: Request;
  input: Input;
  lang: Lang;
  token: string;
  customer: Customer | null;
}

const t = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);

// ---------------------------------------------------------------- health

/** Unauthenticated liveness probe: proves the route, the env and the database. */
export async function health(): Promise<NextResponse> {
  try {
    await sql`SELECT 1`.execute(db);
    const migrated = await db.selectFrom('app_migrations').select('name').where('name', '=', '018_mobile_app.sql').executeTakeFirst();
    return success('ok', {
      data: { database: true, schema: Boolean(migrated), api_password_set: Boolean((process.env.MOBILE_API_PASSWORD ?? '').trim()) },
    });
  } catch {
    return failure(503, 'database unavailable', { data: { database: false } });
  }
}

// ---------------------------------------------------------------- auth

export async function login(ctx: Ctx): Promise<NextResponse> {
  const { input, lang, req } = ctx;
  const phone = normalizePhone(input.phone_number);
  const password = text(input.password);
  const errors: Record<string, string> = {};
  if (!phone) errors.phone_number = t(lang, 'رقم الهاتف مطلوب', 'Phone number is required');
  if (!password) errors.password = t(lang, 'كلمة المرور مطلوبة', 'Password is required');
  if (Object.keys(errors).length) return invalid(errors, lang);

  if (throttled(`login:${clientIpOf(req)}`, 20, 15 * 60_000) || throttled(`login:${phone}`, 8, 15 * 60_000)) {
    return failure(429, t(lang, 'محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly'));
  }

  const found = await customerByPhone(phone);
  const ok = await checkPassword(password, found?.password_hash ?? null);
  if (!found || !ok) {
    return failure(401, t(lang, 'رقم الهاتف أو كلمة المرور غير صحيحة', 'Invalid credentials'), {
      error: { phone_number: [t(lang, 'رقم الهاتف أو كلمة المرور غير صحيحة', 'Invalid credentials')] },
    });
  }
  if (found.blocked) return failure(403, t(lang, 'هذا الحساب موقوف، تواصل مع العيادة', 'This account is suspended'));

  const pushToken = text(input.mobileapp_notification_token);
  if (pushToken) {
    await db.updateTable('app_customers').set({ push_token: pushToken.slice(0, 512) }).where('id', '=', found.id).execute();
  }
  const token = await issueToken(found.id, req.headers.get('user-agent') ?? '');
  return success(t(lang, 'تم تسجيل الدخول', 'Signed in'), { token, user: await userJson(found) });
}

export async function register(ctx: Ctx): Promise<NextResponse> {
  const { input, lang, req } = ctx;
  const firstName = text(input.first_name);
  const secondName = text(input.second_name);
  const phone = normalizePhone(input.phone_number);
  const password = text(input.password);

  const errors: Record<string, string> = {};
  if (firstName.length < 2) errors.first_name = t(lang, 'الاسم الأول مطلوب', 'First name is required');
  if (secondName.length < 2) errors.second_name = t(lang, 'الاسم الثاني مطلوب', 'Last name is required');
  if (!EGYPT_MOBILE.test(phone)) errors.phone_number = t(lang, 'رقم موبايل مصري غير صحيح', 'Enter a valid Egyptian mobile number');
  if (!passwordOk(password)) {
    errors.password = t(lang, 'كلمة المرور ٨ أحرف على الأقل وتحتوي على حروف وأرقام', 'Password must be 8+ characters with letters and digits');
  }
  if (Object.keys(errors).length) return invalid(errors, lang);

  if (throttled(`register:${clientIpOf(req)}`, 10, 60 * 60_000)) {
    return failure(429, t(lang, 'محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly'));
  }
  if (await customerByPhone(phone)) {
    return invalid({ phone_number: t(lang, 'هذا الرقم مسجل بالفعل', 'This phone number is already registered') }, lang);
  }

  let customer: Customer;
  try {
    customer = await createCustomer({ firstName, secondName, phone, password, locale: lang });
  } catch {
    // Two taps racing on the unique phone index.
    return invalid({ phone_number: t(lang, 'هذا الرقم مسجل بالفعل', 'This phone number is already registered') }, lang);
  }
  const bonus = Number(process.env.MOBILE_SIGNUP_BONUS_POINTS ?? 0);
  if (Number.isFinite(bonus) && bonus > 0) {
    await db
      .insertInto('app_loyalty')
      .values({ id: randomUUID(), customer_id: customer.id, type: 0, cat: 2, points: Math.floor(bonus), note: 'signup' })
      .execute();
  }
  const token = await issueToken(customer.id, req.headers.get('user-agent') ?? '');
  return success(t(lang, 'تم إنشاء الحساب', 'Account created'), { token, user: await userJson(customer) });
}

export async function logout(ctx: Ctx): Promise<NextResponse> {
  await revokeToken(ctx.token);
  return success(t(ctx.lang, 'تم تسجيل الخروج', 'Signed out'));
}

export async function fetchUser(ctx: Ctx): Promise<NextResponse> {
  const user = await userJson(ctx.customer!);
  return success('', { user, data: user });
}

export async function updateUser(ctx: Ctx): Promise<NextResponse> {
  const { input, lang } = ctx;
  const me = ctx.customer!;
  const firstName = text(input.first_name) || me.first_name;
  const secondName = text(input.second_name) || me.second_name;
  const phone = input.phone_number === undefined ? me.phone : normalizePhone(input.phone_number);
  const password = text(input.password);

  const errors: Record<string, string> = {};
  if (firstName.length < 2) errors.first_name = t(lang, 'الاسم الأول مطلوب', 'First name is required');
  if (secondName.length < 2) errors.second_name = t(lang, 'الاسم الثاني مطلوب', 'Last name is required');
  if (!EGYPT_MOBILE.test(phone)) errors.phone_number = t(lang, 'رقم موبايل مصري غير صحيح', 'Enter a valid Egyptian mobile number');
  if (password && !passwordOk(password)) {
    errors.password = t(lang, 'كلمة المرور ٨ أحرف على الأقل وتحتوي على حروف وأرقام', 'Password must be 8+ characters with letters and digits');
  }
  if (phone !== me.phone) {
    const other = await customerByPhone(phone);
    if (other && other.id !== me.id) errors.phone_number = t(lang, 'هذا الرقم مسجل بالفعل', 'This phone number is already registered');
  }
  if (Object.keys(errors).length) return invalid(errors, lang);

  await db
    .updateTable('app_customers')
    .set({
      first_name: firstName.slice(0, 120),
      second_name: secondName.slice(0, 120),
      phone,
      ...(password ? { password_hash: await hashPassword(password) } : {}),
    })
    .where('id', '=', me.id)
    .execute();
  // A changed password signs every other device out; this one keeps its token.
  if (password) await revokeAllTokens(me.id, ctx.token);

  const user = await userJson({ ...me, first_name: firstName, second_name: secondName, phone });
  return success(t(lang, 'تم حفظ البيانات', 'Profile saved'), { user, data: user });
}

// ---------------------------------------------------------------- loyalty

export const POINT_VALUE_EGP = () => {
  const value = Number(process.env.MOBILE_POINT_VALUE_EGP ?? 0.1);
  return Number.isFinite(value) && value >= 0 ? value : 0.1;
};

const LOYALTY_CATS: Record<number, { ar: string; en: string }> = {
  1: { ar: 'زيارة العيادة', en: 'Clinic visit' },
  2: { ar: 'هدية التسجيل', en: 'Welcome bonus' },
  3: { ar: 'تعديل من العيادة', en: 'Clinic adjustment' },
};

export async function loyalty(ctx: Ctx): Promise<NextResponse> {
  const rows = await db
    .selectFrom('app_loyalty')
    .selectAll()
    .where('customer_id', '=', ctx.customer!.id)
    .orderBy('created_at', 'desc')
    .limit(200)
    .execute();
  const value = POINT_VALUE_EGP();
  const data = rows.map((row) => ({
    id: row.id,
    type: row.type,
    cat: row.cat,
    amount_spent: row.amount_spent ?? '',
    points: Math.abs(row.points),
    points_to_money: (Math.abs(row.points) * value).toFixed(2),
    date_at: row.created_at.toISOString(),
    type_msg: row.type === 1 ? t(ctx.lang, 'استبدال نقاط', 'Points redeemed') : t(ctx.lang, 'نقاط مكتسبة', 'Points earned'),
    cat_msg: row.note && row.cat === 3 ? row.note : pick(LOYALTY_CATS[row.cat] ?? LOYALTY_CATS[3], ctx.lang),
  }));
  return success('', { data });
}

// ---------------------------------------------------------------- contact

export async function contactUs(ctx: Ctx): Promise<NextResponse> {
  const { input, lang, req } = ctx;
  const subject = text(input.subject);
  const content = text(input.content);
  const errors: Record<string, string> = {};
  if (subject.length < 2) errors.subject = t(lang, 'الموضوع مطلوب', 'Subject is required');
  if (content.length < 5) errors.content = t(lang, 'اكتب رسالتك', 'Please write your message');
  if (Object.keys(errors).length) return invalid(errors, lang);
  if (throttled(`contact:${clientIpOf(req)}`, 6, 60_000)) {
    return failure(429, t(lang, 'محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly'));
  }

  const me = ctx.customer;
  const name = me ? [me.first_name, me.second_name].filter(Boolean).join(' ') : text(input.name) || 'App user';
  const phone = me ? me.phone : normalizePhone(input.phone_number);
  await recordLead({
    source: 'app-contact',
    formId: 'mobile-app',
    name,
    phone,
    message: `${subject}\n\n${content}`.slice(0, 5000),
    fields: { subject: subject.slice(0, 255), ...(me ? { customerCode: me.code } : {}) },
    locale: lang,
    device: 'mobile',
  });
  return success(t(lang, 'تم إرسال رسالتك، سنتواصل معك قريبًا', 'Message sent, we will contact you soon'));
}

// ---------------------------------------------------------------- branches

function branchJson(branch: Awaited<ReturnType<typeof listBranches>>[number], lang: Lang, distance?: number | null) {
  return {
    id: branch.uid,
    name: pick(branch.name, lang),
    address: pick(branch.address, lang),
    phone_number: branch.phone,
    email: branch.email,
    open_at: branch.openAt,
    close_at: branch.closeAt,
    latitude: branch.latitude,
    longitude: branch.longitude,
    ...(distance !== undefined ? { distance: distance === null ? null : Number(distance.toFixed(2)) } : {}),
  };
}

export async function allBranches(ctx: Ctx): Promise<NextResponse> {
  const branches = await listBranches();
  return success('', { data: branches.map((branch) => branchJson(branch, ctx.lang)) });
}

export async function nearbyBranches(ctx: Ctx): Promise<NextResponse> {
  const lat = Number.parseFloat(text(ctx.input.latitude) || text(ctx.input.lat));
  const lng = Number.parseFloat(text(ctx.input.longitude) || text(ctx.input.long));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return invalid({ latitude: t(ctx.lang, 'الموقع غير صحيح', 'Invalid position') }, ctx.lang);
  }
  const rows = (await listBranches()).map((branch) => ({
    branch,
    distance:
      branch.latitude !== null && branch.longitude !== null
        ? haversineKm(lat, lng, branch.latitude, branch.longitude)
        : null,
  }));
  rows.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return success('', { data: rows.map((row) => branchJson(row.branch, ctx.lang, row.distance)) });
}

// ---------------------------------------------------------------- bookings

export const BOOKING_STATUS: Record<number, { ar: string; en: string; color: string }> = {
  1: { ar: 'تم الإرسال', en: 'Request sent', color: '#C9A227' },
  2: { ar: 'مؤكد', en: 'Confirmed', color: '#C9A227' },
  3: { ar: 'تم تغيير الموعد', en: 'Rescheduled', color: '#C9A227' },
  4: { ar: 'تمت الزيارة', en: 'Visited', color: '#2E7D32' },
  5: { ar: 'لم يتم التأكيد', en: 'Not confirmed', color: '#8A8178' },
  6: { ar: 'ملغي', en: 'Cancelled', color: '#C62828' },
  7: { ar: 'ألغته العيادة', en: 'Cancelled by clinic', color: '#C62828' },
};

const CANCELLABLE = new Set([1, 2, 3, 5]);

async function uniqueBookingCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `SH${randomInt(10_000_000, 99_999_999)}`;
    const taken = await db.selectFrom('app_bookings').select('id').where('code', '=', code).executeTakeFirst();
    if (!taken) return code;
  }
  return `SH${Date.now().toString().slice(-9)}`;
}

/** `2026-11-20` + `14:00` → a wall-clock Date (Cairo time, stored as DATETIME without zone). */
function wallClock(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const value = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** Today in Cairo as YYYY-MM-DD. */
function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

function stamp(value: Date | null): string {
  if (!value) return '';
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

type BookingRow = {
  id: string;
  code: string;
  customer_id: string;
  branch_uid: string;
  service_uid: string;
  service_name_ar: string;
  service_name_en: string;
  start_at: Date;
  end_at: Date | null;
  status: number;
  price: string | null;
};

async function bookingJson(row: BookingRow, lang: Lang) {
  const branch = await findBranch(row.branch_uid);
  const service = row.service_uid ? await resolveService(row.service_uid) : null;
  const status = BOOKING_STATUS[row.status] ?? BOOKING_STATUS[1];
  return {
    id: row.id,
    code: row.code,
    booking_code: row.code,
    patient_id: row.customer_id,
    branch_id: row.branch_uid,
    services_cat_id: row.service_uid,
    status: row.status,
    start_at: stamp(row.start_at),
    end_at: stamp(row.end_at),
    status_msg: pick(status, lang),
    status_color: status.color,
    branch: branch
      ? {
          id: branch.uid,
          name: pick(branch.name, lang),
          address: pick(branch.address, lang),
          phone_number: branch.phone,
          latitude: branch.latitude === null ? '' : String(branch.latitude),
          longitude: branch.longitude === null ? '' : String(branch.longitude),
        }
      : { id: row.branch_uid, name: row.branch_uid },
    invoice_item: { id: row.id, price: row.price ?? '' },
    service_item: {
      id: row.service_uid,
      name: pick({ ar: row.service_name_ar, en: row.service_name_en }, lang),
      image_url: absoluteUrl(service?.image ?? ''),
    },
  };
}

const BOOKING_COLUMNS = [
  'id',
  'code',
  'customer_id',
  'branch_uid',
  'service_uid',
  'service_name_ar',
  'service_name_en',
  'start_at',
  'end_at',
  'status',
  'price',
] as const;

export async function bookingStore(ctx: Ctx): Promise<NextResponse> {
  const { input, lang, req } = ctx;
  const me = ctx.customer!;
  const branchId = text(input.branch_id);
  const productId = text(input.product_id);
  const startDate = text(input.start_at_date);
  const startTime = text(input.start_at_time);
  const endDate = text(input.end_at_date) || startDate;
  const endTime = text(input.end_at_time);

  const errors: Record<string, string> = {};
  const branch = branchId ? await findBranch(branchId) : null;
  if (!branch) errors.branch_id = t(lang, 'اختر فرعًا', 'Choose a branch');
  const start = wallClock(startDate, startTime);
  if (!start) errors.start_at_date = t(lang, 'اختر التاريخ والوقت', 'Choose a date and time');
  else if (startDate < cairoToday()) errors.start_at_date = t(lang, 'لا يمكن الحجز في تاريخ سابق', 'The date is in the past');
  else if (startDate > new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10)) {
    errors.start_at_date = t(lang, 'الحجز متاح حتى ستة أشهر مقدمًا', 'Bookings open up to six months ahead');
  }
  const end = endTime ? wallClock(endDate, endTime) : null;
  if (endTime && (!end || (start && end <= start))) errors.end_at_time = t(lang, 'وقت الانتهاء غير صحيح', 'Invalid end time');
  const service = productId ? await resolveService(productId) : null;
  if (productId && !service) errors.product_id = t(lang, 'الخدمة غير متاحة', 'This service is not available');
  if (Object.keys(errors).length) return invalid(errors, lang);

  if (throttled(`booking:${me.id}`, 10, 60 * 60_000)) {
    return failure(429, t(lang, 'محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly'));
  }
  // At most 5 open requests per patient: a stuck button must not fill the clinic's day.
  const open = await db
    .selectFrom('app_bookings')
    .select(sql<number>`COUNT(*)`.as('n'))
    .where('customer_id', '=', me.id)
    .where('status', 'in', [1, 2, 3])
    .where('start_at', '>=', new Date(`${cairoToday()}T00:00:00Z`))
    .executeTakeFirst();
  if (Number(open?.n ?? 0) >= 5) {
    return failure(409, t(lang, 'لديك ٥ حجوزات مفتوحة بالفعل', 'You already have 5 open bookings'));
  }

  // The same slot, branch and service again is the same booking (a double tap).
  const existing = await db
    .selectFrom('app_bookings')
    .select(['code'])
    .where('customer_id', '=', me.id)
    .where('branch_uid', '=', branch!.uid)
    .where('service_uid', '=', service?.uid ?? '')
    .where('start_at', '=', start!)
    .where('status', 'in', [1, 2, 3])
    .executeTakeFirst();
  if (existing) {
    return success(t(lang, 'تم استلام طلب الحجز', 'Booking request received'), { booking_code: existing.code, data: { booking_code: existing.code } });
  }

  const id = randomUUID();
  const code = await uniqueBookingCode();
  const fullName = [me.first_name, me.second_name].filter(Boolean).join(' ');
  let leadId: string | null = null;
  try {
    const lead = await recordLead({
      source: 'app-booking',
      formId: 'mobile-app',
      name: fullName,
      phone: me.phone,
      message: null,
      fields: {
        bookingCode: code,
        customerCode: me.code,
        branch: branch!.name.ar,
        service: service?.name.ar ?? '',
        serviceIds: service ? [service.uid] : [],
        date: `${startDate} ${startTime}${endTime ? `–${endTime}` : ''}`,
      },
      locale: lang,
      device: 'mobile',
      idempotencyKey: `app-booking:${code}`,
    });
    leadId = lead.id;
  } catch {
    console.error('[mobile] booking lead was not recorded');
  }

  await db
    .insertInto('app_bookings')
    .values({
      id,
      code,
      customer_id: me.id,
      branch_uid: branch!.uid,
      service_uid: service?.uid ?? '',
      service_name_ar: service?.name.ar ?? '',
      service_name_en: service?.name.en ?? '',
      start_at: start!,
      end_at: end,
      price: service?.price != null ? service.price.toFixed(2) : null,
      lead_id: leadId,
    })
    .execute();

  void req;
  return success(t(lang, 'تم استلام طلب الحجز، سنتواصل معك للتأكيد', 'Booking request received, we will call you to confirm'), {
    booking_code: code,
    data: { booking_code: code },
  });
}

export async function bookingList(ctx: Ctx): Promise<NextResponse> {
  const rows = await db
    .selectFrom('app_bookings')
    .select([...BOOKING_COLUMNS])
    .where('customer_id', '=', ctx.customer!.id)
    .orderBy('start_at', 'desc')
    .limit(200)
    .execute();
  const data = await Promise.all(rows.map((row) => bookingJson(row, ctx.lang)));
  return success('', { data });
}

async function ownBooking(ctx: Ctx): Promise<BookingRow | null> {
  const code = text(ctx.input.booking_code);
  if (!code) return null;
  const row = await db
    .selectFrom('app_bookings')
    .select([...BOOKING_COLUMNS])
    .where('code', '=', code)
    .where('customer_id', '=', ctx.customer!.id)
    .executeTakeFirst();
  return row ?? null;
}

export async function bookingShow(ctx: Ctx): Promise<NextResponse> {
  const row = await ownBooking(ctx);
  if (!row) return failure(404, t(ctx.lang, 'الحجز غير موجود', 'Booking not found'));
  return success('', { data: await bookingJson(row, ctx.lang) });
}

export async function bookingCancel(ctx: Ctx): Promise<NextResponse> {
  const row = await ownBooking(ctx);
  if (!row) return failure(404, t(ctx.lang, 'الحجز غير موجود', 'Booking not found'));
  if (row.status === 6 || row.status === 7) {
    return success(t(ctx.lang, 'الحجز ملغي بالفعل', 'Booking already cancelled'), { data: await bookingJson(row, ctx.lang) });
  }
  if (!CANCELLABLE.has(row.status)) {
    return failure(409, t(ctx.lang, 'لا يمكن إلغاء هذا الحجز', 'This booking can no longer be cancelled'));
  }
  await db.updateTable('app_bookings').set({ status: 6, cancelled_at: new Date() }).where('id', '=', row.id).execute();
  const lead = await db.selectFrom('app_bookings').select('lead_id').where('id', '=', row.id).executeTakeFirst();
  if (lead?.lead_id) {
    await db.updateTable('leads').set({ status: 'lost' }).where('id', '=', lead.lead_id).where('status', '=', 'new').execute();
  }
  return success(t(ctx.lang, 'تم إلغاء الحجز', 'Booking cancelled'), { data: await bookingJson({ ...row, status: 6 }, ctx.lang) });
}

// ---------------------------------------------------------------- favourites

const PER_PAGE = 20;

export async function favouriteList(ctx: Ctx): Promise<NextResponse> {
  const page = Math.max(1, Math.floor(Number(text(ctx.input.page)) || 1));
  const me = ctx.customer!.id;
  const total = Number(
    (await db.selectFrom('app_favourites').select(sql<number>`COUNT(*)`.as('n')).where('customer_id', '=', me).executeTakeFirst())?.n ?? 0,
  );
  const rows = await db
    .selectFrom('app_favourites')
    .select(['product_id', 'created_at'])
    .where('customer_id', '=', me)
    .orderBy('created_at', 'desc')
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE)
    .execute();
  const items = await Promise.all(
    rows.map(async (row) => {
      const service = await resolveService(row.product_id);
      return {
        id: row.product_id,
        name: service ? pick(service.name, ctx.lang) : row.product_id,
        price: service?.price != null ? String(service.price) : '',
        image_url: absoluteUrl(service?.image ?? ''),
        favourite: { product_id: row.product_id, created_at: row.created_at.toISOString() },
      };
    }),
  );
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  return success('', { data: { current_page: page, last_page: lastPage, per_page: PER_PAGE, total, data: items } });
}

/** `data: 1` added, `data: 2` removed — the reference backend's values. */
export async function favouriteToggle(ctx: Ctx): Promise<NextResponse> {
  const productId = text(ctx.input.product_id).slice(0, 191);
  if (!productId) return invalid({ product_id: t(ctx.lang, 'الخدمة مطلوبة', 'Product is required') }, ctx.lang);
  const me = ctx.customer!.id;
  const removed = await db
    .deleteFrom('app_favourites')
    .where('customer_id', '=', me)
    .where('product_id', '=', productId)
    .executeTakeFirst();
  if (Number(removed.numDeletedRows) > 0) {
    return success(t(ctx.lang, 'تمت الإزالة من المفضلة', 'Removed from favourites'), { data: 2 });
  }
  const count = Number(
    (await db.selectFrom('app_favourites').select(sql<number>`COUNT(*)`.as('n')).where('customer_id', '=', me).executeTakeFirst())?.n ?? 0,
  );
  if (count >= 200) return failure(409, t(ctx.lang, 'المفضلة ممتلئة', 'Favourites list is full'));
  await db.insertInto('app_favourites').ignore().values({ customer_id: me, product_id: productId }).execute();
  return success(t(ctx.lang, 'تمت الإضافة إلى المفضلة', 'Added to favourites'), { data: 1 });
}

// ---------------------------------------------------------------- addresses

function addressJson(row: {
  id: string;
  client_name: string;
  street_name: string;
  building_number: string;
  floor: string;
  apartment_number: string;
  phone: string;
  extra_info: string;
  latitude: string | null;
  longitude: string | null;
  fav: number;
}) {
  return {
    id: row.id,
    client_name: row.client_name,
    street_name: row.street_name,
    bulding_number: row.building_number,
    floor: row.floor,
    apartment_number: row.apartment_number,
    phone_number: row.phone,
    extra_info: row.extra_info,
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    fav: row.fav,
  };
}

export async function fetchAddress(ctx: Ctx): Promise<NextResponse> {
  const rows = await db
    .selectFrom('app_addresses')
    .selectAll()
    .where('customer_id', '=', ctx.customer!.id)
    .where('deleted_at', 'is', null)
    .orderBy('fav', 'desc')
    .orderBy('created_at', 'desc')
    .execute();
  return success('', { data: rows.map(addressJson) });
}

export async function addAddress(ctx: Ctx): Promise<NextResponse> {
  const { input, lang } = ctx;
  const me = ctx.customer!;
  const street = text(input.street_name);
  const building = text(input.bulding_number) || text(input.building_number);
  const phone = normalizePhone(input.phone_number) || me.phone;
  const lat = text(input.latitude);
  const lng = text(input.longitude);
  const errors: Record<string, string> = {};
  if (street.length < 2) errors.street_name = t(lang, 'اسم الشارع مطلوب', 'Street is required');
  if (!building) errors.bulding_number = t(lang, 'رقم المبنى مطلوب', 'Building number is required');
  if (!EGYPT_MOBILE.test(phone)) errors.phone_number = t(lang, 'رقم موبايل مصري غير صحيح', 'Enter a valid Egyptian mobile number');
  const latNum = lat ? Number.parseFloat(lat) : null;
  const lngNum = lng ? Number.parseFloat(lng) : null;
  if ((latNum !== null && (!Number.isFinite(latNum) || Math.abs(latNum) > 90)) || (lngNum !== null && (!Number.isFinite(lngNum) || Math.abs(lngNum) > 180))) {
    errors.latitude = t(lang, 'الموقع غير صحيح', 'Invalid position');
  }
  if (Object.keys(errors).length) return invalid(errors, lang);

  const count = Number(
    (await db
      .selectFrom('app_addresses')
      .select(sql<number>`COUNT(*)`.as('n'))
      .where('customer_id', '=', me.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst())?.n ?? 0,
  );
  if (count >= 20) return failure(409, t(lang, 'وصلت للحد الأقصى من العناوين', 'Address limit reached'));

  const id = randomUUID();
  await db
    .insertInto('app_addresses')
    .values({
      id,
      customer_id: me.id,
      client_name: [me.first_name, me.second_name].filter(Boolean).join(' ').slice(0, 255),
      street_name: street.slice(0, 255),
      building_number: building.slice(0, 64),
      floor: text(input.floor).slice(0, 32),
      apartment_number: text(input.apartment_number).slice(0, 32),
      phone,
      extra_info: text(input.extra_info).slice(0, 1000),
      latitude: latNum === null ? null : latNum.toFixed(7),
      longitude: lngNum === null ? null : lngNum.toFixed(7),
      fav: count === 0 ? 1 : 0,
    })
    .execute();
  const row = await db.selectFrom('app_addresses').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return success(t(lang, 'تم حفظ العنوان', 'Address saved'), { data: addressJson(row) });
}
