/**
 * The mobile app's API: `https://<site>/api/mobile/<endpoint>`.
 *
 * The app is built with `--dart-define=SHAMAH_API_BASE_URL=https://<site>/api/mobile/`
 * and `--dart-define=SHAMAH_API_PASSWORD=<MOBILE_API_PASSWORD>`. Endpoint names are
 * the app's own (`lib/core/networking/api_endpoints.dart`); docs/MOBILE-API.md lists
 * every one with its keys.
 */
import type { NextResponse } from 'next/server';
import { customerForToken } from '@/lib/mobile/accounts';
import * as h from '@/lib/mobile/handlers';
import {
  apiPasswordOk,
  bearerOf,
  corsPreflight,
  failure,
  langOf,
  readInput,
  unauthenticated,
} from '@/lib/mobile/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Handler = (ctx: h.Ctx) => Promise<NextResponse>;
interface Route {
  method: 'GET' | 'POST' | 'ANY';
  auth: boolean;
  run: Handler;
}

const ROUTES: Record<string, Route> = {
  login: { method: 'POST', auth: false, run: h.login },
  register: { method: 'POST', auth: false, run: h.register },
  logout: { method: 'POST', auth: true, run: h.logout },
  fetch_user: { method: 'ANY', auth: true, run: h.fetchUser },
  update_user: { method: 'POST', auth: true, run: h.updateUser },
  fetch_loyalty_program: { method: 'ANY', auth: true, run: h.loyalty },
  contactus: { method: 'POST', auth: true, run: h.contactUs },
  'booking/store': { method: 'POST', auth: true, run: h.bookingStore },
  'booking/list': { method: 'ANY', auth: true, run: h.bookingList },
  'booking/show': { method: 'ANY', auth: true, run: h.bookingShow },
  'booking/canceled': { method: 'POST', auth: true, run: h.bookingCancel },
  fetch_all_branches: { method: 'ANY', auth: false, run: h.allBranches },
  fetch_nearby_stores_branches_long_lat: { method: 'ANY', auth: false, run: h.nearbyBranches },
  add_or_remove_favourite_product: { method: 'POST', auth: true, run: h.favouriteToggle },
  all_favourite_products: { method: 'ANY', auth: true, run: h.favouriteList },
  fetch_address: { method: 'ANY', auth: true, run: h.fetchAddress },
  add_address: { method: 'POST', auth: true, run: h.addAddress },
};

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await ctx.params;
  const name = path.map((part) => decodeURIComponent(part)).join('/').replace(/\/+$/, '');
  const input = await readInput(req);
  const lang = langOf(req, input);

  if (name === 'health') {
    return h.health();
  }

  const route = ROUTES[name];
  if (!route) return failure(404, lang === 'ar' ? 'المسار غير موجود' : 'Endpoint not found');
  if (route.method !== 'ANY' && route.method !== req.method) {
    return failure(405, `Use ${route.method} for ${name}`);
  }
  if (!apiPasswordOk(input)) return unauthenticated();

  const token = bearerOf(req);
  const customer = token ? await customerForToken(token) : null;
  if (route.auth && !customer) return unauthenticated();

  try {
    return await route.run({ req, input, lang, token, customer });
  } catch (error) {
    console.error(`[mobile] ${name} failed:`, error instanceof Error ? error.message : error);
    return failure(500, lang === 'ar' ? 'حدث خطأ في الخادم، حاول مرة أخرى' : 'Server error, please try again');
  }
}

export const GET = handle;
export const POST = handle;
export function OPTIONS() {
  return corsPreflight();
}
