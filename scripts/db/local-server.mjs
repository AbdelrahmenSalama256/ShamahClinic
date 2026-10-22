/**
 * Start the loopback-only development MariaDB in the foreground.
 * Install layout and the reason for port 3307: docs/LOCAL-MARIADB.md
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const basedir = process.env.LOCAL_MARIADB_BASEDIR ?? 'D:/mariadb/mariadb-11.4.13-winx64';
const defaultsFile = process.env.LOCAL_MARIADB_MY_INI ?? 'D:/mariadb/my.ini';

const binary = `${basedir}/bin/mariadbd.exe`;
if (!existsSync(binary)) {
  console.error(`mariadbd not found at ${binary}. Set LOCAL_MARIADB_BASEDIR or see docs/LOCAL-MARIADB.md.`);
  process.exit(1);
}
if (!existsSync(defaultsFile)) {
  console.error(`No config at ${defaultsFile}. Set LOCAL_MARIADB_MY_INI or see docs/LOCAL-MARIADB.md.`);
  process.exit(1);
}

const child = spawn(binary, [`--defaults-file=${defaultsFile}`, '--console'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
