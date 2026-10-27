# Local MariaDB — the backend's development database

The site will deploy to a cPanel host that runs MySQL/MariaDB, so local development uses
the **same dialect** rather than Postgres-in-dev. There is no dialect split to go wrong
at deploy time.

## Install layout

| Path | What |
|------|------|
| `D:\mariadb\mariadb-11.4.13-winx64\` | server binaries (portable zip, sha256 verified against `archive.mariadb.org`) |
| `D:\mariadb\my.ini` | config: port **3307**, `bind_address = 127.0.0.1`, `skip-name-resolve`, utf8mb4 |
| `D:\mariadb\data\` | data directory |
| `D:\mariadb\log\mariadbd.err` | server error log |

Loopback only — nothing on the network can reach it. 3307 is chosen because 3306 may be
taken by another MySQL service on the machine.

## Start and stop

```bash
npm run db:local:start     # foreground, logs to the terminal
npm run db:local:stop
```

Check it is listening:

```bash
netstat -ano | grep 3307
```

## Databases and users

| Database | User | Purpose |
|----------|------|---------|
| `shamah_cms` | `shamah_app` | development data |
| `shamah_cms_test` | `shamah_test` | tests and every destructive probe — never the dev database |

`scripts/db/provision-local.mjs` creates both, grants per-database privileges, sets the
local root password, and writes `.env.local` + `.env.test`. It refuses any host other than
`127.0.0.1`. Re-running it rotates the passwords in those two files.

**Credentials are never printed by any script and never committed.** The variables they
land in are:

```
DATABASE_HOST  DATABASE_PORT  DATABASE_NAME  DATABASE_USER  DATABASE_PASSWORD  DATABASE_URL
SESSION_SECRET
```

`.env.test` carries the same names pointing at `shamah_cms_test`.

## Guard against pointing a test at real data

`src/lib/db/guard.ts` throws unless the target database name ends in `_test` when
`NODE_ENV === 'test'`, and refuses `shamah_cms` for any destructive script. The
production cPanel database name will be different again, so a test run can never reach it.
