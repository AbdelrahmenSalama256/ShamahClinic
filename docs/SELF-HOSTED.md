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

## Deployment

Not written here yet. This file will carry the cPanel AI App Hosting steps, the
Cloudways/VPS + PM2 steps, the artifact inventory and the environment variable names when
A-7 lands. No build is produced until the owner says so.
