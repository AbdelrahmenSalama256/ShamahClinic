# cPanel deployment: newshamah.shamahclinics.com

This package contains the application source and a phpMyAdmin SQL file with the schema
and preserved pre-production website content. The SQL is built from the project's saved
WordPress snapshots and CMS source data; it is not an export of the inaccessible live
cPanel database and cannot include changes made there after those snapshots. It does not
contain `.env` credentials, additional user accounts, leads, sessions, analytics events,
uploads, `node_modules`, or a Next.js build cache.

The SQL includes the initial Owner account for `owner@newshamah.shamahclinics.com`;
its password is stored as a bcrypt hash, not plaintext. Change the password after the
first sign-in.

## 1. Confirm the hosting plan

In cPanel, confirm that **Setup Node.js App** (or equivalent) is available, with Node.js
22 or newer and access to a terminal/SSH. Shared hosting without a persistent Node.js
application cannot run this Next.js site. Confirm the provider supports one Node process
and tell you which startup command and application port to use.

## 2. Create the subdomain and database

1. Create `newshamah.shamahclinics.com` with its own application/document root. Do not
   share the existing website's document root.
2. Point its DNS record at the cPanel server and enable AutoSSL. Do not change the
   existing apex or `www` records.
3. In **MySQL Databases**, create a new database and database user. cPanel adds account
   prefixes; use the full names it displays. Grant the user all privileges on this
   database only. Do not connect this application to the existing WordPress database.

## 3. Upload and install

Before preparing a refreshed upload, run `npm run copy:catalog` and `npm run copy:check`
from the repository root. Copy the regenerated catalog and any source changes it reflects
into `cpanel-upload/`, then rebuild the ZIP from that folder. The build also regenerates
the catalog from the uploaded source before running Next.js, so a stale generated file
cannot block deployment.

Upload and extract `shamah-cpanel-newshamah.zip` into the new application directory so
`package.json` is directly inside it. The prepared source folder is `cpanel-upload/`;
the ZIP contains that folder's contents at its root. In cPanel's Node.js app settings,
select Node 22+ and set the application root to that directory.

The app now reads cPanel's reserved `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD` values directly. cPanel supplies these at runtime; do not try to override
them with `DATABASE_*` names in the application settings. Set the other variables below
in cPanel. For terminal commands, create a protected env file outside the public document
root, for example `/home/<cpanel-user>/shamah.env`, using the `DATABASE_*` names:

```text
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=<full cPanel database name>
DATABASE_USER=<full cPanel database user>
DATABASE_PASSWORD=<database password>
DATABASE_POOL_SIZE=4
SESSION_SECRET=<generate a unique random value on the server>
NEXT_PUBLIC_SITE_URL=https://newshamah.shamahclinics.com
COOKIE_FORCE_SECURE=true
MEDIA_ROOT=/home/<cpanel-user>/shamah-media
```

The app also supports `DATABASE_SOCKET=/path/to/mysql.sock` when cPanel exposes the
MySQL socket inside the Node app's filesystem. Set it in the Node app environment; with
this value, the app connects using the socket and does not attempt `localhost` TCP. A
socket path on the host is not usable unless it is visible to the Node app process.

Generate `SESSION_SECRET` on the server; do not reuse a local or example value:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the uploads directory outside the application folder. Do not put database passwords or the environment file under `public_html`. Restrict the
file to the cPanel account (for example, `chmod 600 /home/<cpanel-user>/shamah.env`).

### Import the schema with phpMyAdmin

The prepared folder includes `database/schema-phpmyadmin.sql` (about 25.5 MB), containing
all 45 application tables, migration records, 92 articles, 4 offers, 28 CMS pages,
2 categories, 90 entries across the public site lists, and the initial Owner account.
In phpMyAdmin, select the new, empty application database, open **Import**, choose that
SQL file, and run the import.
Make sure the server's phpMyAdmin upload limit allows a file of this size. Do not import
it into the existing WordPress database. Import it only once into an empty database.

The SQL file records the migration names and checksums, so the app will recognize these
migrations as applied. **Do not also run** `server-setup.mjs --apply` after importing the
SQL file.

In the cPanel terminal, run the following from the application root after importing the
SQL file. Use the same database credentials as the running application:

```sh
ENV_FILE=/home/<cpanel-user>/shamah.env
set -a
. "$ENV_FILE"
set +a
npm ci --include=dev
```

The terminal migration alternative is `node scripts/db/server-setup.mjs --env-file
"$ENV_FILE" --apply`; use it instead of the phpMyAdmin import, never in addition to it.
It installs the schema only, not the sample content or Owner.

## 4. Build and start

The SQL file already contains the preserved website content; do not run the WordPress
snapshot or list-import commands afterward. Sign in with the Owner email above and the
password you supplied, then change the password.

To make a new Owner account without SSH or a terminal, follow
[OWNER-PHPMYADMIN.md](./OWNER-PHPMYADMIN.md). Generate the bcrypt hash locally and run
its SQL in the application database's phpMyAdmin **SQL** tab.

Run the production build after the schema and preserved content are in place:

```sh
npm run build
```

Set the application startup command to:

```sh
npm start
```

Use the port assigned by the cPanel Node.js application manager; do not hard-code port
3600. Start or restart the app from cPanel.

## 5. Verify deployment

- `https://newshamah.shamahclinics.com/` loads over HTTPS.
- `/console/login` loads, and the Owner account created with the phpMyAdmin guide can sign in.
- The database is reachable, and the imported CMS content appears on the public site.
- Upload an image through the console and verify it appears after saving.
- Confirm cPanel's automatic restart/redeploy procedure preserves the external
  `MEDIA_ROOT` uploads directory.

Keep the database and uploads backed up outside the application directory. The repository
includes `scripts/backup/run.mjs`; configure it as a cPanel cron job after verifying its
dry-run output. Treat backups as sensitive if they contain leads or account data.
