/**
 * #245 / BK-14a.1: a picture enters the site as an uploaded file, never as a typed path.
 *
 * Four things are proved here and none of them can be proved by reading the code:
 *
 *   - the format comes from the **bytes**. A file called `hero.jpg` that is really a PNG is
 *     stored as WebP, because whatever the browser was told is not what the site will serve.
 *     An SVG is refused outright: it is a script wearing a picture's clothes, and an upload
 *     served from our own origin can read the console's cookies.
 *   - the server re-encodes the file: EXIF (including a rotation flag) is not copied, the
 *     long edge is capped at 2000 px, and a 640 px companion is written beside every main file.
 *   - the same bytes twice are **one file and one row**, so an editor who re-sends a banner
 *     cannot leave `banner-2.webp` behind, and a library row whose file has vanished gets
 *     its file restored at the address the content already points to.
 *   - the route is the same enforcement path as everything else in the console: 401 with no
 *     session, 403 with no CSRF token, 403 with no `media.create` — and the 403 arrives
 *     before the multipart body is read.
 *
 * Files are written under a temporary root, never into `public/uploads`.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import { syncRoles } from '../src/lib/auth/roles';
import type { Grant } from '../src/lib/auth/permissions';
import { mediaHandler } from '../src/lib/media/api';
import { MAX_UPLOAD_BYTES, MAIN_EDGE, THUMB_EDGE, putUpload } from '../src/lib/media/store';
import { canPassThrough, fitWithin } from '../src/lib/console/compress';
import { MAX_IMAGE_EDGE, inspectImage } from '../src/lib/media/image-info';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-media-2026';
const MARK = `bk14a-${run}`;

/** A real raster file, because the store decodes it — synthetic headers prove nothing here. */
async function raster(kind: 'png' | 'jpeg' | 'webp' | 'avif', width: number, height: number, seed = 1): Promise<Uint8Array> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: seed % 256, g: (seed * 7) % 256, b: (seed * 13) % 256 },
    },
  });
  switch (kind) {
    case 'png':
      return new Uint8Array(await pipeline.png().toBuffer());
    case 'jpeg':
      return new Uint8Array(await pipeline.jpeg().toBuffer());
    case 'webp':
      return new Uint8Array(await pipeline.webp().toBuffer());
    case 'avif':
      return new Uint8Array(await pipeline.avif().toBuffer());
  }
}

interface Session {
  email: string;
  id: string;
  token: string;
  csrf: string;
  grants: Grant[];
}

const emails = {
  Editor: `${MARK}-editor@example.invalid`,
  Reader: `${MARK}-reader@example.invalid`,
} as const;

const actors = {} as Record<keyof typeof emails, Session>;
let root = '';

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  headers.set('x-forwarded-for', '203.0.113.7');
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

/** A multipart upload, the only body the POST route accepts. */
function form(data: Uint8Array, filename = 'hero.png', alt = { ar: 'واجهة', en: 'Hero' }): FormData {
  const body = new FormData();
  // `File` takes a plain ArrayBuffer; a sharp `Buffer` can be a view into a larger one.
  const part = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  body.set('file', new File([part], filename, { type: 'image/png' }));
  body.set('altAr', alt.ar);
  body.set('altEn', alt.en);
  return body;
}

function upload(actor: Session, body: FormData, csrf = true): RequestInit & { cookie: string } {
  return {
    method: 'POST',
    cookie: `shamah_session=${actor.token}`,
    headers: csrf ? { [CSRF_HEADER]: actor.csrf } : {},
    body,
  };
}

