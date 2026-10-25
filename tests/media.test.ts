/**
 * #245 / BK-14a.1: a picture enters the site as bytes, never as a typed path.
 *
 * Three things are proved here and none of them can be proved by reading the code:
 *
 *   - the format comes from the **bytes**. A file called `hero.jpg` that is really a PNG is
 *     stored as a PNG with a PNG's MIME, because whatever the browser was told is not what
 *     the site will serve. An SVG is refused outright: it is a script wearing a picture's
 *     clothes, and an upload served from our own origin can read the console's cookies.
 *   - the same bytes twice are **one file and one row**, so an editor who re-sends a banner
 *     cannot leave `banner-2.webp` behind, and a library row whose file has vanished gets
 *     its file restored at the address the content already points to.
 *   - the route is the same enforcement path as everything else in the console: 401 with no
 *     session, 403 with no CSRF token, 403 with no `media.create` — and the 403 arrives
 *     before the 8 MB body is parsed.
 *
 * Files are written under a temporary root, never into `public/uploads`.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
import { MAX_UPLOAD_BYTES, putUpload } from '../src/lib/media/store';
import { canPassThrough, fitWithin } from '../src/lib/console/compress';
import { inspectImage } from '../src/lib/media/image-info';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-media-2026';
const MARK = `bk14a-${run}`;

const bytes = (...parts: number[][]): Uint8Array => new Uint8Array(parts.flat());
const be16 = (value: number): number[] => [(value >> 8) & 255, value & 255];
const be32 = (value: number): number[] => [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255];
const le16 = (value: number): number[] => [value & 255, (value >> 8) & 255];
const text = (value: string): number[] => [...value].map((character) => character.charCodeAt(0));
const pad = (length: number): number[] => Array.from({ length: Math.max(0, length) }, (_, index) => (index + 1) % 251);

const png = (width: number, height: number): Uint8Array =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    text('IHDR'),
    be32(width),
    be32(height),
    [8, 6, 0, 0, 0],
    be32(0x1234),
    text('IDAT'),
    pad(64),
  );

const jpeg = (width: number, height: number): Uint8Array =>
  bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), text('JFIF'), [0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0], [0xff, 0xc0], be16(17), [8], be16(height), be16(width), [3, 1, 17, 0, 2, 17, 1, 3, 17, 1], pad(40));

const webp = (width: number, height: number): Uint8Array =>
  bytes(text('RIFF'), [0, 0, 0, 0], text('WEBP'), text('VP8 '), be32(20), pad(3), [0x9d, 0x01, 0x2a], le16(width), le16(height), pad(40));

/** `VP8X` is the canvas header an extended (alpha or animated) WebP starts with. */
const webpExtended = (width: number, height: number): Uint8Array =>
  bytes(
    text('RIFF'),
    [0, 0, 0, 0],
    text('WEBP'),
    text('VP8X'),
    be32(10),
    [0],
    [0, 0, 0],
    [(width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255],
    [(height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255],
    pad(40),
  );

/** The shape a browser's canvas actually produces: an extended header, an alpha chunk, then the frame. */
const webpAlphaFirst = (width: number, height: number): Uint8Array =>
  bytes(
    text('RIFF'),
    [0, 0, 0, 0],
    text('WEBP'),
    text('VP8X'),
    be32(10),
    [0x10],
    [0, 0, 0],
    [(width - 1) & 255, ((width - 1) >> 8) & 255, ((width - 1) >> 16) & 255],
    [(height - 1) & 255, ((height - 1) >> 8) & 255, ((height - 1) >> 16) & 255],
    text('ALPH'),
    be32(8),
    pad(8),
    text('VP8 '),
    be32(20),
    pad(3),
    [0x9d, 0x01, 0x2a],
    le16(width),
    le16(height),
    pad(40),
  );

const gif = (width: number, height: number): Uint8Array => bytes(text('GIF89a'), le16(width), le16(height), [0xf7, 0, 0], pad(40));

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

function write(actor: Session, body: unknown): RequestInit & { cookie: string } {
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
  await Promise.all(media.map((row) => rm(join(process.cwd(), 'public', row.path), { force: true })));
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
  // would have written into — `public/uploads` — is redirected for the whole file.
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
  it('reads the size out of each format it accepts', () => {
    expect(inspectImage(png(1200, 630))).toEqual({ ok: true, info: { mime: 'image/png', ext: 'png', width: 1200, height: 630 } });
    expect(inspectImage(jpeg(4000, 3000))).toEqual({ ok: true, info: { mime: 'image/jpeg', ext: 'jpg', width: 4000, height: 3000 } });
    expect(inspectImage(webp(1024, 768))).toEqual({ ok: true, info: { mime: 'image/webp', ext: 'webp', width: 1024, height: 768 } });
    expect(inspectImage(webpExtended(800, 600))).toEqual({ ok: true, info: { mime: 'image/webp', ext: 'webp', width: 800, height: 600 } });
    expect(inspectImage(webpAlphaFirst(1024, 768))).toEqual({ ok: true, info: { mime: 'image/webp', ext: 'webp', width: 1024, height: 768 } });
    expect(inspectImage(gif(320, 240))).toEqual({ ok: true, info: { mime: 'image/gif', ext: 'gif', width: 320, height: 240 } });
  });

  it('refuses markup dressed as a picture', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(inspectImage(svg)).toEqual({ ok: false, reason: 'unsupported_format' });
    expect(inspectImage(new TextEncoder().encode('<?php system($_GET["c"]); ?>'))).toEqual({ ok: false, reason: 'unsupported_format' });
    // Bytes that are simply nothing known.
    expect(inspectImage(new Uint8Array(Array.from({ length: 64 }, (_, index) => (index * 37) % 256)))).toEqual({ ok: false, reason: 'unknown_format' });
  });

  it('refuses a file whose header lies about its size', () => {
    const broken = new Uint8Array(png(99_999, 1));
    expect(inspectImage(broken)).toEqual({ ok: false, reason: 'corrupt' });
    expect(inspectImage(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reason: 'too_small' });
    expect(inspectImage(new Uint8Array([]))).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('the browser half of the compression', () => {
  it('fits the long edge into 1600 and never enlarges', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1200, 630, 1600)).toEqual({ width: 1200, height: 630 });
    expect(fitWithin(900, 1600, 1600)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });

  it('sends a GIF and a small picture as they arrived', () => {
    expect(canPassThrough(9_000_000, 4000, 3000, 'image/gif')).toBe(true);
    expect(canPassThrough(120_000, 1200, 800, 'image/jpeg')).toBe(true);
    expect(canPassThrough(120_000, 4000, 800, 'image/jpeg')).toBe(false);
    expect(canPassThrough(2_000_000, 1200, 800, 'image/png')).toBe(false);
  });
});

describe('putUpload', () => {
  it('stores under the month folder named for the content hash', async () => {
    const data = png(1200, 630);
    const stored = await putUpload({ bytes: data, filename: 'الواجهة.png', actorId: actors.Editor.id }, { root, now: new Date('2026-10-25T10:00:00Z') });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    expect(stored.value.src).toMatch(/^\/uploads\/202610\/[0-9a-f]{12}\.png$/);
    // The name the person chose survives as the display name; the extension does not come from it.
    expect(stored.value.filename).toBe('الواجهة.png');
    expect(stored.value.mime).toBe('image/png');
    expect(stored.value.reused).toBe(false);

    const onDisk = await readFile(join(root, stored.value.src));
    expect(onDisk.length).toBe(data.length);

    const row = await db.selectFrom('media').select(['path', 'mime', 'width', 'height', 'sha256']).where('id', '=', stored.value.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ path: stored.value.src, mime: 'image/png', width: 1200, height: 630 });
  });

  it('names a lying filename after what the bytes actually are', async () => {
    const stored = await putUpload({ bytes: jpeg(2000, 1000), filename: 'photo.png', actorId: actors.Editor.id }, { root });
    expect(stored.ok && stored.value.src).toMatch(/\.jpg$/);
    expect(stored.ok && stored.value.mime).toBe('image/jpeg');
    expect(stored.ok && stored.value.filename).toBe('photo.jpg');
  });

  it('strips a path out of the display name instead of storing it', async () => {
    const stored = await putUpload({ bytes: webp(640, 480), filename: '../../etc/passwd', actorId: actors.Editor.id }, { root });
    expect(stored.ok && stored.value.filename).toBe('passwd.webp');
    expect(stored.ok && stored.value.filename).not.toContain('/');
  });

  it('keeps one row and one file for the same bytes', async () => {
    const data = gif(320, 240);
    const first = await putUpload({ bytes: data, filename: 'a.gif', actorId: actors.Editor.id }, { root });
    const second = await putUpload({ bytes: data, filename: 'b.gif', actorId: actors.Editor.id }, { root });
    expect(first.ok && second.ok && second.value.id).toBe(first.ok && first.value.id);
    expect(second.ok && second.value.reused).toBe(true);

    const rows = await db.selectFrom('media').select('id').where('sha256', '=', first.ok ? first.value.sha256 : '').execute();
    expect(rows).toHaveLength(1);
  });

  it('restores the file at the address content already points to', async () => {
    const data = png(800, 500);
    const stored = await putUpload({ bytes: data, filename: 'banner.png', actorId: actors.Editor.id }, { root });
    if (!stored.ok) throw new Error('upload failed');
    await rm(join(root, stored.value.src));

    const again = await putUpload({ bytes: data, filename: 'banner.png', actorId: actors.Editor.id }, { root });
    expect(again.ok && again.value.src).toBe(stored.value.src);
    expect(again.ok && again.value.reused).toBe(true);
    expect((await readFile(join(root, stored.value.src))).length).toBe(data.length);
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
  const payload = (data: Uint8Array, filename = 'hero.png'): { filename: string; data: string; alt: { ar: string; en: string } } => ({
    filename,
    data: Buffer.from(data).toString('base64'),
    alt: { ar: 'واجهة', en: 'Hero' },
  });

  it('answers 401 with no session and 403 with no CSRF token', async () => {
    expect((await mediaHandler(request('/media', { method: 'POST', body: JSON.stringify(payload(png(600, 400))) }))).status).toBe(401);
    const noCsrf = await mediaHandler(
      request('/media', { method: 'POST', cookie: `shamah_session=${actors.Editor.token}`, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(png(600, 400))) }),
    );
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()) as { error: string }).toMatchObject({ error: 'csrf_failed' });
  });

  it('refuses a caller without media.create before reading the body', async () => {
    const res = await mediaHandler(request('/media', write(actors.Reader, { filename: 'hero.png', data: 'not-even-base64-at-all', alt: { ar: '', en: '' } })));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'forbidden', action: 'media.create' });
  });

  it('stores the upload and answers with the address the field will hold', async () => {
    const res = await mediaHandler(request('/media', write(actors.Editor, payload(jpeg(3000, 2000), 'banner.jpg'))));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { media: { src: string; mime: string; width: number; filename: string } };
    expect(body.media).toMatchObject({ mime: 'image/jpeg', width: 3000, filename: 'banner.jpg' });
    expect(body.media.src).toMatch(/^\/uploads\/\d{6}\/[0-9a-f]{12}\.jpg$/);

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

  it('rejects a body that is not base64 and one that is not an image', async () => {
    const bad = await mediaHandler(request('/media', write(actors.Editor, { filename: 'x.png', data: '!!!!not base64!!!!', alt: { ar: '', en: '' } })));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_base64' });

    const markup = await mediaHandler(request('/media', write(actors.Editor, payload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg'))));
    expect(markup.status).toBe(400);
    expect(await markup.json()).toMatchObject({ error: 'not_an_image_unsupported_format' });
  });

  it('lists what the library holds, newest first', async () => {
    await putUpload({ bytes: png(700, 400), filename: 'list-a.png', actorId: actors.Editor.id }, { root });
    const res = await mediaHandler(request('/media?limit=5', { cookie: `shamah_session=${actors.Editor.token}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { src: string; filename: string; alt: { ar: string; en: string } }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.items[0].src).toMatch(/^\/uploads\//);
  });

  it('writes the alt text of a stored picture in both languages', async () => {
    const stored = await putUpload({ bytes: gif(100, 80), filename: 'alt.gif', actorId: actors.Editor.id }, { root });
    if (!stored.ok) throw new Error('upload failed');
    const res = await mediaHandler(
      request(`/media/${stored.value.id}`, {
        method: 'PATCH',
        cookie: `shamah_session=${actors.Editor.token}`,
        headers: { [CSRF_HEADER]: actors.Editor.csrf, 'content-type': 'application/json' },
        body: JSON.stringify({ alt: { ar: 'وصف', en: 'A caption' } }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await db.selectFrom('media').select(['alt_ar', 'alt_en']).where('id', '=', stored.value.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ alt_ar: 'وصف', alt_en: 'A caption' });
  });

  it('never leaves a row without the file it points at', async () => {
    const rows = await db.selectFrom('media').select(['id', 'path']).where('created_by', 'in', [actors.Editor.id, actors.Reader.id]).execute();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const onDisk = await readFile(join(root, row.path)).catch(() => null);
      expect(onDisk, `${row.path} exists on disk for row ${row.id}`).not.toBeNull();
    }
  });
});
