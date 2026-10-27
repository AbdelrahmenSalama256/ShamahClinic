# Self-hosted operation: uploads, backup, restore

This is the part of running the app on a plain Node server that is not the deploy itself
(that is in the deployment section at the end). It covers where uploaded pictures live,
how they are served, and how the database and those pictures are backed up and put back.

Everything below has been run against the local MariaDB and a scratch database on this
machine; the evidence for each claim is named where it matters.

## Where uploads live

Uploads are files on disk. There is no hosted driver, no token and no per-use service.

| | Value |
|---|---|
| Folder the app writes into | `<MEDIA_ROOT>/uploads/<yyyyMM>/` |
| `MEDIA_ROOT` default | `public` inside the app (local work only) |
| Address stored in the database | `/uploads/<yyyyMM>/<name>.webp` |
| Name | sha256 prefix + random id; never the uploaded filename |
| Format | re-encoded to WebP by sharp, EXIF stripped, main 2000 px + 640 px thumb |
| Size cap | 8 MB per file, checked before decoding |

On the server `MEDIA_ROOT` is an absolute path **outside the app folder and outside the
build output**, for example `/home/USER/shamah-media`. Two reasons: a redeploy replaces
the app folder, and the backup archives this folder by name. Because the database stores
`/uploads/...` and not the folder path, moving the folder does not rewrite a row.

The folder must not be executable. With cPanel the file mode is enough (`chmod -R 750`,
files `640`) and the document root never points at it. If the folder is served by the web
server instead of the app, deny everything except images:

```apache
<Directory /home/USER/shamah-media/uploads>
  Options -ExecCGI -Indexes
  php_flag engine off
  AllowOverride None
  Require all granted
  <FilesMatch "\.(?i:webp)$">
    Require all granted
  </FilesMatch>
  <FilesMatch "^(?!.*\.(?i:webp)$)">
    Require all denied
  </FilesMatch>
</Directory>
```

### The app's own route

When the web server is not configured to serve the folder, the app serves it at
`/uploads/<path>` (`src/app/uploads/[...path]/route.ts`):

- only `.webp` is served — everything else, including a `.php` planted in the folder, is a 404;
- a segment containing `..`, `\` or a NUL byte is refused, and the resolved path is checked
  again after following symlinks, so a link cannot leave `MEDIA_ROOT/uploads`;
- `Cache-Control: public, max-age=31536000, immutable` — safe because a name is random and
  never reused;
- `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`.

`tests/uploads-route.test.ts` (8 tests) holds the security boundary: traversal, backslash,
wrong extension, a directory, a symlink out of the folder, HEAD, and the 404 body.

## What a backup contains

`npm run backup` (or `node scripts/backup/run.mjs`) writes one folder per run:

```
/home/USER/backups/backup-2026-10-27T12-08-12Z/
  db.json.gz        the database as data (no schema), same format as db:move-data dump
  uploads.tar.gz    the uploads folder, archived as `uploads/…`
  manifest.json     createdAt, database host/name, file sizes and SHA-256
```

The schema is not in the dump on purpose: it is the migrations in the deploy artifact, and
`app_migrations` records which of them ran with which checksum. A restore therefore runs the
migrations first, then writes the data.

The dump is the same one `npm run db:move-data dump` makes: every table read with plain
`SELECT`s, one gzipped JSON document, 39 tables today (`app_migrations` excluded, it belongs
to the schema). It is written to the local disk of the machine running the command. It
contains leads and password hashes, so it is never committed and never emailed.

The uploads archive is written by a small in-process ustar + gzip writer
(`scripts/backup/tar.mjs`), not by the system `tar`: on Windows a path containing `C:` is
read by GNU tar as a remote host, and a backup that works only on the machine it was
written on is not a backup.

### Running it nightly

Dry run first — it prints the database name, the uploads count and bytes, and which old
backups it would delete, and writes nothing:

```sh
node scripts/backup/run.mjs --env-file /home/USER/shamah.env \
     --uploads /home/USER/shamah-media/uploads \
     --out /home/USER/backups --keep 7
