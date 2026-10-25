/**
 * One guarded write for the SEO screen and the panel inside every entity page.
 *
 * The address and the language are in the body, not the URL, because both surfaces are
 * one POST away from the same record; the permission is the `seo` grant, not a content
 * grant, so a person who may fix a title does not thereby gain write access to the
 * article it describes. `guard()` decides that before it parses a character of the body.
 *
 * A saved record takes effect on the next request. The public routes are ISR, so the
 * handler also names the concrete page that changed; the five-minute window on the
 * remaining routes is the same one every other content edit already has.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, jsonError } from '../auth/guard';
import { localizedPath } from './paths';
import { isSeoPath, saveSeoOverride } from './seo';

const seoSchema = z.object({
  path: z
    .string()
    .max(191)
    .refine(isSeoPath, { message: 'invalid_path' }),
  locale: z.enum(['ar', 'en']),
  title: z.string().max(500),
  description: z.string().max(1000),
});

type SeoInput = z.output<typeof seoSchema>;

function revalidateSeo(path: string, locale: 'ar' | 'en'): void {
  try {
    revalidatePath(localizedPath(path, locale));
    if (path === '') revalidatePath('/');
  } catch {
    /* no request scope (unit tests call the handler directly) */
  }
}

export async function seoHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<SeoInput, { override: unknown }>(
    req,
    { resource: 'seo', action: 'update', schema: seoSchema },
    async (ctx) => {
      const saved = await saveSeoOverride({
        path: ctx.input.path,
        locale: ctx.input.locale,
        title: ctx.input.title,
        description: ctx.input.description,
        actorId: ctx.auth.user.id,
      });
      revalidateSeo(ctx.input.path, ctx.input.locale);
      return {
        data: { override: saved },
        audit: {
          entityType: 'seo',
          entityId: `${ctx.input.path || '/'}#${ctx.input.locale}`,
          after: saved,
        },
      };
    },
  );
}