/** A JSON write, for the alt-text route that did not change shape. */
function jsonWrite(actor: Session, body: unknown): RequestInit & { cookie: string } {
  return {
    method: 'PATCH',
    cookie: `shamah_session=${actor.token}`,
    headers: { [CSRF_HEADER]: actor.csrf, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** A POST that is still JSON: the old body shape, which must now be refused. */
function jsonPost(actor: Session, body: unknown): RequestInit & { cookie: string } {
  return {
    method: 'POST',
    cookie: `shamah_session=${actor.token}`,
    headers: { [CSRF_HEADER]: actor.csrf, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

async function login(email: string): Promise<Session> {
  const res = await loginHandler(
    request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }), headers: { 'content-type': 'application/json' } }),
  );
  const body = (await res.json()) as { csrfToken: string };
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return { email, id: row.id, token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken, grants: (await loadGrants(row.id)).grants };
}

async function purge(): Promise<void> {
  const users = await db.selectFrom('users').select('id').where('email', 'like', `%${MARK}%`).execute();
  const ids = users.map((row) => row.id);
  const roles = await db.selectFrom('roles').select('id').where('name', 'like', `${MARK}%`).execute();
  const roleIds = roles.map((row) => row.id);
  const media = await db.selectFrom('media').select(['id', 'path']).where('created_by', 'in', ids.length > 0 ? ids : ['__none__']).execute();

  // A run that wrote into the default root (before MEDIA_ROOT was set) must not leave its
  // pictures in the repo: remove exactly the files the fixture's own rows named.
  await Promise.all(
    media.flatMap((row) => [
      rm(join(process.cwd(), 'public', row.path), { force: true }),
      rm(join(process.cwd(), 'public', row.path.replace(/\.webp$/, `-${THUMB_EDGE}.webp`)), { force: true }),
    ]),
  );
  if (media.length > 0) {
    await db.deleteFrom('media').where('id', 'in', media.map((row) => row.id)).execute();
  }
  if (ids.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', ids).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', ids).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', ids).execute();
    await db.deleteFrom('users').where('id', 'in', ids).execute();
  }
  if (roleIds.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', roleIds).execute();
    await db.deleteFrom('roles').where('id', 'in', roleIds).execute();
  }
  await db.deleteFrom('login_attempts').where('email_lc', 'like', `%${MARK}%`).execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
  root = await mkdtemp(join(tmpdir(), 'shamah-media-'));
  // The route under test calls `putUpload` without an explicit root, so the folder it
  // would have written into is redirected for the whole file. Nothing may write into the
  // repo's own `public/uploads/` from a test run.
  process.env.MEDIA_ROOT = root;
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  const system = await db.selectFrom('roles').select(['id', 'name']).where('deleted_at', 'is', null).execute();
  // Viewer holds no `media` grant at all: it is the role that proves the route is gated.
  const viewerRoleId = system.find((role) => role.name === 'Viewer')?.id ?? '';

  const editorRoleId = await getOrCreateRole(`${MARK}-editor`, { is_system: false });
  await db
    .insertInto('role_permissions')
    .values(
      [['media', 'create'], ['media', 'update'], ['media', 'read']].map(([resource, action]) => ({
        id: randomUUID(),
        role_id: editorRoleId,
        resource,
        action,
        scope: json(null),
      })),
    )
    .execute();

  for (const [key, email] of Object.entries(emails) as [keyof typeof emails, string][]) {
    const id = await createUser({ email, password: PASSWORD, name: `BK14A ${key} ${run}` });
    await assignRole(id, key === 'Editor' ? editorRoleId : viewerRoleId);
    actors[key] = await login(email);
  }
});

afterAll(async () => {
  await purge();
  await destroyDb();
  delete process.env.MEDIA_ROOT;
  await rm(root, { recursive: true, force: true });
});

