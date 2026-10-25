/**
 * Where an uploaded picture goes: bytes → disk → `media` row → the URL the site uses.
 *
 * Two properties the rest of the console depends on:
 *
 *   1. The file name is derived from the content hash, never from what the browser called
 *      it. Two uploads of the same photo are one file on disk and one row, so an editor
 *      who re-sends a banner cannot accumulate `banner-2.webp`, `banner-3.webp` beside it.
 *   2. The extension and MIME come from the bytes (`inspectImage`), so a file named
 *      `photo.jpg` that is really a PNG is stored as a PNG, and a file that is really
 *      markup is never written at all.
 *
 * The file is written before the row: a row pointing at a missing picture renders a broken
 * image site-wide, while an orphan file on disk is invisible and is what a re-upload of the
 * same bytes reclaims.
 */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { db } from '../db';
import type { StoreResult } from '../content/store';
import { inspectImage, type ImageInfo } from './image-info';

/** The console resizes before it sends, so this only has to catch a resized-too-large or a hand-made request. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface StoredMedia {
  id: string;
  /** Root-relative URL the content column stores, e.g. `/uploads/202610/3f2a1c9d0b74.webp`. */
  src: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  /** The bytes were already on disk under this name; nothing new was stored. */
  reused: boolean;
}

export interface UploadInput {
  bytes: Uint8Array;
  /** The name the person chose, used only as the display `filename` after sanitising. */
  filename: string;
  altAr?: string;
  altEn?: string;
  actorId?: string;
}

/**
 * Where pictures are written. Defaults to the app's `public/`, which is what the site
 * serves; `MEDIA_ROOT` moves it onto a path a deploy does not wipe, which is what a cPanel
 * host needs when `public_html` is replaced on each push. Tests point it at a temporary
 * folder so a unit run cannot leave files in the repo.
 */
export function mediaRoot(): string {
  const configured = (process.env.MEDIA_ROOT ?? '').trim();
  return configured ? resolve(configured) : join(process.cwd(), 'public');
}

export interface UploadOptions {
  root?: string;
  now?: Date;
}

/** A month folder keeps one directory from holding the whole library. */
function monthSegment(at: Date): string {
  return `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A display name, not a path. Anything that could escape the uploads folder or read as
 * markup is gone; the length matches the column.
 */
function displayName(filename: string, info: ImageInfo): string {
  const base = basename(filename.replace(/\\/g, '/'))
    .replace(/[^\p{L}\p{N}._ -]/gu, '')
    .replace(/^\.+/, '')
    .slice(0, 200);
  const head = base.replace(/\.[a-z0-9]+$/i, '') || 'image';
  return `${head}.${info.ext}`.slice(0, 255);
}

export async function putUpload(input: UploadInput, options: UploadOptions = {}): Promise<StoreResult<StoredMedia>> {
  const root = options.root ?? mediaRoot();
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, code: 'too_large', issues: [{ path: 'data', message: `${input.bytes.length} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit` }] };
  }
  const seen = inspectImage(input.bytes);
  if (!seen.ok) {
    return { ok: false, status: 400, code: `not_an_image_${seen.reason}`, issues: [{ path: 'data', message: seen.reason }] };
  }
  const info = seen.info;
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  const existing = await db
    .selectFrom('media')
    .select(['id', 'path', 'filename', 'mime', 'width', 'height', 'size_bytes'])
    .where('sha256', '=', sha256)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();

  // Those bytes are already in the library: keep that row and its address, so a re-upload
  // updates nothing. If the file itself is gone — a fresh deploy that shipped the database
  // but not `public/uploads/` — the bytes in hand restore it at the address content already
  // points to, which is the only address the site can be asked for.
  if (existing && existing.path.startsWith('/uploads/')) {
    await writeAt(root, existing.path, input.bytes);
    await db.updateTable('media').set({ updated_by: input.actorId ?? null }).where('id', '=', existing.id).execute();
    return {
      ok: true,
      value: {
        id: existing.id,
        src: existing.path,
        filename: existing.filename,
        mime: existing.mime,
        width: existing.width,
        height: existing.height,
        bytes: Number(existing.size_bytes),
        sha256,
        reused: true,
      },
    };
  }

  const src = `/uploads/${monthSegment(options.now ?? new Date())}/${sha256.slice(0, 12)}.${info.ext}`;
  try {
    await writeAt(root, src, input.bytes);
  } catch {
    return { ok: false, status: 500, code: 'write_failed', issues: [{ path: 'data', message: 'the uploads folder is not writable' }] };
  }

  const filename = displayName(input.filename, info);
  const id = randomUUID();
  await db
    .insertInto('media')
    .values({
      id,
      path: src,
      filename,
      mime: info.mime,
      width: info.width,
      height: info.height,
      size_bytes: input.bytes.length,
      sha256,
      alt_ar: input.altAr ?? '',
      alt_en: input.altEn ?? '',
      folder_id: null,
      legacy_url: null,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .execute();

  return { ok: true, value: { id, src, filename, mime: info.mime, width: info.width, height: info.height, bytes: input.bytes.length, sha256, reused: false } };
}

/** The alt text an editor typed after the fact, for a picture already in the library. */
export async function setAlt(id: string, altAr: string, altEn: string, actorId: string): Promise<boolean> {
  const updated = await db
    .updateTable('media')
    .set({ alt_ar: altAr, alt_en: altEn, updated_by: actorId })
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(updated.numUpdatedRows) > 0;
}

/** A root-relative address never escapes the folder it is resolved against. */
function resolveUnder(root: string, src: string): string {
  const absolute = join(root, src);
  if (absolute !== join(root) && !absolute.startsWith(join(root) + '/') && !absolute.startsWith(join(root) + '\\')) {
    throw new Error('path_escape');
  }
  return absolute;
}

async function writeAt(root: string, src: string, bytes: Uint8Array): Promise<void> {
  const absolute = resolveUnder(root, src);
  await mkdir(join(absolute, '..'), { recursive: true });
  // `flag: 'w'` on an existing file rewrites it with the same bytes; that is the restore case.
  await writeFile(absolute, bytes);
}
