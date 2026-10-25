/**
 * One file in, one address out — the call every picture control in the console makes.
 *
 * The browser does the shrinking (`compress.ts`), this does the sending and the translating:
 * what came back from the server is an error *code*, and what a person needs is a sentence
 * about their own file. Keeping that mapping in one pure function is the difference between
 * "upload failed" on nine screens and "this file is bigger than 8 MB, choose a smaller one".
 */
import { consoleCall } from '@/components/console/client-api';
import { compressImage, toBase64 } from './compress';
import type { MessageKey } from './messages';

export interface UploadedPicture {
  src: string;
  /** What the file was before the browser resized it, for the read-out that proves the compression. */
  from: { bytes: number; width: number; height: number };
  to: { bytes: number; width: number; height: number };
  reused: boolean;
}

export type UploadOutcome = { ok: true; value: UploadedPicture } | { ok: false; code: string };

interface UploadResponse {
  media?: { src?: unknown; reused?: unknown; bytes?: unknown; width?: unknown; height?: unknown };
}

/**
 * Read, shrink, send.
 *
 * Nothing here throws: a file the browser cannot decode, a server that refuses the format and
 * a network that dies are one return shape, because a control that shows an error is a control
 * a person can act on, and a control that raises is a screen that goes blank.
 */
export async function uploadPicture(file: File, alt: { ar: string; en: string } = { ar: '', en: '' }): Promise<UploadOutcome> {
  let compressed: Awaited<ReturnType<typeof compressImage>>;
  try {
    compressed = await compressImage(file, file.name);
  } catch {
    return { ok: false, code: 'read_failed' };
  }

  let data: string;
  try {
    data = await toBase64(compressed.blob);
  } catch {
    return { ok: false, code: 'read_failed' };
  }

  const res = await consoleCall<UploadResponse>('/api/console/media', 'POST', {
    filename: file.name,
    data,
    alt: { ar: alt.ar, en: alt.en },
  });

  if (res.error) return { ok: false, code: res.error };
  const src = res.data?.media?.src;
  if (typeof src !== 'string' || src === '') return { ok: false, code: 'no_address' };

  return {
    ok: true,
    value: {
      src,
      from: { bytes: file.size, width: compressed.from.width, height: compressed.from.height },
      to: {
        bytes: compressed.blob.size,
        width: num(compressed.width, compressed.from.width),
        height: num(compressed.height, compressed.from.height),
      },
      reused: res.data?.media?.reused === true,
    },
  };
}

function num(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The sentence a code deserves.
 *
 * `too_large` and `not_an_image_*` are the two ways a person hits this wall in practice — a
 * raw camera file and a file that is not a picture at all — and both read as a failure of the
 * site unless the console says which of the two happened.
 */
export function mediaMessageKey(code: string): MessageKey {
  if (code === 'too_large') return 'media.error.too_large';
  if (code.startsWith('not_an_image')) return 'media.error.not_an_image';
  if (code === 'read_failed' || code === 'no_address') return 'media.error.read';
  if (code === 'forbidden') return 'media.error.forbidden';
  if (code === 'unauthenticated') return 'media.error.signed_out';
  if (code === 'csrf_failed') return 'media.error.expired';
  if (code === 'write_failed') return 'media.error.writable';
  return 'media.error.failed';
}