describe('the bytes, not the name', () => {
  it('reads the size out of each format it accepts', async () => {
    const png = await raster('png', 1200, 630, 2);
    const jpeg = await raster('jpeg', 4000, 3000, 3);
    const webp = await raster('webp', 1024, 768, 4);
    const avif = await raster('avif', 800, 600, 5);

    expect(inspectImage(png)).toEqual({ ok: true, info: { mime: 'image/png', ext: 'png', width: 1200, height: 630 } });
    expect(inspectImage(jpeg)).toEqual({ ok: true, info: { mime: 'image/jpeg', ext: 'jpg', width: 4000, height: 3000 } });
    expect(inspectImage(webp)).toEqual({ ok: true, info: { mime: 'image/webp', ext: 'webp', width: 1024, height: 768 } });
    expect(inspectImage(avif)).toEqual({ ok: true, info: { mime: 'image/avif', ext: 'avif', width: 800, height: 600 } });
  });

  it('refuses markup dressed as a picture, and a GIF the site cannot store', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(inspectImage(svg)).toEqual({ ok: false, reason: 'unsupported_format' });
    expect(inspectImage(new TextEncoder().encode('<?php system($_GET["c"]); ?>'))).toEqual({ ok: false, reason: 'unsupported_format' });
    // GIF is a picture, but not one this pipeline stores; the browser re-encodes it first.
    expect(inspectImage(new TextEncoder().encode('GIF89a\x10\x00\x10\x00\xf7\x00\x00' + '\x00'.repeat(32)))).toEqual({ ok: false, reason: 'unsupported_format' });
    // Bytes that are simply nothing known.
    expect(inspectImage(new Uint8Array(Array.from({ length: 64 }, (_, index) => (index * 37) % 256)))).toEqual({ ok: false, reason: 'unknown_format' });
  });

  it('refuses a file whose header claims impossible dimensions', () => {
    const header = new Uint8Array(40);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    header.set([0, 0, 0, 13], 8);
    header.set([...'IHDR'].map((character) => character.charCodeAt(0)), 12);
    header.set([0, 1, 0x86, 0xa0], 16); // 100000 px wide
    header.set([0, 0, 0, 1], 20);
    expect(inspectImage(header)).toEqual({ ok: false, reason: 'too_large_dimensions' });
    expect(inspectImage(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reason: 'too_small' });
    expect(inspectImage(new Uint8Array([]))).toEqual({ ok: false, reason: 'empty' });
    expect(MAX_IMAGE_EDGE).toBe(8_000);
  });
});

describe('the browser half of the compression', () => {
  it('fits the long edge into 1600 and never enlarges', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1200, 630, 1600)).toEqual({ width: 1200, height: 630 });
    expect(fitWithin(900, 1600, 1600)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });

  it('passes through only a small file in a format the server stores', () => {
    expect(canPassThrough(120_000, 1200, 800, 'image/jpeg')).toBe(true);
    expect(canPassThrough(120_000, 1200, 800, 'image/webp')).toBe(true);
    expect(canPassThrough(120_000, 4000, 800, 'image/jpeg')).toBe(false);
    expect(canPassThrough(2_000_000, 1200, 800, 'image/png')).toBe(false);
    // Decoded and re-encoded: the store does not accept these formats.
    expect(canPassThrough(120_000, 800, 600, 'image/gif')).toBe(false);
    expect(canPassThrough(120_000, 800, 600, 'image/heic')).toBe(false);
  });
});

