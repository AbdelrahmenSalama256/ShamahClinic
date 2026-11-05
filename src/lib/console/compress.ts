/**
 * The browser compresses the picture before the console sends it.
 *
 * A phone photo is 4000×3000 and eight megabytes; the slot it fills on the site is at most
 * 1600 pixels across. Resizing in the browser means the upload that reaches the server is
 * already the size the site will serve, and a phone on a slow connection does not push bytes
 * the server would immediately throw away.
 *
 * WebP is the output: it keeps transparency and is what `next/image` would have served
 * anyway. Safari versions that cannot encode WebP get JPEG.
 *
 * A format the server does not accept — GIF, HEIC — is decoded and re-encoded like an
 * oversized photo, rather than passed through and refused at the end of the upload. A
 * static GIF becomes its first frame in WebP, which is what the site can actually show.
 */

export interface CompressionPlan {
  /** The box the long edge is fitted into; never enlarged beyond the source. */
  maxEdge: number;
  quality: number;
}

export interface ResizedDimensions {
  width: number;
  height: number;
}

export const DEFAULT_PLAN: CompressionPlan = { maxEdge: 1600, quality: 0.82 };

/** Below this the bytes are already cheap, and re-encoding only loses detail. */
export const PASSTHROUGH_BYTES = 250 * 1024;

/** The formats the server stores. Anything else (GIF, HEIC) is decoded and re-encoded. */
const PASSTHROUGH_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function fitWithin(width: number, height: number, maxEdge: number): ResizedDimensions {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  // Rounded to even pixels so nothing sits on a half-pixel boundary in the canvas.
  return { width: Math.max(1, Math.round((width * scale) / 2) * 2), height: Math.max(1, Math.round((height * scale) / 2) * 2) };
}

export function needsResizing(width: number, height: number, plan: CompressionPlan = DEFAULT_PLAN): boolean {
  return Math.max(width, height) > plan.maxEdge;
}

/** A picture worth sending as it arrived: already small, in shape, and in a format we store. */
export function canPassThrough(bytes: number, width: number, height: number, mime: string, plan: CompressionPlan = DEFAULT_PLAN): boolean {
  if (!PASSTHROUGH_MIME.has(mime)) return false;
  return bytes <= PASSTHROUGH_BYTES && !needsResizing(width, height, plan);
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  /** What the file looked like before this function touched it, for the read-out in the UI. */
  from: { bytes: number; width: number; height: number };
}

/**
 * Read the file, fit it into the plan, encode it. `source` is a `File` from an input or a
 * drop, or a `Blob` the picker already holds.
 */
export async function compressImage(source: Blob, filename: string, plan: CompressionPlan = DEFAULT_PLAN): Promise<CompressedImage> {
  const bytes = source.size;
  const image = await decode(source);
  const target = fitWithin(image.width, image.height, plan.maxEdge);

  if (canPassThrough(bytes, image.width, image.height, image.type, plan)) {
    return { blob: source, width: image.width, height: image.height, mime: image.type || 'application/octet-stream', from: { bytes, width: image.width, height: image.height } };
  }

  const canvas = paint(image, target);
  const encoded = await encodeCanvas(canvas, supportsWebP(canvas) ? 'image/webp' : 'image/jpeg', plan.quality);
  return {
    blob: encoded,
    width: target.width,
    height: target.height,
    mime: encoded.type,
    from: { bytes, width: image.width, height: image.height },
  };
}

async function decode(source: Blob): Promise<{ width: number; height: number; type: string; bitmap: ImageBitmap | HTMLImageElement }> {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(source);
    return { width: bitmap.width, height: bitmap.height, type: source.type, bitmap };
  }
  // Safari without createImageBitmap: an <img> over an object URL decodes the same bytes.
  const url = URL.createObjectURL(source);
  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode_failed'));
      img.src = url;
    });
    return { width: element.naturalWidth, height: element.naturalHeight, type: source.type, bitmap: element };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paint(image: { width: number; height: number; bitmap: ImageBitmap | HTMLImageElement }, target: ResizedDimensions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  // JPEG has no alpha: a transparent PNG flattened for the JPEG fallback would be black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(image.bitmap, 0, 0, target.width, target.height);
  return canvas;
}

function supportsWebP(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('encode_failed'));
    }, mime, quality);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
