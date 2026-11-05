/**
 * The one write behind every "change this sentence" on the texts screen.
 *
 * The address is in the body and the language is in the request line, which is the same
 * split every other guarded route uses: `guard()` decides the permission before it parses
 * a character of JSON, so the locale a caller may write cannot be chosen by editing the
 * payload. The resource is `page`, because that is the grant an owner or an editor already
 * holds for the copy of a page — a `copy` resource would mean a new grant in six role
 * definitions for something that is the same act as fixing a page title.
 *
 * A body that names an address the catalog does not contain is refused, with one
 * exception: an empty value. Clearing an override that belongs to wording a developer has
 * since changed is the only way a stranded row gets removed, and refusing it would leave a
 * person staring at a sentence they cannot turn off.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, jsonError } from '../auth/guard';
import { isContentLocale, type ContentLocale } from '../content/kinds';
import { COPY_KEY_PATTERN } from './shared';
import { COPY_BY_KEY } from './catalog';
import { clearCopyOverride, saveCopyOverride, type CopyStored } from './store';

const copySchema = z.object({
  key: z.string().regex(COPY_KEY_PATTERN),
  /** Empty means "say the site's own words again", not "store the empty string". */
  value: z.string().max(4000),
});

type CopyInput = z.output<typeof copySchema>;

/** A rejected request answers with a code and nothing else, the same shape every other
 *  guarded route uses; a written one answers with both languages now stored. */
type CopyBody = { stored?: CopyStored; error?: string };

/** The `[lang]` layout covers every page that renders copy, at both languages. */
function revalidateSite(): void {
  try {
    revalidatePath('/[lang]', 'layout');
  } catch {
    /* no request scope (unit tests call the handler directly) */
  }
}

function localeOf(req: Request): ContentLocale | null {
  const value = new URL(req.url).searchParams.get('locale');
  return value && isContentLocale(value) ? value : null;
}

export async function copyHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  // The scope comes from the URL. A request line that does not name a language names a
  // scope no grant matches, so it is answered 403 before the body is read.
  const locale = localeOf(req);

  return guard<CopyInput, CopyBody>(
    req,
    {
      resource: 'page',
      action: 'update',
      schema: copySchema,
      target: locale ? { locales: locale } : {},
    },
    async (ctx) => {
      if (!locale) return { status: 400, data: { error: 'locale_required' } };

      const entry = COPY_BY_KEY.get(ctx.input.key);
      if (!entry) {
        if (ctx.input.value.trim() !== '') return { status: 400, data: { error: 'unknown_key' } };
        const stored = await clearCopyOverride({ key: ctx.input.key, locale, actorId: ctx.auth.user.id });
        revalidateSite();
        return {
          data: { stored },
          audit: { entityType: 'copy', entityId: `${ctx.input.key}#${locale}`, after: stored },
        };
      }

      const stored = await saveCopyOverride({
        entry,
        locale,
        value: ctx.input.value,
        actorId: ctx.auth.user.id,
      });
      revalidateSite();
      return {
        data: { stored },
        audit: {
          entityType: 'copy',
          entityId: `${ctx.input.key}#${locale}`,
          before: { ar: entry.ar, en: entry.en },
          after: stored,
        },
      };
    },
  );
}
