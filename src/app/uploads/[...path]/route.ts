/**
 * `/uploads/<yyyyMM>/<name>.webp` — the pictures the console uploaded.
 *
 * These files live in `MEDIA_ROOT`, which on the server is outside the app folder and its
 * build output (a redeploy replaces both). Nothing under `public/` can answer the address
 * there, so the app does. See `src/lib/media/serve.ts` for the containment rules; this file
 * only turns its answer into a response with headers a browser and a proxy can trust.
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
  // A file from this folder is a picture and is never rendered as anything else; the pair
  // of headers is what makes that true even if a future writer slips an unexpected byte in.
  out.set('X-Content-Type-Options', 'nosniff');
  out.set('Content-Disposition', 'inline');
  return out;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const file = await readUpload(path);
  if (!file) return new Response('Not found', { status: 404, headers: headers(null) });
  return new Response(new Uint8Array(file.bytes), { status: 200, headers: headers(file) });
}

export async function HEAD(_request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const file = await readUpload(path);
  return new Response(null, { status: file ? 200 : 404, headers: headers(file) });
}