```

Cron entry, 02:15 server time, keeping the newest seven:

```cron
15 2 * * * cd /home/USER/app && /home/USER/nodevenv/app/24/bin/node scripts/backup/run.mjs --env-file /home/USER/shamah.env --uploads /home/USER/shamah-media/uploads --out /home/USER/backups --keep 7 --apply >> /home/USER/backups/cron.log 2>&1
```

- Retention only ever deletes folders whose name matches `backup-<UTC stamp>`; anything else
  in the backup folder (including `cron.log`) is never touched.
- A run that fails removes the folder it had just created, so an incomplete folder cannot
  be mistaken for a backup.
- The dump is read-only against the source; it never writes to or deletes from the database.
- It is **not** a transactional snapshot. A row written while the dump is running can be in
  one table and not the next. Run it at a quiet hour; that is why the cron time is 02:15.
- Backups sit on the same server as the database. Copy them off the server (a second disk, a
  machine at the office, `restic`/`rclone` to storage the owner already pays for) — a disk
  failure takes the backup with it otherwise.

## Restoring

Two cases: a new server, or the same server after a mistake.

**1. Schema first.** On a new server, create the database, the one-database user and apply
every migration in one command. Without `--apply` it is a dry run:

```sh
SERVER_ADMIN_USER=root SERVER_ADMIN_PASSWORD=… \
  node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env --create --apply