describe('putUpload', () => {
  it('stores WebP under the month folder, named by a content hash and a random id', async () => {
    const data = await raster('png', 1200, 630, 6);
    const stored = await putUpload({ bytes: data, filename: 'الواجهة.png', actorId: actors.Editor.id }, { root, now: new Date('2026-10-25T10:00:00Z') });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    expect(stored.value.src).toMatch(/^\/uploads\/202610\/[0-9a-f]{12}-[0-9a-f]{8}\.webp$/);
    expect(stored.value.thumb).toBe(stored.value.src.replace(/\.webp$/, `-${THUMB_EDGE}.webp`));
    // The name the person chose survives as the display name; the extension follows the bytes.
    expect(stored.value.filename).toBe('الواجهة.webp');
    expect(stored.value.mime).toBe('image/webp');
    expect(stored.value.reused).toBe(false);
    expect(stored.value.originalBytes).toBe(data.length);

    const main = await readFile(join(root, stored.value.src));
    const companion = await readFile(join(root, stored.value.thumb));
    expect(main.length).toBe(stored.value.bytes);
    expect(companion.length).toBeGreaterThan(0);

    const decoded = await sharp(main).metadata();
    expect(decoded.format).toBe('webp');
    expect(decoded.width).toBe(1200);
    expect(decoded.height).toBe(630);
    const thumb = await sharp(companion).metadata();
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(THUMB_EDGE);

    const row = await db.selectFrom('media').select(['path', 'mime', 'width', 'height', 'sha256']).where('id', '=', stored.value.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ path: stored.value.src, mime: 'image/webp', width: 1200, height: 630 });
  });

  it('names a lying filename after what the bytes actually are', async () => {
    const stored = await putUpload({ bytes: await raster('jpeg', 800, 500, 7), filename: 'photo.png', actorId: actors.Editor.id }, { root });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value.src).toMatch(/\.webp$/);
    expect(stored.value.mime).toBe('image/webp');
    expect(stored.value.filename).toBe('photo.webp');
  });

  it('strips a path out of the display name instead of storing it', async () => {
    const stored = await putUpload({ bytes: await raster('webp', 640, 480, 8), filename: '../../etc/passwd', actorId: actors.Editor.id }, { root });
    expect(stored.ok && stored.value.filename).toBe('passwd.webp');
    expect(stored.ok && stored.value.filename).not.toContain('/');
  });

  it('caps the long edge at 2000 px and keeps the aspect the photograph had', async () => {
    const stored = await putUpload({ bytes: await raster('jpeg', 2400, 1200, 9), filename: 'wide.jpg', actorId: actors.Editor.id }, { root });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(Math.max(stored.value.width, stored.value.height)).toBe(MAIN_EDGE);
    expect(stored.value.width).toBe(2000);
    expect(stored.value.height).toBe(1000);
  });

  it('does not copy EXIF, and applies the orientation it carried', async () => {
    const source = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const stored = await putUpload({ bytes: new Uint8Array(source), filename: 'phone.jpg', actorId: actors.Editor.id }, { root });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    const main = await sharp(join(root, stored.value.src));
    const meta = await main.metadata();
    // Orientation 6 means the camera was held sideways: the stored picture is portrait.
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(400);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  it('keeps one row and one file for the same bytes', async () => {
    const data = await raster('webp', 320, 240, 10);
    const first = await putUpload({ bytes: data, filename: 'a.webp', actorId: actors.Editor.id }, { root });
    const second = await putUpload({ bytes: data, filename: 'b.webp', actorId: actors.Editor.id }, { root });
    expect(first.ok && second.ok && second.value.id).toBe(first.ok && first.value.id);
    expect(second.ok && second.value.reused).toBe(true);

    const rows = await db.selectFrom('media').select('id').where('sha256', '=', first.ok ? first.value.sha256 : '').execute();
    expect(rows).toHaveLength(1);
  });

  it('restores both files at the address content already points to', async () => {
    const data = await raster('png', 500, 400, 11);
    const stored = await putUpload({ bytes: data, filename: 'banner.png', actorId: actors.Editor.id }, { root });
    if (!stored.ok) throw new Error('upload failed');
    await rm(join(root, stored.value.src));
    await rm(join(root, stored.value.thumb));

    const again = await putUpload({ bytes: data, filename: 'banner.png', actorId: actors.Editor.id }, { root });
    expect(again.ok && again.value.src).toBe(stored.value.src);
    expect(again.ok && again.value.reused).toBe(true);
    expect((await readFile(join(root, stored.value.src))).length).toBeGreaterThan(0);
    expect((await readFile(join(root, stored.value.thumb))).length).toBeGreaterThan(0);
  });

  it('refuses bytes that are not a picture, and refuses a giant', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const rejected = await putUpload({ bytes: svg, filename: 'x.svg', actorId: actors.Editor.id }, { root });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.status).toBe(400);
    expect(rejected.code).toBe('not_an_image_unsupported_format');

    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const oversize = await putUpload({ bytes: huge, filename: 'huge.png', actorId: actors.Editor.id }, { root });
    expect(oversize.ok).toBe(false);
    if (oversize.ok) return;
    expect(oversize.status).toBe(413);
  });
});

