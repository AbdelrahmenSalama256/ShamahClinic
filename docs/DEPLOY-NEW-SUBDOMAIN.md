# Deploying this app to `new.shamahclinics.com`

This is the runbook for the **new** CMS on a **new subdomain**. It is written to be run by
the owner, step by step, with no secret pasted into any chat.

**What this runbook never touches.** `shamahclinics.com` and `www.shamahclinics.com` — not
their pages, not their existing DNS records, not their nameservers, not the WordPress
database or its files, and not the WordPress installation. Everything below happens under
the single name `new.shamahclinics.com` and inside one new database. If a step here seems to
require editing an existing record, stop: it is the wrong step.

The artifact is cut from this repository (branch `feature/cms-migration-redesign`). Nothing
is pushed anywhere by this preparation.

---

## 0. What is in the package, and how it is built

Two supported shapes. **Use shape A unless the host refuses to build.**

| | Shape A — the host builds (recommended) | Shape B — built locally, uploaded standalone |
|---|---|---|
| Upload | the source zip described below | `.next/standalone` + `.next/static` + `public` |
| Host runs | `npm ci` then `npm run build` | nothing (only `node server.js`) |
| Why | this host already built a Next 16 app successfully: Node 22 image, 423 packages, 60 s compile, 267 pages — see `docs/SELF-HOSTED.md` | only needed if the app is capped below ~1 GB RAM, or the panel cannot run a build step |
| Catch | `NEXT_PUBLIC_SITE_URL` must be set **before** the build | `output: 'standalone'` has to be added to `next.config.ts` first, and the database scripts are not in the output |

Versions and commands for shape A:

