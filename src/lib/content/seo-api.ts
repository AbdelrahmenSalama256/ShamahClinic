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
import { getSeoConfig, saveSeoConfig } from './seo-config';
import { safeImageRef } from './seo-config-shape';

const seoSchema = z.object({
  path: z
    .string()
    .max(191)
    .refine(isSeoPath, { message: 'invalid_path' }),
  locale: z.enum(['ar', 'en']),
  title: z.string().max(500),
  description: z.string().max(1000),
  // The fields past the search pair are optional: a caller that leaves one out keeps the
  // stored value, so the SEO center's two-field table cannot wipe a share image.
  focusKeyword: z.string().max(191).optional(),
  ogTitle: z.string().max(500).optional(),
  ogDescription: z.string().max(1000).optional(),
  ogImage: z
    .string()
    .max(512)
    .refine((value) => value.trim() === '' || safeImageRef(value) !== '', { message: 'invalid_image' })
    .optional(),
  canonical: z
    .string()
    .max(512)
    .refine((value) => value.trim() === '' || /^https?:\/\//i.test(value.trim()) || /^\/(?!\/)/.test(value.trim()), {
      message: 'invalid_canonical',
    })
    .optional(),
  noindex: z.boolean().optional(),
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
        focusKeyword: ctx.input.focusKeyword,
        ogTitle: ctx.input.ogTitle,
        ogDescription: ctx.input.ogDescription,
        ogImage: ctx.input.ogImage,
        canonical: ctx.input.canonical,
        noindex: ctx.input.noindex,
        actorId: ctx.auth.user.id,
      });
      if (ctx.input.noindex !== undefined) revalidateSitemap();
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

function revalidateSitemap(): void {
  try {
    revalidatePath('/sitemap.xml', 'page');
  } catch {
    /* no request scope */
  }
}

const seoConfigSchema = z.object({ config: z.record(z.string(), z.unknown()) });

/**
 * `GET` / `PATCH /api/console/seo/config`: the site-wide SEO settings. Guarded by the `seo`
 * grant, not `setting`: the SEO role owns these switches without owning the clinic's
 * phone number. Every key is re-validated by `normalizeSeoConfig`, so a hand-built body
 * can only ever store a well-formed document.
 */
export async function seoConfigHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'seo', action: 'read' }, async () => ({ data: { config: await getSeoConfig() } }));
  }
  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof seoConfigSchema>, { config?: unknown; error?: string }>(
    req,
    { resource: 'seo', action: 'update', schema: seoConfigSchema },
    async (ctx) => {
      const saved = await saveSeoConfig(ctx.input.config, ctx.auth.user.id);
      if (!saved) return { status: 500, data: { error: 'write_failed' }, audit: false };
      try {
        revalidatePath('/[lang]', 'layout');
        revalidatePath('/sitemap.xml', 'page');
        revalidatePath('/robots.txt', 'page');
      } catch {
        /* no request scope */
      }
      return { data: { config: saved }, audit: { entityType: 'seo', entityId: 'config', after: saved } };
    },
  );
}
