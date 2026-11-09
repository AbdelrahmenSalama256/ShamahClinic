/**
 * `/uploads/<yyyyMM>/<name>.webp` — the pictures the console uploaded — and
 * `/uploads/clips/<yyyyMM>/<name>.<ext>` — its voice notes and videos.
 *
 * These files live in `MEDIA_ROOT`, which on the server is outside the app folder and its
 * build output (a redeploy replaces both). Nothing under `public/` can answer the address
 * there, so the app does. See `src/lib/media/serve.ts` for the containment rules; this file
 * only turns its answer into a response with headers a browser and a proxy can trust.
 *
 * Clips are answered in byte ranges when asked: Safari will not play a video whose server
 * refuses `Range`, and every browser needs it to seek.
 */
import { readUpload, UPLOAD_CACHE_CONTROL } from '@/lib/media/serve';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

function headers(file: { contentType: string; bytes: Buffer } | null): Headers {
  const out = new Headers();
  if (!file) {
    out.set('Content-Type', 'text/plain; charset=utf-8');
    out.set('Cache-Control', 'no-store');
    out.set('X-Content-Type-Options', 'nosniff');
    return out;
  }
  out.set('Content-Type', file.contentType);
  out.set('Content-Length', String(file.bytes.length));
  out.set('Cache-Control', UPLOAD_CACHE_CONTROL);
  out.set('Accept-Ranges', 'bytes');
  // A file from this folder is a picture or a clip and is never rendered as anything else;
  // the pair of headers is what makes that true even if a future writer slips an unexpected
  // byte in.
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Content-Disposition', 'inline');
  return out;
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n`; anything else (or a multi-range) is ignored. */
function rangeOf(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const file = await readUpload(path);
  if (!file) return new Response('Not found', { status: 404, headers: headers(null) });

  const range = rangeOf(request.headers.get('range'), file.bytes.length);
  if (range === 'unsatisfiable') {
    const out = headers(null);
    out.set('Content-Range', `bytes */${file.bytes.length}`);
    return new Response(null, { status: 416, headers: out });
  }
  if (range) {
    const out = headers(file);
    out.set('Content-Range', `bytes ${range.start}-${range.end}/${file.bytes.length}`);
    out.set('Content-Length', String(range.end - range.start + 1));
    return new Response(new Uint8Array(file.bytes.subarray(range.start, range.end + 1)), { status: 206, headers: out });
  }
  return new Response(new Uint8Array(file.bytes), { status: 200, headers: headers(file) });
}

export async function HEAD(_request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const file = await readUpload(path);
  return new Response(null, { status: file ? 200 : 404, headers: headers(file) });
}
