/**
 * The media API: a picture goes in as bytes, a URL comes out.
 *
 * `POST /api/console/media` is the only way an image enters the site. Nothing in the
 * console asks a person to type a path — a typed path is a broken image waiting to happen
 * and, if it pointed somewhere else, a request the site would make on a client's behalf.
 * The browser has already resized and compressed the file (see `src/lib/console/compress.ts`);
 * this handler re-checks the bytes it was sent, because the browser is not the authority on
 * what it uploaded.
 *
 * `GET /api/console/media` answers two things the picker needs: the newest pictures, and
 * whether a URL the content already holds belongs to a stored file (so it can show a name).
 */
import { z } from 'zod';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { db } from '../db';
import { MAX_UPLOAD_BYTES, putUpload, setAlt, type StoredMedia } from './store';

type Body = Record<string, unknown>;

/** base64 grows the payload by a third; the decoded ceiling is what the store enforces. */
const MAX_ENCODED_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4;

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  data: z.string().min(16).max(MAX_ENCODED_CHARS),
  alt: z
    .object({ ar: z.string().trim().max(500).default(''), en: z.string().trim().max(500).default('') })
    .strict()
    .default({ ar: '', en: '' }),
});

const altSchema = z.object({
  alt: z.object({ ar: z.string().trim().max(500).default(''), en: z.string().trim().max(500).default('') }).strict(),
});

/** A strict alphabet: `Buffer.from(…, 'base64')` throws away characters it does not understand. */
const BASE64 = /^[A-Za-z0-9+/\r\n]+=*$/;

const listSchema = z.object({ limit: z.number().int().min(1).max(100) });

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
    { resource: 'media', action: 'create', schema: uploadSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      if (!BASE64.test(ctx.input.data)) {
        return { status: 400, data: { error: 'invalid_base64' } };
      }
      const bytes = new Uint8Array(Buffer.from(ctx.input.data.replace(/[\r\n]/g, ''), 'base64'));
      const stored = await putUpload({
        bytes,
        filename: ctx.input.filename,
        altAr: ctx.input.alt.ar,
        altEn: ctx.input.alt.en,
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
}): Omit<StoredMedia, 'sha256' | 'reused'> & { alt: { ar: string; en: string } } {
  return {
    id: row.id,
    src: row.path,
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
