/**
 * Where the bytes of an uploaded picture live.
 *
 * The console runs in two places that cannot share a filesystem: a laptop, where
 * `public/uploads/` is fine, and Vercel, where the deployment is read-only and a file
 * written there disappears with the next request. So the address is decided by one
 * environment switch and nothing else in the upload path knows which driver is in use:
 *
 *   - `BLOB_READ_WRITE_TOKEN` present → Vercel Blob (durable, served from its own host);
 *   - otherwise → `public/uploads/` (or `MEDIA_ROOT`, for a cPanel host that keeps a
 *     writable folder outside the replaced document root).
 *
 * `MEDIA_DRIVER=local` forces the second even when a token exists — useful for tests and
 * for a deploy that deliberately serves files itself. There is no third mode: a path that
 * only works on the machine that wrote it is the bug this file exists to prevent.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type MediaDriver = 'blob' | 'local';

export function mediaDriver(): MediaDriver {
  if ((process.env.MEDIA_DRIVER ?? '').trim().toLowerCase() === 'local') return 'local';
  return (process.env.BLOB_READ_WRITE_TOKEN ?? '').trim() === '' ? 'local' : 'blob';
}

/**
 * Where local files are written. Defaults to the app's `public/`, which is what the site
 * serves; `MEDIA_ROOT` moves it onto a path a deploy does not wipe.
 */
export function mediaRoot(): string {
  const configured = (process.env.MEDIA_ROOT ?? '').trim();
  return configured ? resolve(configured) : join(process.cwd(), 'public');
}

export interface StoredObject {
  /** The address content stores: root-relative for local, absolute for Blob. */
  src: string;
}

/** A root-relative address never escapes the folder it is resolved against. */
function resolveUnder(root: string, key: string): string {
  const absolute = join(root, key);
  if (absolute !== join(root) && !absolute.startsWith(join(root) + '/') && !absolute.startsWith(join(root) + '\\')) {
    throw new Error('path_escape');
  }
  return absolute;
}

/**
 * Store one object under `key` and answer the address the site will use.
 *
 * The caller writes the file **before** the database row, so a failure here is a refusal,
 * not a row pointing at nothing. `contentType` is always `image/webp` today because the
 * server re-encodes every upload; the parameter is here so a future video or PDF does not
 * have to guess.
 */
export async function writeMediaObject(key: string, bytes: Uint8Array, contentType: string, options: { root?: string } = {}): Promise<StoredObject> {
  if (mediaDriver() === 'blob') {
    const { put } = await import('@vercel/blob');
    const result = await put(key, Buffer.from(bytes), {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType,
      addRandomSuffix: false,
    });
    return { src: result.url };
  }

  const root = options.root ?? mediaRoot();
  const absolute = resolveUnder(root, key);
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, bytes);
  return { src: `/${key.replace(/^\/+/, '')}` };
}

/** Whether a stored address belongs to this console's own library. */
export function isMediaSrc(src: string): boolean {
  return src.startsWith('/uploads/') || /^https:\/\/[^/]+\/uploads\//.test(src);
}
