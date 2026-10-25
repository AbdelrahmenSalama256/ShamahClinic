/**
 * What a raster image actually is, read from its bytes.
 *
 * The console cannot trust a `Content-Type`, a filename, or the browser that sent either:
 * an uploaded file's extension and its contents disagree all the time, and the contents
 * are the only thing the site will later serve. So the format comes from the magic bytes
 * and the size from the header block, and anything that is not a raster photograph this
 * file can read is refused before it reaches disk.
 *
 * SVG is deliberately absent. It is a script in disguise — an SVG uploaded by an editor
 * and served from our own origin can read the console's cookies — and a photograph is
 * never an SVG. `next.config` allows SVG only for the committed brand wordmark.
 */

export interface ImageInfo {
  mime: string;
  /** Extension used on disk, without the dot. */
  ext: string;
  width: number;
  height: number;
}

/** Why a buffer was not accepted, as a code the console can translate. */
export type ImageRejection =
  | 'empty'
  | 'too_small'
  | 'unknown_format'
  | 'unsupported_format'
  | 'too_large_dimensions'
  | 'corrupt';

export type ImageInspection = { ok: true; info: ImageInfo } | { ok: false; reason: ImageRejection };

/** A camera or a design export above this is refused rather than decoded into memory. */
export const MAX_IMAGE_EDGE = 8_000;

/**
 * The formats a photograph can arrive as. GIF is absent on purpose: an animated GIF
 * cannot be re-encoded to WebP without silently dropping every frame but the first, and
 * a static GIF is a PNG with a worse palette. SVG is absent for the reason in the header.
 */
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export function inspectImage(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  // Fewer bytes than a header block is not an image however it starts.
  if (bytes.length < 24) return { ok: false, reason: 'too_small' };

  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? avif(bytes);
  if (!info) return { ok: false, reason: looksLikeText(bytes) ? 'unsupported_format' : 'unknown_format' };
  if (info.width < 1 || info.height < 1) return { ok: false, reason: 'corrupt' };
  if (info.width > MAX_IMAGE_EDGE || info.height > MAX_IMAGE_EDGE) {
    return { ok: false, reason: 'too_large_dimensions' };
  }
  return { ok: true, info };
}

/** An SVG or HTML payload starts with markup, not with a binary marker. */
function looksLikeText(bytes: Uint8Array): boolean {
  let index = 0;
  while (index < bytes.length && (bytes[index] === 0x20 || bytes[index] === 0x0a || bytes[index] === 0x0d || bytes[index] === 0x09)) index += 1;
  const first = bytes[index];
  return first === 0x3c || (first !== undefined && first >= 0x41 && first <= 0x7a);
}

const ascii = (bytes: Uint8Array, at: number, text: string): boolean => {
  if (at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

const be16 = (bytes: Uint8Array, at: number): number => (bytes[at] << 8) | bytes[at + 1];
const be32 = (bytes: Uint8Array, at: number): number => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
const le16 = (bytes: Uint8Array, at: number): number => bytes[at] | (bytes[at + 1] << 8);
const le32 = (bytes: Uint8Array, at: number): number => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(bytes: Uint8Array): ImageInfo | null {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  if (!ascii(bytes, 12, 'IHDR')) return null;
  return { mime: 'image/png', ext: 'png', width: be32(bytes, 16), height: be32(bytes, 20) };
}

/**
 * JPEG is a chain of segments; the size lives in the SOF0..SOF11 frame header, which can
 * sit behind any number of EXIF/thumbnail segments. Markers without a length field (the
 * standalone ones) and the fill bytes between them are skipped, and a truncated file
 * simply runs off the end and is refused.
 */
function jpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    while (bytes[at] === 0xff && at < bytes.length) at += 1; // fill bytes
    const marker = bytes[at];
    at += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || at + 2 > bytes.length) return null;
    const length = be16(bytes, at);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      // segment length, precision byte, then height and width.
      return { mime: 'image/jpeg', ext: 'jpg', width: be16(bytes, at + 5), height: be16(bytes, at + 3) };
    }
    at += length;
  }
  return null;
}

/**
 * RIFF containers put their chunks back to back, and the first one is not always the image:
 * an extended WebP carries `VP8X` (canvas), `ALPH` (transparency) and then `VP8 `. The
 * canvas size is what the site needs, so the walk takes whichever header it finds.
 */
function webp(bytes: Uint8Array): ImageInfo | null {
  if (!ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return null;
  for (let pos = 12; pos + 8 <= bytes.length; pos += 8 + le32(bytes, pos + 4) + (le32(bytes, pos + 4) % 2)) {
    const fourcc = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const payload = pos + 8;
    if (fourcc === 'VP8X') {
      return {
        mime: 'image/webp',
        ext: 'webp',
        width: 1 + (bytes[payload + 4] | (bytes[payload + 5] << 8) | (bytes[payload + 6] << 16)),
        height: 1 + (bytes[payload + 7] | (bytes[payload + 8] << 8) | (bytes[payload + 9] << 16)),
      };
    }
    if (fourcc === 'VP8 ' && bytes[payload + 3] === 0x9d) {
      // A keyframe: 3-byte frame tag, the 0x9d 0x01 0x2a sync code, then 14-bit size fields.
      return {
        mime: 'image/webp',
        ext: 'webp',
        width: le16(bytes, payload + 6) & 0x3fff,
        height: le16(bytes, payload + 8) & 0x3fff,
      };
    }
    if (fourcc === 'VP8L' && bytes[payload] === 0x2f) {
      const bits = le32(bytes, payload + 1);
      return { mime: 'image/webp', ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/**
 * AVIF is an ISO BMFF container: brands in `ftyp`, and the size in an `ispe` box whose
 * payload is version/flags then width and height. Searching for the box is enough here —
 * the caller re-encodes with sharp, which does the full structural validation.
 */
function avif(bytes: Uint8Array): ImageInfo | null {
  if (!ascii(bytes, 4, 'ftyp')) return null;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (brand !== 'avif' && brand !== 'avis') return null;
  for (let at = 0; at + 16 <= bytes.length; at += 1) {
    if (!ascii(bytes, at, 'ispe')) continue;
    const width = be32(bytes, at + 8);
    const height = be32(bytes, at + 12);
    if (width > 0 && height > 0) return { mime: 'image/avif', ext: 'avif', width, height };
  }
  return null;
}
