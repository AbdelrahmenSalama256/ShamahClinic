/**
 * Bytes → the image the site serves → a `media` row → the address a picture field holds.
 *
 * Everything an uploaded photograph passes through happens here, once, so no caller can
 * skip a step:
 *
 *   1. The size is capped and the bytes are identified from their **magic bytes**, not from
 *      the name or the browser's `Content-Type`. JPEG, PNG, WebP and AVIF only.
 *   2. sharp decodes the file — which is the real structural check — applies the EXIF
 *      orientation and re-encodes it. Re-encoding is what strips EXIF: camera model, GPS
 *      coordinates and the thumbnail a phone embeds all leave the file here.
 *   3. Two sizes are written, 2000 px and 640 px on the long edge, as WebP.
 *   4. The file name is a content hash plus a random id, so it cannot be guessed, cannot
 *      collide, and says nothing about the person who uploaded it.
 *   5. Only then is the `media` row written, so a failed write cannot leave content
 *      pointing at a missing picture.
 *
 * `sha256` is of the **original** bytes, which is what makes a re-upload of the same photo
 * one row instead of `banner-2.webp` beside `banner.webp`.
 */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { db } from '../db';
import type { StoreResult } from '../content/store';
import { MAX_IMAGE_EDGE, inspectImage, type ImageInfo } from './image-info';
import { mediaDriver, mediaRoot, writeMediaObject } from './storage';

/** The browser shrinks before it sends, so this catches a hand-made request rather than a phone photo. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The long edge of the file the site actually serves. */
export const MAIN_EDGE = 2_000;
/** The long edge of the card/thumbnail file. */
export const THUMB_EDGE = 640;

export interface StoredMedia {
  id: string;
  /** The address content stores: `/uploads/…` on a local driver, an absolute Blob URL otherwise. */
  src: string;
  /** The 640 px companion, derived from `src`, for lists and cards. */
  thumb: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  /** Size of the file the person chose, before the server re-encoded it. */
  originalBytes: number;
  sha256: string;
  /** The bytes were already stored; nothing new was written. */
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

/** The 640 px address beside a main one, derived rather than stored twice. */
export function thumbOf(src: string): string {
  return src.replace(/\.webp$/, `-${THUMB_EDGE}.webp`);
}

interface Encoded {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/**
 * Decode, orient, strip metadata, and write both sizes.
 *
 * sharp is also the authority on the format: `inspectImage` refused the obvious fakes
 * before this runs, but a file can start like a PNG and still be truncated. `failOn:
 * 'error'` turns that into a refusal instead of a half-decoded image.
 */
async function encode(bytes: Uint8Array): Promise<Encoded | null> {
  try {
    const source = sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: MAX_IMAGE_EDGE * MAX_IMAGE_EDGE });
    const meta = await source.metadata();
    // The format was decided from the magic bytes before this ran; sharp only has to prove
    // the file decodes. It reports AVIF as `heif`, which is why its own label is not the gate.
    if (!meta.width || !meta.height || meta.width > MAX_IMAGE_EDGE || meta.height > MAX_IMAGE_EDGE) return null;

    // `.rotate()` without an angle reads the EXIF orientation; no `withMetadata()` is
    // called, so the output carries none of the source's EXIF (GPS included).
    const main = await source
      .clone()
      .rotate()
      .resize({ width: MAIN_EDGE, height: MAIN_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const thumb = await source
      .clone()
      .rotate()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();

    return { main: main.data, thumb, width: main.info.width, height: main.info.height };
  } catch {
    return null;
  }
}

export async function putUpload(input: UploadInput, options: UploadOptions = {}): Promise<StoreResult<StoredMedia>> {
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, code: 'too_large', issues: [{ path: 'data', message: `${input.bytes.length} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit` }] };
  }
  const seen = inspectImage(input.bytes);
  if (!seen.ok) {
    return { ok: false, status: 400, code: `not_an_image_${seen.reason}`, issues: [{ path: 'data', message: seen.reason }] };
  }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const existing = await db
    .selectFrom('media')
    .select(['id', 'path', 'filename', 'mime', 'width', 'height', 'size_bytes'])
    .where('sha256', '=', sha256)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();

  // Those bytes are already in the library: keep that row and its address, so a re-upload
  // updates nothing. If the local file itself is gone — a fresh deploy that shipped the
  // database but not `public/uploads/` — the bytes in hand restore it at the address
  // content already points to, which is the only address the site can be asked for.
  if (existing) {
    if (existing.path.startsWith('/uploads/') && mediaDriver() === 'local') {
      const restored = await encode(input.bytes);
      if (restored) {
        try {
          await restoreLocal(existing.path, restored, options.root);
        } catch {
          /* the file may already be there; the row is still the answer */
        }
      }
    }
    await db.updateTable('media').set({ updated_by: input.actorId ?? null }).where('id', '=', existing.id).execute();
    return {
      ok: true,
      value: {
        id: existing.id,
        src: existing.path,
        thumb: thumbOf(existing.path),
        filename: existing.filename,
        mime: existing.mime,
        width: existing.width,
        height: existing.height,
        bytes: Number(existing.size_bytes),
        originalBytes: input.bytes.length,
        sha256,
        reused: true,
      },
    };
  }

  const encoded = await encode(input.bytes);
  if (!encoded) {
    return { ok: false, status: 400, code: 'not_an_image_corrupt', issues: [{ path: 'data', message: 'corrupt' }] };
  }

  const stem = `${sha256.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  const key = `uploads/${monthSegment(options.now ?? new Date())}/${stem}.webp`;

  let src: string;
  try {
    src = (await writeMediaObject(key, encoded.main, 'image/webp', { root: options.root })).src;
    await writeMediaObject(thumbKey(key), encoded.thumb, 'image/webp', { root: options.root });
  } catch {
    if (mediaDriver() === 'blob') {
      return { ok: false, status: 502, code: 'storage_unavailable', issues: [{ path: 'data', message: 'the picture store refused the file' }] };
    }
    return { ok: false, status: 500, code: 'write_failed', issues: [{ path: 'data', message: 'the uploads folder is not writable' }] };
  }

  const filename = displayName(input.filename, { mime: 'image/webp', ext: 'webp', width: encoded.width, height: encoded.height });
  const id = randomUUID();
  await db
    .insertInto('media')
    .values({
      id,
      path: src,
      filename,
      mime: 'image/webp',
      width: encoded.width,
      height: encoded.height,
      size_bytes: encoded.main.length,
      sha256,
      alt_ar: input.altAr ?? '',
      alt_en: input.altEn ?? '',
      folder_id: null,
      legacy_url: null,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .execute();

  return {
    ok: true,
    value: {
      id,
      src,
      thumb: thumbOf(src),
      filename,
      mime: 'image/webp',
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.main.length,
      originalBytes: input.bytes.length,
      sha256,
      reused: false,
    },
  };
}

function thumbKey(key: string): string {
  return key.replace(/\.webp$/, `-${THUMB_EDGE}.webp`);
}

/** Only the local driver has a file to restore; Blob already keeps its own copies. */
async function restoreLocal(src: string, encoded: Encoded, root: string | undefined): Promise<void> {
  const base = root ?? mediaRoot();
  for (const [target, bytes] of [
    [src, encoded.main],
    [thumbOf(src), encoded.thumb],
  ] as const) {
    const absolute = join(base, target);
    if (!absolute.startsWith(join(base))) throw new Error('path_escape');
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, bytes);
  }
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
