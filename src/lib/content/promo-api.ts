/**
 * `GET` / `PATCH /api/console/promo` — the announcement line and the exit prompt.
 *
 * Guarded by the `integration` grant, the Marketing screen's own: the Marketer runs
 * campaigns without holding the rest of Settings. The body is normalized before it is
 * stored, so a hand-built request cannot save a `javascript:` link or a two-hour delay.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, jsonError } from '../auth/guard';
import { getPromo } from './brand';
import { PROMO_GROUP, PROMO_KEY, normalizePromo } from './promo-shape';
import { writeSetting } from './settings';

const promoSchema = z.object({ promo: z.record(z.string(), z.unknown()) });

export async function promoHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'integration', action: 'read' }, async () => ({ data: { promo: await getPromo() } }));
  }
  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');
  return guard<z.output<typeof promoSchema>, { promo?: unknown; error?: string }>(
    req,
    { resource: 'integration', action: 'update', schema: promoSchema },
    async (ctx) => {
      const promo = normalizePromo(ctx.input.promo);
      const saved = await writeSetting({ group: PROMO_GROUP, key: PROMO_KEY, value: promo, actorId: ctx.auth.user.id });
      if (!saved.ok) return { status: saved.status, data: { error: saved.code }, audit: false };
      try {
        revalidatePath('/[lang]', 'layout');
      } catch {
        /* no request scope */
      }
      return { data: { promo }, audit: { entityType: 'promo', entityId: 'marketing.promo', after: promo } };
    },
  );
}
