/**
 * Where the bytes of an uploaded picture live: on this server's disk, nowhere else.
 *
 * The production target is one long-lived Node process with MariaDB on the same machine
 * (docs/SELF-HOSTED.md), so there is no read-only function filesystem to work around and no
 * per-usage store to pay for. One environment variable moves the folder — `MEDIA_ROOT` — and
 * the only reason to set it is that the default is a path a deploy replaces.
 *
 * Nothing here decides a driver, because there is no second driver to choose. A path that
 * only works on the machine that wrote it is still the bug this file exists to prevent, and
 * it is prevented by storing the root-relative address rather than the absolute one.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Where local files are written. Defaults to the app's `public/`, which is what the site
 * serves; `MEDIA_ROOT` moves it onto a path a deploy does not wipe.
 */
export function mediaRoot(): string {
  const configured = (process.env.MEDIA_ROOT ?? '').trim();
  return configured ? resolve(configured) : join(process.cwd(), 'public');
}

export interface StoredObject {
  /** The address content stores: always root-relative, so it means the same on every machine. */
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
 * not a row pointing at nothing. Every byte reaching this function is a WebP the server
 * re-encoded itself, which is why the address carries the extension and no content type
 * travels with it.
 */
export async function writeMediaObject(key: string, bytes: Uint8Array, options: { root?: string } = {}): Promise<StoredObject> {
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