describe('POST /api/console/media', () => {
  it('answers 401 with no session and 403 with no CSRF token', async () => {
    const data = await raster('png', 600, 400, 12);
    expect((await mediaHandler(request('/media', { method: 'POST', body: form(data) }))).status).toBe(401);

    const noCsrf = await mediaHandler(request('/media', upload(actors.Editor, form(data), false)));
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()) as { error: string }).toMatchObject({ error: 'csrf_failed' });
  });

  it('refuses a caller without media.create before reading the body', async () => {
    // Not a multipart body at all: if the route parsed first it would answer 400, not 403.
    const res = await mediaHandler(
      request('/media', { method: 'POST', cookie: `shamah_session=${actors.Reader.token}`, headers: { [CSRF_HEADER]: actors.Reader.csrf }, body: 'not multipart' }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'forbidden', action: 'media.create' });
  });

  it('stores the upload and answers with the address the field will hold', async () => {
    const res = await mediaHandler(request('/media', upload(actors.Editor, form(await raster('jpeg', 3000, 2000, 13), 'banner.jpg'))));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { media: { src: string; thumb: string; mime: string; width: number; height: number; filename: string; bytes: number } };
    expect(body.media).toMatchObject({ mime: 'image/webp', width: 2000, filename: 'banner.webp' });
    expect(body.media.src).toMatch(/^\/uploads\/\d{6}\/[0-9a-f]{12}-[0-9a-f]{8}\.webp$/);
    expect(body.media.thumb).toBe(body.media.src.replace(/\.webp$/, `-${THUMB_EDGE}.webp`));
    expect(body.media.bytes).toBeGreaterThan(0);

    const audit = await db
      .selectFrom('audit_log')
      .select(['action', 'entity_type', 'entity_id'])
      .where('actor_id', '=', actors.Editor.id)
      .where('entity_type', '=', 'media')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ action: 'media.create', entity_type: 'media' });
  });

  it('rejects a body that is not multipart, and one that is not an image', async () => {
    const bad = await mediaHandler(request('/media', jsonPost(actors.Editor, { filename: 'x.png', data: 'AAAA' })));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_input' });

    const markup = await mediaHandler(
      request('/media', upload(actors.Editor, form(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg'))),
    );
    expect(markup.status).toBe(400);
    expect(await markup.json()).toMatchObject({ error: 'not_an_image_unsupported_format' });
  });

  it('lists what the library holds, newest first', async () => {
    await putUpload({ bytes: await raster('png', 700, 400, 14), filename: 'list-a.png', actorId: actors.Editor.id }, { root });
    const res = await mediaHandler(request('/media?limit=5', { cookie: `shamah_session=${actors.Editor.token}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { src: string; filename: string; alt: { ar: string; en: string } }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.items[0].src).toMatch(/^\/uploads\//);
  });

  it('writes the alt text of a stored picture in both languages', async () => {
    const stored = await putUpload({ bytes: await raster('png', 100, 80, 15), filename: 'alt.png', actorId: actors.Editor.id }, { root });
    if (!stored.ok) throw new Error('upload failed');
    const res = await mediaHandler(
      request(`/media/${stored.value.id}`, {
        ...jsonWrite(actors.Editor, { alt: { ar: 'وصف', en: 'A caption' } }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await db.selectFrom('media').select(['alt_ar', 'alt_en']).where('id', '=', stored.value.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ alt_ar: 'وصف', alt_en: 'A caption' });
  });

  it('never leaves a row without the files it points at', async () => {
    const rows = await db.selectFrom('media').select(['id', 'path']).where('created_by', 'in', [actors.Editor.id, actors.Reader.id]).execute();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const main = await readFile(join(root, row.path)).catch(() => null);
      const companion = await readFile(join(root, row.path.replace(/\.webp$/, `-${THUMB_EDGE}.webp`))).catch(() => null);
      expect(main, `${row.path} exists on disk for row ${row.id}`).not.toBeNull();
      expect(companion, `${row.path} has its ${THUMB_EDGE}px companion`).not.toBeNull();
    }
  });
});