```

The account is created at `DATABASE_HOST` (or `DATABASE_USER_HOST` when set), because that
is where the app connects from. On cPanel the database and user are usually created in the
panel instead; then run the same command without `--create`.

**2. Data next.** Dry run, then write:

```sh
node scripts/db/move-data.mjs restore --to /home/USER/shamah.env --in /home/USER/backups/backup-…/db.json.gz
node scripts/db/move-data.mjs restore --to /home/USER/shamah.env --in /home/USER/backups/backup-…/db.json.gz --replace --apply
```

`--replace` is required because a freshly migrated database is not empty — some migrations
seed a row (e.g. `stats_rollup_state`). The restore refuses to guess: without it, it names
the tables that already hold rows and stops. It verifies itself afterwards: per-table row
counts, a content hash per table, and every JSON column read back through the driver — the
app never calls `JSON.parse`, so a value that arrives as text would be the same silent bug
the settings reader had. It also checks that the target recorded the same migrations.

**3. Uploads.** The archive's root is `uploads/`, so extract it into `MEDIA_ROOT`:

```sh
tar -xzf /home/USER/backups/backup-…/uploads.tar.gz -C /home/USER/shamah-media
chmod -R 750 /home/USER/shamah-media/uploads
```

**4. Put the app back.** Start it and open the home page, one article, the results page and
`/console`. A restore brings back the `sessions` table: if `SESSION_SECRET` is the same as
before, cookies issued before the restore are valid again. After restoring onto a new host,
clear `sessions` (or rotate `SESSION_SECRET`) so old cookies do not come back to life.

### Tested restore (2026-10-27, local MariaDB 11.4.13)

A real backup of the local database was restored into a scratch database
(`shamah_cms_restore_probe`), created with `server-setup.mjs --create --apply` on an empty
schema:

- 8 migrations applied; 40 tables created.
- 39 tables / 941 rows written; every row count equal, every content hash `match`.
- 22 JSON columns checked on read: 160 `audit_log.before_json`, 233 `after_json`, 253
  `revisions.snapshot`, 99 `list_items.draft`, 95 `published`, 7 `lists.item_schema`, 6
  `offers.images`, 4 `leads.fields`, 15 `role_permissions.scope` — all "same objects/arrays",
  0 values arrived as text.
- `app_migrations`: 8 in the dump, 8 on the target.
- Uploads archive: 12 files / 511,402 bytes, extracted with system `tar`; all 12 SHA-256
  hashes identical to the live folder.
- Manifest hashes matched the two files on disk.
- The scratch database and its grant were dropped afterwards; the probe env file (it holds
  the password) was deleted.

What that proof does not cover: restoring onto the cPanel MariaDB itself (same engine
version is the reason it is expected to work), and a restore while the app is serving
traffic. Stop the app for step 2 and 3.

## Cache and revalidation: one process, or several

Every public page sets `export const revalidate = 300` (fourteen route files under
`src/app/[lang]`), so a page is rendered, kept, and re-rendered at most every five minutes.
The console is `force-dynamic` throughout.

When the console saves content, `src/lib/content/api.ts:418` calls
`revalidatePath('/[lang]', 'layout')` and `revalidatePath('/sitemap.xml', 'page')`; an SEO
save revalidates the one path it changed. That is what makes a save visible immediately
rather than after five minutes. React's `cache()` is per request only — it cannot serve a
stale value across requests, so it plays no part in this question.

- **One Node process.** The process that handled the save forgets the affected pages and
  the next request renders them from the database. This is the supported shape and what
  the code is written for.
- **More than one process (PM2 cluster, several Passenger workers).** The save is handled
  by *one* worker; `revalidatePath` only reaches that process's cache. The other workers
  keep serving their copy until their own 300-second window lapses. On a fresh page load
  the owner can therefore see the old number, refresh and see the new one, then the old one
  again — for up to five minutes. Nothing is lost, but "I saved it and it did not change"
  is exactly the bug the owner asked to be rid of.

**What does not depend on the process.** Sessions, CSRF hashes, login throttling,
`audit_log`, leads, settings and every content row are database rows, so all workers agree.
Uploads are files under `MEDIA_ROOT`, shared by every worker. There is no in-memory rate
limiter or session store to diverge.

**So: run one process.** PM2: `instances: 1`, `exec_mode: 'fork'` (crash-restart is fine;
clustering is not). Ask the host how many app processes AI App Hosting starts for one
application — that is on the list at the end. If the host insists on more than one, the
options in order of cost are: lower `revalidate` to 30–60 seconds (staleness bounded, more
database reads), run the console on a second deployment wired to the same database and keep
the public site single-process, or add a shared incremental-cache handler through Next's
`cacheHandler` setting.

**Not yet observed on a running server.** The save path's calls are asserted in
`tests/clinic-words.test.ts`, but whether a real `revalidatePath` from a running `next start`
replaces a page it had already cached is unproven here: it needs a built server and a login,
and there is no build without the owner's word. This is the one claim in this document that
stands on the code plus Next's contract rather than on a measurement.

## Security checklist (what to configure on the server)

The application side is already built this way; the list is what has to be true around it.

| | Requirement | Where it lives |
|---|---|---|
| Secrets | `SESSION_SECRET` (≥ 32 chars), `DATABASE_PASSWORD`, `REVALIDATE_SECRET` in an env file **outside the document root**, mode `600`; never in git, never in the artifact | `.env.example` names them; `npm run doctor` prints names only |
| TLS | The site and `/console` served over HTTPS; HTTP redirects to it | cPanel AutoSSL / reverse proxy |
| Cookies | Session cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production (`src/lib/auth/cookies.ts:53` forces Secure whenever `NODE_ENV=production`, whatever the proxy says) | code |
| CSRF | Every write needs the `x-csrf-token` header matching the `shamah_csrf` cookie (double submit) | `src/lib/auth/guard.ts:103` |
| Login throttling | 8 failures per account and 25 per address in 15 minutes, counted in `login_attempts`, so it survives a restart | `src/lib/auth/throttle.ts` |
| Sessions | Opaque 32-byte token; the database stores its SHA-256, so a dump cannot be replayed; 14-day life; logout revokes | `src/lib/auth/sessions.ts` |
| Database user | One user, one database, `localhost` only, no `GRANT`/`SUPER`/`FILE`. Migrations need DDL on that database, which is why the grant is `ALL` **on this database only** | `server-setup.mjs --create` |
| Uploads | Outside the app and the document root; not executable; served only as `.webp` by the app (or by the Apache block above) | `docs/SELF-HOSTED.md`, `src/app/uploads` |
| Backups | Outside the document root, mode `600`, copied off the machine; they contain leads and password hashes | `scripts/backup/run.mjs` |
| Diagnostics | `DATABASE_LOG_QUERIES` **off** in service | `.env.example` |
| What must not be reachable | `/.env*`, `/scripts`, `/node_modules`, `/.git`, `/backups`, `*.json.gz` dumps | deployment layout below |

Rotating `SESSION_SECRET` invalidates every console session at once (the token signature no
longer verifies). That is the emergency lever if a laptop with an open console session is
lost; nothing else has to change.

## Deployment

The artifact and the steps below are written out but **not executed**: the owner's rule is
that no `next build` runs without their word. Treat this section as the runbook to approve,
not as a record of something that happened.

### What the application needs at runtime

| | Value |
|---|---|
| Node.js | 24 (tested locally on v24.21.0). Next 16 requires 20.9 or newer; the host's AI App Hosting chooses from what it offers |
| Build command | `npm ci && npm run build` (which is `next build --webpack`) |
| Start command | `npm start` (`next start`), or `node server.js` when built with `output: 'standalone'` |
| Database | MariaDB/MySQL on `localhost`, `utf8mb4`, one database, one user |
| Memory | Next 16's build is the peak; if the host caps the app at 512 MB, build locally and upload standalone output |

### Environment variable names

Only these are read; values never go into the artifact.

```
DATABASE_HOST  DATABASE_PORT  DATABASE_NAME  DATABASE_USER  DATABASE_PASSWORD
DATABASE_POOL_SIZE  DATABASE_TLS  DATABASE_TLS_CA_FILE  DATABASE_URL
SESSION_SECRET  NEXT_PUBLIC_SITE_URL  REVALIDATE_SECRET  MEDIA_ROOT
LEAD_MODE  CF7_FORM_ID  WP_BASE_URL  COOKIE_FORCE_SECURE  DATABASE_LOG_QUERIES
```

`LOCAL_DB_ROOT_PASSWORD`, `LOCAL_MARIADB_BASEDIR` and `LOCAL_MARIADB_MY_INI` are for this
machine's disposable MariaDB and must not be set on the server.

### Artifact inventory

**Never in the zip:** `.env`, `.env.local`, `.env.test`, `node_modules` (unless uploading a
standalone build), `.next/cache`, `public/uploads`, `backups/`, `*.json.gz`, `docs/`, test
files that are not needed at runtime, `.git`.

**Always in the zip:** `src/`, `public/` (without `uploads/`), `next.config.ts`,
`package.json`, `package-lock.json`, `tsconfig.json`, `postcss.config.*`, `scripts/db/`
(needed once, to create and migrate the database), `docs/SELF-HOSTED.md`.

Two supported shapes:

1. **The host builds (cPanel AI App Hosting from an uploaded file or Git).** Upload the
   source as above; the host runs `npm ci && npm run build` and starts `npm start`. This is
   the simplest path and the one to prefer when the host allows a build and enough memory.
2. **Built locally, uploaded as standalone.** With `output: 'standalone'` added to
   `next.config.ts`, `npm run build` produces `.next/standalone` (server + traced
   `node_modules`), `.next/static` and `public`. Upload `.next/standalone`, then copy
   `.next/static` to `.next/standalone/.next/static` and `public` to
   `.next/standalone/public`, and start with `node server.js`. `MEDIA_ROOT` must still point
   outside the uploaded folder. The database scripts are **not** in that output; for the
   first setup upload `scripts/db/`, `src/lib/db/migrations/` and a small `package.json`
   listing `mysql2` (run `npm ci --omit=dev` in that folder so `server-setup.mjs` can reach
   the driver), or run the setup from the source upload before switching to the standalone
   one.

### cPanel (AI App Hosting)

1. Subdomain `test.shamahclinics.com`, own document root. Leave `shamahclinics.com` alone.
2. MySQL Databases: create the database and the user, grant that user all privileges on
   that database only. Note the names — cPanel prefixes them with the account name.
3. Environment file outside the document root, e.g. `/home/USER/shamah.env`, mode 600,
   containing the names above. `NEXT_PUBLIC_SITE_URL=https://test.shamahclinics.com`.
