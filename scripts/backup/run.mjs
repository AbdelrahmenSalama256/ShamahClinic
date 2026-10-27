/**
 * Nightly backup: the database as a dump, the uploads folder as a tar, and a manifest
 * that says what the two files are supposed to be.
 *
 *   node scripts/backup/run.mjs --env-file /home/USER/shamah.env \
 *        --uploads /home/USER/shamah-media/uploads \
 *        --out /home/USER/backups --keep 7
 *       A dry run: prints what would be written, how many files and bytes are in the
 *       uploads folder, and which old backups would be deleted. Changes nothing.
 *
 *   … the same arguments with --apply
 *       Writes `--out/backup-<UTC stamp>/` containing:
 *         db.json.gz        the same dump `scripts/db/move-data.mjs dump` produces
 *         uploads.tar.gz    the uploads folder, archived as `uploads/…` so a restore
 *                           extracts it straight back into MEDIA_ROOT
 *         manifest.json     timestamp, database host/name, file sizes and SHA-256 hashes
 *       then deletes older `backup-*` folders beyond `--keep`, newest kept.
 *
 * The database dump is data only, not schema: the schema is the migrations in the deploy
 * artifact. Restore is therefore `server-setup.mjs --apply`, then `move-data.mjs restore
 * --replace` (a freshly migrated database already holds a seeded row), then untar the
 * uploads. `docs/SELF-HOSTED.md` has the exact commands; this script has been through that
 * sequence against a scratch database.
 *
 * Plain JavaScript on purpose: the server has no tsx and no dev dependencies.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from '../db/move-data.mjs';
import { writeTarGz } from './tar.mjs';

/** Resolved from this file, so cron may start it from any working directory. */
const MOVE_DATA = fileURLToPath(new URL('../db/move-data.mjs', import.meta.url));

const FORMAT = 'shamah-backup/1';
const STAMP = /^backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ$/;

export function parseArgs(argv) {
  const args = { envFile: null, uploads: null, out: null, keep: 7, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--uploads') args.uploads = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--keep') args.keep = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.envFile || !args.uploads || !args.out) {
    throw new Error('Usage: run.mjs --env-file <server.env> --uploads <MEDIA_ROOT/uploads> --out <backup folder> [--keep 7] [--apply]');
  }
  if (!Number.isInteger(args.keep) || args.keep < 1 || args.keep > 365) {
    throw new Error('--keep must be a whole number between 1 and 365.');
  }
  return args;
}

/** `2026-10-27T12-34-56Z` — no colons, so the same name is legal on every filesystem. */
export function backupStamp(at = new Date()) {
  return `backup-${at.toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z`;
}

/**
 * Which existing folders a run keeps and which it deletes. Only this script's own
 * `backup-<stamp>` names count; anything else in the folder is never touched.
 */
export function planRetention(names, keep) {
  const ours = names.filter((name) => STAMP.test(name)).sort();
  const newestFirst = [...ours].reverse();
  return { keep: newestFirst.slice(0, keep), remove: newestFirst.slice(keep) };
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Files and bytes under a folder, symlinks followed once per entry. */
export function folderStats(root) {
  let files = 0;
  let bytes = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  walk(root);
  return { files, bytes };
}

function child(command, argv, label) {
  const result = spawnSync(command, argv, { stdio: 'inherit' });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status}.`);
}

async function main(args) {
  const envFile = resolve(args.envFile);
  const uploads = resolve(args.uploads);
  const out = resolve(args.out);

  if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
  if (!existsSync(uploads) || !statSync(uploads).isDirectory()) throw new Error(`Uploads folder not found: ${uploads}`);

  const env = { ...process.env, ...readEnvFile(envFile) };
  const here = { host: env.DATABASE_HOST ?? '(unset)', database: env.DATABASE_NAME ?? '(unset)' };
  const stats = folderStats(uploads);
  const stamp = backupStamp();
  const target = join(out, stamp);
  const { remove } = planRetention(existsSync(out) ? readdirSync(out) : [], args.keep);

  console.log(`Database: ${here.database} on ${here.host} (credentials from ${envFile}, never printed)`);
  console.log(`Uploads:  ${uploads} — ${stats.files} file(s), ${stats.bytes} byte(s)`);
  console.log(`Backup:   ${target}`);
  console.log(`Retention: keep ${args.keep}; would delete ${remove.length ? remove.join(', ') : 'nothing'}`);

  if (!args.apply) {
    console.log('\nDry run. Nothing was written; add --apply to run it.');
    return;
  }

  mkdirSync(out, { recursive: true });
  if (existsSync(target)) throw new Error(`Backup already exists: ${target}`);
  mkdirSync(target);

  try {
    const dbFile = join(target, 'db.json.gz');
    const uploadsFile = join(target, 'uploads.tar.gz');
    child(process.execPath, [MOVE_DATA, 'dump', '--from', envFile, '--out', dbFile], 'Database dump');
    console.log(`Uploads archive: ${uploadsFile}`);
    await writeTarGz(uploads, uploadsFile);

    const manifest = {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      database: here,
      uploads: { folder: basename(uploads), ...stats },
      files: {
        'db.json.gz': { bytes: statSync(dbFile).size, sha256: sha256File(dbFile) },
        'uploads.tar.gz': { bytes: statSync(uploadsFile).size, sha256: sha256File(uploadsFile) },
      },
      retention: { keep: args.keep },
    };
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    for (const name of remove) {
      rmSync(join(out, name), { recursive: true, force: true });
      console.log(`Removed old backup ${name}`);
    }
    console.log(`\nBackup written: ${target}`);
  } catch (error) {
    // An incomplete folder looks like a backup to a person reading `ls`; remove only the
    // directory this run created a moment ago.
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(new URL(import.meta.url)));
if (isMain) {
  main(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
