/**
 * `/uploads/…` on a server whose media folder is outside the app.
 *
 * The route is the only reader of `MEDIA_ROOT` at request time, so its containment rules
 * are a security boundary, not a convenience: a path segment is a name, never a path; a
 * symlink may not leave the folder; a file that is not a WebP the pipeline wrote is not
 * served. The assertions below drive the real route handlers — GET and HEAD — against a
 * temporary root, and none of them passes an option the production call would not.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET, HEAD } from '../src/app/uploads/[...path]/route';
import { readUpload, UPLOAD_CACHE_CONTROL } from '@/lib/media/serve';

const BYTES = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'binary');
const SEGMENTS = ['202610', 'abc123-def456.webp'];

let root = '';
const previousRoot = process.env.MEDIA_ROOT;

function context(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shamah-serve-'));
  mkdirSync(join(root, 'uploads', '202610'), { recursive: true });
  writeFileSync(join(root, 'uploads', ...SEGMENTS), BYTES);
  mkdirSync(join(root, 'uploads', '202610', 'a-directory.webp'));
  process.env.MEDIA_ROOT = root;
});

afterAll(() => {
  if (previousRoot === undefined) delete process.env.MEDIA_ROOT;
  else process.env.MEDIA_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

describe('GET /uploads/[...path]', () => {
  it('serves the file the upload pipeline wrote, with immutable caching', async () => {
    const response = await GET(new Request('http://localhost/uploads/202610/abc123-def456.webp'), context(SEGMENTS));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe(UPLOAD_CACHE_CONTROL);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Disposition')).toBe('inline');
    expect(response.headers.get('Content-Length')).toBe(String(BYTES.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES);
  });

  it('answers 404 for a file that is not there, and never caches that answer', async () => {
    const response = await GET(new Request('http://localhost/uploads/202610/missing.webp'), context(['202610', 'missing.webp']));
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('refuses a path that climbs out of the folder', async () => {
    for (const path of [['..', 'secret.webp'], ['202610', '..', '..', 'secret.webp'], ['202610', 'a\\b.webp']]) {
      expect((await GET(new Request('http://localhost/uploads/x'), context(path))).status).toBe(404);
      expect(await readUpload(path)).toBeNull();
    }
  });

  it('serves only the extensions the pipeline writes', async () => {
    writeFileSync(join(root, 'uploads', '202610', 'notes.txt'), 'hello');
    expect((await GET(new Request('http://localhost/uploads/202610/notes.txt'), context(['202610', 'notes.txt']))).status).toBe(404);
    expect((await GET(new Request('http://localhost/uploads/202610/script.webp.sh'), context(['202610', 'script.webp.sh']))).status).toBe(404);
  });

  it('does not serve a directory', async () => {
    expect((await GET(new Request('http://localhost/uploads/202610/a-directory.webp'), context(['202610', 'a-directory.webp']))).status).toBe(404);
  });

  it('refuses a symlink whose target is outside the uploads folder', async (test) => {
    const outside = join(root, 'outside.webp');
    writeFileSync(outside, BYTES);
    const link = join(root, 'uploads', '202610', 'link.webp');
    try {
      symlinkSync(outside, link, 'file');
    } catch {
      test.skip();
      return;
    }
    expect((await GET(new Request('http://localhost/uploads/202610/link.webp'), context(['202610', 'link.webp']))).status).toBe(404);
  });
});

describe('HEAD /uploads/[...path]', () => {
  it('answers the size and type without a body', async () => {
    const response = await HEAD(new Request('http://localhost/uploads/202610/abc123-def456.webp', { method: 'HEAD' }), context(SEGMENTS));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe(String(BYTES.length));
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(await response.text()).toBe('');
  });

  it('answers 404 for a missing file', async () => {
    const response = await HEAD(new Request('http://localhost/uploads/x', { method: 'HEAD' }), context(['202610', 'missing.webp']));
    expect(response.status).toBe(404);
  });
});