4. Upload the artifact (or connect the repository) and set the startup file/command the
   panel offers. Select the newest Node.js it offers (24 if present, 22 otherwise).
5. First run, once the app's Node version is active:
   ```sh
   node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env
   node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env --apply
   ```
   The first line is the dry run; it must say "8 migration files … 8 to apply".
6. Move the data from this machine (dry run first, then `--replace --apply`), copy
   `public/uploads` to `/home/USER/shamah-media/uploads`, then open the site.
7. Add the backup cron line (above) and the uploads folder permissions.

### Cloudways / any VPS with SSH + PM2

```sh
# once
mkdir -p /home/USER/app /home/USER/backups
# upload and unpack the artifact into /home/USER/app
cd /home/USER/app && npm ci && npm run build
node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env --apply
pm2 start npm --name shamah -- start      # instances: 1 in ecosystem.config.js
pm2 save
```

Reverse proxy (nginx) in front of `127.0.0.1:3000`, TLS from certbot, and the uploads folder
served either by the app or by an nginx `location /uploads/` with `try_files` into
`/home/USER/shamah-media/uploads/` — the app route already sends immutable cache headers, so
using it needs no proxy rule at all.

### What to ask the host before the first upload

1. Which Node.js versions AI App Hosting offers, and which is recommended.
2. How the application is started: an "application startup file" (what name?), a command, or
   `npm start`; and whether `output: 'standalone'` is supported.
3. How many app processes one application runs.
4. The memory limit per application (decides build-on-host vs build-locally).
5. Whether SSH or the cPanel Terminal is available.
6. The MariaDB server version (needs 10.6+ for `CHECK` constraints and window functions used
   by the migrations; the local one is 11.4.13) and its `max_allowed_packet`.
7. The exact database name and user cPanel creates (they are prefixed), to fill in
   `DATABASE_NAME` / `DATABASE_USER`.
8. Whether the plan allows cron jobs (needed for the nightly backup).

