/**
 * The console's mobile-app screen:
 *   GET   /api/console/app?status=&q=&scope=upcoming|all     bookings + patients
 *   PATCH /api/console/app/bookings/<id>    { status?, note?, price? }
 *   POST  /api/console/app/customers/<id>/points   { points, note }
 *   PATCH /api/console/app/customers/<id>   { blocked }
 */
import { z } from 'zod';
import { guard, type GuardResult } from '@/lib/auth/guard';
import { adjustPoints, appOverview, BOOKING_STATUS_CODES, redactOverview, setCustomerBlocked, updateBooking } from '@/lib/mobile/console';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = Record<string, unknown>;

function segments(req: Request): string[] {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts.slice(parts.indexOf('app') + 1);
}

export async function GET(req: Request): Promise<Response> {
  return guard(req, { resource: 'lead', action: 'read' }, async (ctx): Promise<GuardResult<Body>> => {
    const url = new URL(req.url);
    const status = Number(url.searchParams.get('status'));
    const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'upcoming';
    const data = await appOverview({
      status: BOOKING_STATUS_CODES.includes(status) ? status : null,
      q: url.searchParams.get('q') ?? '',
      scope,
    });
    return { data: redactOverview(data, ctx.auth.user.grants) as unknown as Body };
  });
}

const bookingPatch = z.object({
  status: z.number().int().refine((v) => BOOKING_STATUS_CODES.includes(v)).optional(),
  note: z.string().max(1000).optional(),
  price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).nullable().optional(),
});

const customerPatch = z.object({ blocked: z.boolean() });
const pointsPost = z.object({ points: z.number().int().min(-100000).max(100000).refine((v) => v !== 0), note: z.string().max(500).default('') });

export async function PATCH(req: Request): Promise<Response> {
  const [kind, id] = segments(req);
  if (kind === 'bookings' && id) {
    return guard(req, { resource: 'lead', action: 'update', schema: bookingPatch }, async (ctx): Promise<GuardResult<Body>> => {
      const result = await updateBooking(id, ctx.input, ctx.auth.user.id);
      if (!result) return { status: 404, data: { error: 'not_found' } };
      return { data: { ok: true, ...result.after }, audit: { entityType: 'app_booking', entityId: id, before: result.before, after: result.after } };
    });
  }
  if (kind === 'customers' && id) {
    return guard(req, { resource: 'lead', action: 'update', schema: customerPatch }, async (ctx): Promise<GuardResult<Body>> => {
      const ok = await setCustomerBlocked(id, ctx.input.blocked);
      if (!ok) return { status: 404, data: { error: 'not_found' } };
      return { data: { ok: true }, audit: { entityType: 'app_customer', entityId: id, after: { blocked: ctx.input.blocked } } };
    });
  }
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
}

export async function POST(req: Request): Promise<Response> {
  const [kind, id, action] = segments(req);
  if (kind === 'customers' && id && action === 'points') {
    return guard(req, { resource: 'lead', action: 'update', schema: pointsPost }, async (ctx): Promise<GuardResult<Body>> => {
      const ok = await adjustPoints(id, ctx.input.points, ctx.input.note, ctx.auth.user.id);
      if (!ok) return { status: 404, data: { error: 'not_found' } };
      return { data: { ok: true }, audit: { entityType: 'app_customer', entityId: id, after: { points: ctx.input.points, note: ctx.input.note } } };
    });
  }
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
}