- **Node.js: 22** (the host's image). The code also runs on 24 (tested locally); Next 16
  needs 20.9 or newer.
- **Build:** `npm ci && npm run build` (`next build --webpack`). The build reads the frozen
  WordPress snapshot in `data/wp/`; it does not call WordPress.
- **Start:** `npm start` (`next start`). It listens on the injected `PORT` (the panel wires
  its proxy to port 10000 on this host) — do not hard-code 3000.
- **Processes: 1.** The cache and the revalidation path assume one app process; see
  “Cache and revalidation” in `docs/SELF-HOSTED.md` before ever raising this.

The source zip is cut with:

```sh
cd /d/shamah_cms
git archive --format=zip -o .tmp/shamah-cms-new-$(date +%Y-%m-%d).zip HEAD -- \
  src public data/wp scripts docs/SELF-HOSTED.md docs/DEPLOY-NEW-SUBDOMAIN.md \
  next.config.ts package.json package-lock.json tsconfig.json postcss.config.mjs eslint.config.mjs
```

It contains no `.env*`, no `node_modules`, no `.next*`, no `public/uploads`, no `backups/`,
no `data/wp-20*` dated snapshots and no `.git`. `data/wp/` **must** travel: it is the
fallback every public page reads when the database is unreachable or a row is missing.

### Environment variable names (values stay on the server)

Set these in the panel or in an env file **outside** the document root, mode 600:

```
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=<the database cPanel created>
DATABASE_USER=<the user cPanel created>
DATABASE_PASSWORD=<the password you typed in cPanel>
SESSION_SECRET=<32+ random characters — generate on the server, never send it>
NEXT_PUBLIC_SITE_URL=https://new.shamahclinics.com
MEDIA_ROOT=/home/USER/shamah-media/uploads
COOKIE_FORCE_SECURE=true
MOBILE_API_PASSWORD=<random secret, the same value the mobile app is built with>
```

Optional, only if used: `REVALIDATE_SECRET`, `DATABASE_POOL_SIZE`, `DATABASE_TLS`,
`DATABASE_TLS_CA_FILE`, `DATABASE_URL`, `LEAD_MODE`, `CF7_FORM_ID`, `WP_BASE_URL`,
`DATABASE_LOG_QUERIES`.

Do **not** set `LOCAL_DB_ROOT_PASSWORD`, `LOCAL_MARIADB_BASEDIR`, `LOCAL_MARIADB_MY_INI` —
those belong to the disposable database on this machine.

One way to make `SESSION_SECRET` without it ever leaving the server:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste the output straight into the env file. Do not send it in a message.

---

## 1. DNS — one record, and how to check the zone is real

**Record to add:**

| Type | Name | Value | Proxy |
|---|---|---|---|
| `A` | `new` | the server's IPv4 — `37.60.235.30` as seen in the panel on 2026-10-27; confirm it in cPanel → Server Information | **DNS only (grey cloud)** until step 3 is done, then proxying is optional |

That is the only DNS change in this runbook. Do not edit the apex (`shamahclinics.com`),
`www`, `mail`, or any existing record.

**The failure seen on 2026-10-27:** the record existed in Cloudflare but `new` answered
NXDOMAIN from Cloudflare's own nameservers, which usually means the Cloudflare zone is not
the zone the domain actually uses — adding the record changed nothing. Check before waiting:

```powershell
Resolve-DnsName shamahclinics.com -Type NS -Server 1.1.1.1
Resolve-DnsName new.shamahclinics.com -Server 1.1.1.1
```

- The first command must list the same nameservers the Cloudflare dashboard shows for this
  zone (usually `*.ns.cloudflare.com`). If it lists different servers, the live zone is
  elsewhere: **do not move the domain's nameservers for this** — that would affect the whole
  site. Either add the `A` record in the zone those nameservers serve, or ask the host what
  they expect. Send only the two command outputs, never account details.
- The second command must answer `37.60.235.30` (or the server's real address). NXDOMAIN
  means the record is not in the live zone yet.

## 2. Subdomain and document root

cPanel → **Domains → Create A New Domain** (or “Subdomains”):

1. Domain: `new.shamahclinics.com`.
2. Document root: a new folder, e.g. `/home/USER/new.shamahclinics.com`. Do not point it at
   the existing site's folder.
3. Leave “Share document root” **off**.

## 3. AutoSSL and HTTPS

1. cPanel → **SSL/TLS Status** → check `new.shamahclinics.com` → **Run AutoSSL**.
2. If it fails with a validation error, confirm the record resolves to this server (step 1)
   and that the proxy is off (grey cloud), then run it again. Cloudflare's proxy can answer
   the validation request itself and cPanel then never sees it.
3. Open `https://new.shamahclinics.com` once the certificate is issued. A browser warning
   means AutoSSL has not finished — do not continue until the padlock is clean.

## 4. Database

cPanel → **MySQL® Databases**:

1. Create a database, e.g. `shamah_new`. cPanel will show the full name prefixed with the
   account, e.g. `user_shamah_new` — **that full name** is `DATABASE_NAME`.
2. Create a user and a strong password. The full user name is also prefixed —
   **that full name** is `DATABASE_USER`.
3. Add the user to the database with **All Privileges**, on that database only.

Nothing here reads, writes or lists the WordPress database. If the panel offers to copy or
back up an existing database, decline.

## 5. Upload and build

1. Upload the zip from step 0 into the subdomain's folder and unpack it there, so
   `package.json` sits at the document root of the subdomain.
2. Put the environment file in place (step 0) **before** building.
3. From the panel's terminal, in that folder:

   ```sh
   node -v                 # must be 20.9+ (22 expected)
   npm ci                  # installs from package-lock.json, no network surprises
   npm run build           # next build --webpack
   ```

   A missing `NEXT_PUBLIC_SITE_URL` fails the build on purpose; the message names it.
4. Set the application's startup command to `npm start` (or the panel's “startup file” to
   `node_modules/next/dist/bin/next start`). Start it and confirm the log shows the app
   listening on the injected `PORT`.

## 6. Schema on the empty database — dry run, then apply

The first command changes nothing and must say the migrations are pending:

```sh
node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env
```

Then, and only if that output is what you expect:

```sh
node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env --apply
```

A second run of the same command is safe and should say “nothing to do”. If the database
itself must be created from the command line instead of cPanel, add `--create` (it needs
`SERVER_ADMIN_USER` / `SERVER_ADMIN_PASSWORD` and a loopback host) — see the script header.

## 7. Move the content from this machine

On this machine (source is read-only for the whole procedure):

```sh
node scripts/db/move-data.mjs dump --from .env.local --out backups/move-new-$(date +%Y-%m-%d).json.gz
```

Upload that one file to `/home/USER/backups/` on the server (it contains real leads and
password hashes — treat it like a password; it is gitignored here and must not be committed).

On the server, dry run first:

```sh
node scripts/db/move-data.mjs restore \
  --to /home/USER/shamah.env --in /home/USER/backups/move-new-2026-10-28.json.gz
```

It prints the target, the row counts per table, and what it would do. Then the write, which
**requires the target's name twice** — once in the env file, once on the command line:

```sh
node scripts/db/move-data.mjs restore \
  --to /home/USER/shamah.env --in /home/USER/backups/move-new-2026-10-28.json.gz \
  --replace --confirm-target user_shamah_new --apply
```

- `--confirm-target` must equal `DATABASE_NAME` in that env file. A typo is refused before a
  connection is opened, and `--apply` without it is refused outright.
- `--replace` is needed because a freshly migrated database seeds a row; it deletes only the
  tables named in the dump, on the target, after the dry run has shown you the counts.
- A restore into the database the dump came from is refused by the script itself.

Verify, then delete the dump from the server when the numbers match:

```sh
node scripts/db/move-data.mjs verify \
  --to /home/USER/shamah.env --in /home/USER/backups/move-new-2026-10-28.json.gz
```

Copy the media folder too, if `public/uploads` holds anything:

```sh
# from this machine to the server, into MEDIA_ROOT (never into the app folder)
# rsync -av public/uploads/ USER@HOST:/home/USER/shamah-media/uploads/
```

## 8. The Owner account

Create it on the server. The password is typed at a hidden prompt or piped in — never an
argument, never a message:

```sh
npm run owner:create -- --email you@example.com --name "Your Name" --locale ar --apply
```

The command is a dry run without `--apply` and prints what it would create. Do not run
`owner:reset` — it is not part of this deployment and would revoke existing sessions.

## 9. Nightly backup

Dry run first:

```sh
node scripts/backup/run.mjs --env-file /home/USER/shamah.env \
  --uploads /home/USER/shamah-media/uploads --out /home/USER/backups --keep 7
```

Then add the cron line (02:15 server time, keep the newest seven) using the path to the
Node binary the panel uses:

```cron
15 2 * * * cd /home/USER/new.shamahclinics.com && /home/USER/nodevenv/new.shamahclinics.com/22/bin/node scripts/backup/run.mjs --env-file /home/USER/shamah.env --uploads /home/USER/shamah-media/uploads --out /home/USER/backups --keep 7 --apply >> /home/USER/backups/cron.log 2>&1
```

Backups sit on the same disk as the database. Copy them somewhere else as well; a disk
failure takes both otherwise.

## 10. Browser smoke test (do these in order, on the phone as well)

1. `https://new.shamahclinics.com/` loads with a clean certificate; it is the **new** site,
   not the old one.
2. `/ar` loads and reads right-to-left.
3. Open one service, one offer, one article and one result page from the home page links.
4. `/console/login` loads, sign in with the Owner account from step 8.
5. In the console, open a page, change one word, save, publish, then reload the public page
   and see the word. This is the one test that proves the database, the write path and the
   public read path all work together.
6. Upload one image in the console and see it render on the public page (proves `MEDIA_ROOT`
   and the `/uploads` route).
7. Submit the contact form once and see the lead in the console.
8. Reload `/` twice with the app stopped: the site should still render from `data/wp/`
   rather than showing a 500.

## 11. If something fails

Send the failing step's **command and its output** (no secrets — the scripts print variable
names, not values) and the app log. The three failures seen before were: the artifact built
from the old site, a DNS record in a zone the domain does not use, and an environment
variable set after the build instead of before it.
