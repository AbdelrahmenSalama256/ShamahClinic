/**
 * Stop the loopback-only development MariaDB.
 * Needs the local root password, which lives in .env.local as LOCAL_DB_ROOT_PASSWORD.
 */
import process from 'node:process';
import mysql from 'mysql2/promise';

const password = process.env.LOCAL_DB_ROOT_PASSWORD;
if (!password) {
  console.error('LOCAL_DB_ROOT_PASSWORD is not set. Run with: node --env-file=.env.local scripts/db/local-stop.mjs');
  process.exit(1);
}

const root = await mysql.createConnection({
  ...(process.env.DATABASE_SOCKET?.trim()
    ? { socketPath: process.env.DATABASE_SOCKET.trim() }
    : {
        host: process.env.DATABASE_HOST ?? process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DATABASE_PORT ?? process.env.DB_PORT ?? 3307),
      }),
  user: 'root',
  password,
});
await root.query('SHUTDOWN');
await root.end();
console.log('MariaDB shutdown requested.');
