/**
 * `GET|PATCH /api/console/hero` — the slider document.
 *
 * The write is one document, not a row: the screen reorders, adds and removes slides in
 * one list, and saving them separately would let a half-applied list reach the homepage.
 * `page.update` is the grant because a slide is the home page's own presentation — the
 * roles that may rewrite that page may change its photographs.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { normalizeHeroDocument, validateHero } from './types';
import { readHeroDocument, saveHeroDocument } from './store';

function revalidateSite(): void {
  try {
    revalidatePath('/[lang]', 'layout');
  } catch {
    /* outside a request (direct handler calls in tests) there is no cache to clear */
  }
}

const heroSchema = z.object({
  slides: z.array(z.unknown()).max(50),
  settings: z.unknown().optional(),
});

export async function heroHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'page', action: 'read' }, async () => ({ data: await readHeroDocument() }));
  }

  if (req.method !== 'PATCH' && req.method !== 'PUT') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof heroSchema>, unknown>(
    req,
    { resource: 'page', action: 'update', schema: heroSchema },
    async (ctx): Promise<GuardResult<unknown>> => {
      const document = normalizeHeroDocument({ slides: ctx.input.slides, settings: ctx.input.settings });
      const issues = validateHero(document);
      if (issues.length > 0) return { status: 422, data: { error: 'invalid_input', issues } };

      const before = await readHeroDocument();
      await saveHeroDocument(document, ctx.auth.user.id);
      revalidateSite();

      const after = await readHeroDocument();
      return {
        data: after,
        audit: {
          entityType: 'page',
          entityId: 'home.hero',
          before,
          after,
        },
      };
    },
  );
}
