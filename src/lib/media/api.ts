/**
 * The media API: a file goes in as a multipart upload, a URL comes out.
 *
 * `POST /api/console/media` is the only way an image enters the site. Nothing in the
 * console asks a person to type a path — a typed path is a broken image waiting to happen
 * and, if it pointed somewhere else, a request the site would make on a client's behalf.
 * The browser shrinks the photo before sending it (see `src/lib/console/compress.ts`); this
 * handler re-checks the bytes because the browser is not the authority on what it uploaded,
 * and `putUpload` re-encodes them so no metadata the camera embedded survives.
 *
 * The file is read **after** `guard()` has authenticated, checked the CSRF header and
 * confirmed `media.create`: an anonymous caller cannot make the server buffer an 8 MB body.
 *
 * `GET /api/console/media` answers two things the picker needs: the newest pictures, and
 * whether a URL the content already holds belongs to a stored file (so it can show a name).
 */
import { z } from 'zod';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { db } from '../db';
import { putUpload, setAlt, thumbOf, type StoredMedia } from './store';

type Body = Record<string, unknown>;

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  /** The bytes as the browser sent them; the format is decided in `putUpload`, not here. */
  bytes: z.instanceof(Uint8Array),
  altAr: z.string().trim().max(500).default(''),
  altEn: z.string().trim().max(500).default(''),
});

const altSchema = z.object({
  alt: z.object({ ar: z.string().trim().max(500).default(''), en: z.string().trim().max(500).default('') }).strict(),
});

const listSchema = z.object({ limit: z.number().int().min(1).max(100) });

/**
 * The form as the schema above describes it.
 *
 * A request that is not multipart (or is cut off mid-file) throws here and is answered as
 * `invalid_input` by the schema, which is the same answer any other malformed body gets.
 */
async function multipart(req: Request): Promise<unknown> {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return {};
    return {
      filename: file.name || 'image',
      bytes: new Uint8Array(await file.arrayBuffer()),
      altAr: field(form, 'altAr'),
      altEn: field(form, 'altEn'),
    };
  } catch {
    return {};
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** `GET/POST /api/console/media`, `PATCH /api/console/media/<id>` */
export async function mediaHandler(req: Request): Promise<Response> {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const index = parts.lastIndexOf('media');
  const id = index === -1 ? undefined : parts.slice(index + 1)[0];
  if (id) return patchAltHandler(req, id);
  if (req.method === 'GET') return listHandler(req);
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof uploadSchema>, Body>(
    req,
    { resource: 'media', action: 'create', schema: uploadSchema, inputFrom: multipart },
    async (ctx): Promise<GuardResult<Body>> => {
      const stored = await putUpload({
        bytes: ctx.input.bytes,
        filename: ctx.input.filename,
        altAr: ctx.input.altAr,
        altEn: ctx.input.altEn,
        actorId: ctx.auth.user.id,
      });
      if (!stored.ok) return { status: stored.status, data: { error: stored.code, ...(stored.issues ? { issues: stored.issues } : {}) } };
      return {
        data: { media: stored.value },
        audit: {
          entityType: 'media',
          entityId: stored.value.id,
          after: stored.value.reused ? { reused: stored.value.src } : { path: stored.value.src, bytes: stored.value.bytes },
        },
      };
    },
  );
}

/** `PATCH /api/console/media/<id>` — the alt text of a picture already in the library. */
async function patchAltHandler(req: Request, id: string): Promise<Response> {
  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');
  return guard<z.output<typeof altSchema>, Body>(req, { resource: 'media', action: 'update', schema: altSchema }, async (ctx): Promise<GuardResult<Body>> => {
    const before = await db.selectFrom('media').select(['alt_ar', 'alt_en']).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
    if (!before) return { status: 404, data: { error: 'not_found' } };
    const done = await setAlt(id, ctx.input.alt.ar, ctx.input.alt.en, ctx.auth.user.id);
    if (!done) return { status: 409, data: { error: 'update_failed' } };
    return { data: { ok: true }, audit: { entityType: 'media', entityId: id, before, after: ctx.input.alt } };
  });
}

async function listHandler(req: Request): Promise<Response> {
  return guard<{ limit: number }, Body>(
    req,
    {
      resource: 'media',
      action: 'read',
      // The limit comes from the query line, like every other scope: `inputFrom` is the
      // only source, so a body cannot ask for a page the URL did not.
      schema: listSchema,
      inputFrom: (r) => ({ limit: clampLimit(new URL(r.url).searchParams.get('limit')) }),
    },
    async (ctx): Promise<GuardResult<Body>> => {
      const rows = await db
        .selectFrom('media')
        .select(['id', 'path', 'filename', 'mime', 'width', 'height', 'size_bytes', 'alt_ar', 'alt_en'])
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc')
        .limit(ctx.input.limit)
        .execute();
      return { data: { items: rows.map(readonly) } };
    },
  );
}

function readonly(row: {
  id: string;
  path: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  size_bytes: number | string;
  alt_ar: string;
  alt_en: string;
}): Omit<StoredMedia, 'sha256' | 'reused' | 'originalBytes'> & { alt: { ar: string; en: string } } {
  // The row keeps the size of the stored file, not of the upload it came from, so there is
  // no original-byte figure to report here.
  return {
    id: row.id,
    src: row.path,
    thumb: thumbOf(row.path),
    filename: row.filename,
    mime: row.mime,
    width: row.width,
    height: row.height,
    bytes: Number(row.size_bytes),
    alt: { ar: row.alt_ar, en: row.alt_en },
  };
}

function clampLimit(value: string | null): number {
  const wanted = Number(value ?? 24);
  if (!Number.isFinite(wanted) || wanted < 1) return 24;
  return Math.min(Math.trunc(wanted), 100);
}
