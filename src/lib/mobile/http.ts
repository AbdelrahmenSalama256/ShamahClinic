/**
 * Transport for the mobile app API (`/api/mobile/*`).
 *
 * The Flutter client (D:\shamah_app, `lib/core/networking`) was written against a
 * Laravel-style backend, so this module speaks that dialect exactly:
 *
 *  - every call carries `api_password` as a plain field — in the JSON body for POST,
 *    in the query string for GET — and a wrong one is answered `401
 *    {"message":"Unauthenticated."}`, which the client already maps to a 401;
 *  - a signed-in call carries `Authorization: Bearer <token>`;
 *  - every answer is the envelope `{success, status, message, data}`, with the few
 *    top-level extras the client reads (`token`, `user`, `booking_code`);
 *  - a validation failure is `422 {success:false, status:422, message, error:{field:[msg]}}`
 *    so the form can put the message under the field it belongs to.
 */
import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/auth/tokens';

export type Lang = 'ar' | 'en';
export type Input = Record<string, unknown>;

const NO_STORE = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Accept-Language',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export function reply(
  body: Record<string, unknown>,
  status = 200,
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function success(message: string, extra: Record<string, unknown> = {}): NextResponse {
  return reply({ success: true, status: 200, message, ...extra });
}

export function failure(status: number, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return reply({ success: false, status, message, ...extra }, status);
}

export function invalid(errors: Record<string, string>, lang: Lang): NextResponse {
  const first = Object.values(errors)[0] ?? (lang === 'ar' ? 'البيانات غير صحيحة' : 'Invalid input');
  const error: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors)) error[key] = [value];
  return failure(422, first, { error });
}

export function unauthenticated(): NextResponse {
  return reply({ message: 'Unauthenticated.' }, 401);
}

/** Body (JSON or form) merged over the query string; the body wins. */
export async function readInput(req: Request): Promise<Input> {
  const url = new URL(req.url);
  const input: Input = {};
  for (const [key, value] of url.searchParams) input[key] = value;
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? '';
    try {
      if (type.includes('application/json')) {
        const body = (await req.json()) as unknown;
        if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(input, body);
      } else if (type.includes('form')) {
        const form = await req.formData();
        for (const [key, value] of form) if (typeof value === 'string') input[key] = value;
      }
    } catch {
      // An unreadable body is an empty one; validation names what is missing.
    }
  }
  return input;
}

export function langOf(req: Request, input: Input): Lang {
  const asked = text(input.lang);
  if (asked === 'en' || asked === 'ar') return asked;
  const header = (req.headers.get('accept-language') ?? '').toLowerCase();
  return header.startsWith('en') ? 'en' : 'ar';
}

/**
 * The shared secret every build of the app is compiled with. Not a user credential:
 * it keeps casual scrapers off the endpoints. Unset means the API is closed.
 */
export function apiPasswordOk(input: Input): boolean {
  const expected = (process.env.MOBILE_API_PASSWORD ?? '').trim();
  if (!expected) return false;
  return safeEqual(text(input.api_password), expected);
}

export function bearerOf(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

export function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** Arabic-Indic digits to Latin, spaces/dashes dropped, +20 / 0020 folded to a leading 0. */
export function normalizePhone(raw: unknown): string {
  let value = text(raw).replace(/[\s\-()]/g, '');
  value = value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  value = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (value.startsWith('+20')) value = `0${value.slice(3)}`;
  else if (value.startsWith('0020')) value = `0${value.slice(4)}`;
  else if (/^201\d{9}$/.test(value)) value = `0${value.slice(2)}`;
  return value;
}

export const EGYPT_MOBILE = /^01[0125]\d{8}$/;

export function clientIpOf(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'local';
}

// --- in-memory throttle (the app runs as one process; see docs/SELF-HOSTED.md) ---
const buckets = new Map<string, number[]>();

export function throttled(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  }
  return hits.length > max;
}

export function resetThrottleForTests(): void {
  buckets.clear();
}
