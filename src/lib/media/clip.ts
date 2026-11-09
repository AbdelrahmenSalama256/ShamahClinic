/**
 * Voice notes and videos: the second kind of file the console uploads.
 *
 * Pictures are decoded and re-encoded (`store.ts`) because a re-encode is cheap and strips
 * what a camera embedded. A clip is not re-encoded — the server has no ffmpeg on cPanel — so
 * the guarantee here is narrower and stated plainly: the bytes must *start* like one of the
 * formats below, and the stored name carries that format's extension, whatever the person
 * called the file. The serving route then answers with the matching type and `nosniff`, so a
 * clip can only ever be played, never rendered as a page.
 */
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db';
import { writeMediaObject } from './storage';
import type { StoreResult } from '../content/store';
export { CLIP_CONTENT_TYPES } from './clip-types';

export type ClipKind = 'audio' | 'video';

export interface ClipInfo {
  kind: ClipKind;
  mime: string;
  ext: string;
}

/** WhatsApp voice notes are tiny; a 16 MB ceiling still allows a long m4a or a wav. */
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
/** A one-minute 1080p phone clip is ~60–80 MB; anything longer belongs on YouTube. */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

const ascii = (bytes: Uint8Array, from: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(from, from + length));

/**
 * What the first bytes say the file is, for the kind the field asked for.
 *
 * The ISO-BMFF family (`ftyp`) and Matroska/WebM are containers that hold either audio or
 * video; the field's `accept` settles which one the person meant, and the brand settles the
 * extension (`M4A ` is audio, everything else in that family is a movie).
 */
export function inspectClip(bytes: Uint8Array, want: ClipKind): ClipInfo | null {
  if (bytes.length < 12) return null;

  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (want === 'audio') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: 'mov' };
    return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return want === 'audio' ? { kind: 'audio', mime: 'audio/webm', ext: 'weba' } : { kind: 'video', mime: 'video/webm', ext: 'webm' };
  }
  if (want !== 'audio') return null;

  if (ascii(bytes, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return { kind: 'audio', mime: 'audio/wav', ext: 'wav' };
  // An ID3 tag, or straight into an MPEG audio frame (11 sync bits set).
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  }
  return null;
}

export interface StoredClip {
  id: string;
  src: string;
  mime: string;
  bytes: number;
  filename: string;
  reused: boolean;
}

function monthSegment(now: Date): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function displayName(filename: string, ext: string): string {
  const base = filename.replace(/[\\/\0]/g, '').replace(/\.[^.]*$/, '').trim().slice(0, 200) || 'clip';
  return `${base}.${ext}`;
}

export async function putClip(
  input: { bytes: Uint8Array; filename: string; kind: ClipKind; actorId?: string | null },
  options: { root?: string; now?: Date } = {},
): Promise<StoreResult<StoredClip>> {
  const limit = input.kind === 'audio' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
  if (input.bytes.length > limit) {
    return { ok: false, status: 413, code: 'too_large', issues: [{ path: 'data', message: `${input.bytes.length} bytes exceeds the ${limit}-byte limit` }] };
  }
  const info = inspectClip(input.bytes, input.kind);
  if (!info) {
    return { ok: false, status: 400, code: input.kind === 'audio' ? 'not_audio' : 'not_video', issues: [{ path: 'data', message: 'unsupported format' }] };
  }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const existing = await db
    .selectFrom('media')
    .select(['id', 'path', 'filename', 'mime', 'size_bytes'])
    .where('sha256', '=', sha256)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  if (existing && existing.mime === info.mime) {
    return {
      ok: true,
      value: { id: existing.id, src: existing.path, mime: existing.mime, bytes: Number(existing.size_bytes), filename: existing.filename, reused: true },
    };
  }

  const key = `uploads/clips/${monthSegment(options.now ?? new Date())}/${sha256.slice(0, 12)}-${randomUUID().slice(0, 8)}.${info.ext}`;
  let src: string;
  try {
    src = (await writeMediaObject(key, input.bytes, { root: options.root })).src;
  } catch {
    return { ok: false, status: 500, code: 'write_failed', issues: [{ path: 'data', message: 'the uploads folder is not writable' }] };
  }

  const id = randomUUID();
  const filename = displayName(input.filename, info.ext);
  await db
    .insertInto('media')
    .values({
      id,
      path: src,
      filename,
      mime: info.mime,
      size_bytes: input.bytes.length,
      sha256,
      folder_id: null,
      legacy_url: null,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .execute();

  return { ok: true, value: { id, src, mime: info.mime, bytes: input.bytes.length, filename, reused: false } };
}
