/**
 * Serving the bytes `store.ts` wrote.
 *
 * On a cPanel/VPS install `MEDIA_ROOT` points outside the app folder, so nothing under
 * `public/` can answer `/uploads/…` — the route at `src/app/uploads/[...path]/route.ts`
 * does, and this is the only code allowed to touch the disk for a request. It answers one
 * kind of thing (the WebP files the upload pipeline wrote), from one folder, and nothing
 * else: not a directory, not a symlink that leaves the folder, not a path that climbed out.
 *
 * The names are content hashes, so a file at an address never changes: the response can be
 * cached for a year and marked immutable. That header is the reason the route is fast on a
 * second visit; the first is a `readFile` of a file that is at most 2000 px wide.
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { mediaRoot } from './storage';
import { CLIP_CONTENT_TYPES } from './clip-types';

/** Safe because every address `store.ts` writes carries a content hash and a random id. */
export const UPLOAD_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Only what the pipeline writes. A row pointing at anything else is a 404, not a guess. */
const CONTENT_TYPES = new Map([['.webp', 'image/webp'], ...CLIP_CONTENT_TYPES]);

export interface UploadFile {
  bytes: Buffer;
  contentType: string;
}

function isUnder(directory: string, candidate: string): boolean {
  return candidate === directory || candidate.startsWith(directory.endsWith(sep) ? directory : directory + sep);
}

/**
 * Read one file addressed as `/uploads/<segment>/<segment>…`.
 *
 * `null` means "answer 404": a bad segment, an extension this folder never contains, a
 * path outside `<root>/uploads` (before or after following symlinks), a directory, or a
 * file that is not there. Nothing here distinguishes those cases to the client.
 */
export async function readUpload(pathSegments: readonly string[], options: { root?: string } = {}): Promise<UploadFile | null> {
  if (pathSegments.length === 0) return null;
  for (const segment of pathSegments) {
    // Next decodes percent-escapes before the handler sees them, so `%2e%2e` arrives as `..`.
    // A separator or NUL inside a segment means the caller is spelling a path, not a name.
    if (!segment || segment === '.' || segment === '..' || /[\\/\0]/.test(segment)) return null;
  }

  const name = pathSegments[pathSegments.length - 1];
  const dot = name.lastIndexOf('.');
  const contentType = dot === -1 ? undefined : CONTENT_TYPES.get(name.slice(dot).toLowerCase());
  if (!contentType) return null;

  const uploadsDir = join(resolve(options.root ?? mediaRoot()), 'uploads');
  const absolute = resolve(uploadsDir, ...pathSegments);
  if (!isUnder(uploadsDir, absolute)) return null;

  try {
    // A symlink inside the folder could still point anywhere; the real path decides.
    const realDir = await realpath(uploadsDir);
    const real = await realpath(absolute);
    if (!isUnder(realDir, real)) return null;
    const info = await stat(real);
    if (!info.isFile()) return null;
    return { bytes: await readFile(real), contentType };
  } catch {
    return null;
  }
}
