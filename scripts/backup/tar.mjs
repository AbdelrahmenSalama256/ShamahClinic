/**
 * A small, dependency-free tar writer (ustar + gzip), used by the nightly backup.
 *
 * Why not call the host's `tar`: on Windows the archive path contains `C:`, which GNU tar
 * reads as a remote host (`Cannot connect to C: resolve failed`), and the flag that fixes
 * that is not understood by the other tar. Server-side extraction is still the system tar —
 * this only has to emit a standard archive it can read. Every name in the uploads folder is
 * an ASCII hash produced by the upload pipeline, so the 100-byte name field is safe; longer
 * paths use the ustar `prefix` field rather than silently truncating.
 */
import { createReadStream, createWriteStream, readdirSync, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BLOCK = 512;
const ZEROS = Buffer.alloc(1024);

function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

/** Split a path into ustar's 155-byte prefix and 100-byte name; null if it cannot fit. */
export function splitName(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) {
    const prefix = path.slice(0, at);
    const name = path.slice(at + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  return null;
}

export function tarHeader({ name, size, mtime, mode = 0o644, type = '0' }) {
  const split = splitName(name);
  if (!split) throw new Error(`Tar name is too long: ${name}`);
  const header = Buffer.alloc(BLOCK);
  header.write(split.name, 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii'); // uid
  header.write(octal(0, 8), 116, 8, 'ascii'); // gid
  header.write(octal(size, 12), 124, 12, 'ascii');
  header.write(octal(Math.max(0, Math.floor(mtime / 1000)), 12), 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii'); // checksum computed with spaces here
  header.write(type, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write(split.prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

/** Every directory and file under `root`, as archive names relative to its parent. */
export function listEntries(uploadsDir, archiveName = 'uploads') {
  const entries = [];
  const walk = (directory, archivePath) => {
    entries.push({ path: archivePath, type: '5', size: 0, mtime: 0, mode: 0o755 });
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const name = `${archivePath}/${entry.name}`;
      if (entry.isDirectory()) walk(full, name);
      else if (entry.isFile()) {
        const info = statSync(full);
        entries.push({ path: name, type: '0', size: info.size, mtime: info.mtimeMs, mode: 0o644 });
      }
      // A symlink or device inside the uploads folder is not something the pipeline makes;
      // it is left out rather than followed somewhere this backup cannot vouch for.
    }
  };
  walk(uploadsDir, archiveName);
  // The first entry is the folder itself; keep its own mtime for a faithful restore.
  entries[0].mtime = statSync(uploadsDir).mtimeMs;
  return entries;
}

export async function writeTarGz(uploadsDir, outPath) {
  const entries = listEntries(uploadsDir, uploadsDir.split(/[\\/]/).filter(Boolean).pop() ?? 'uploads');
  const root = join(uploadsDir, '..');
  async function* blocks() {
    for (const entry of entries) {
      yield tarHeader({ name: entry.path, size: entry.size, mtime: entry.mtime, mode: entry.mode, type: entry.type });
      if (entry.type !== '0') continue;
      const full = join(root, ...entry.path.split('/'));
      let written = 0;
      for await (const chunk of createReadStream(full)) {
        written += chunk.length;
        yield chunk;
      }
      if (written !== entry.size) throw new Error(`${entry.path} changed size while being archived.`);
      const pad = (BLOCK - (entry.size % BLOCK)) % BLOCK;
      if (pad) yield Buffer.alloc(pad);
    }
    yield ZEROS;
  }
  await pipeline(Readable.from(blocks()), createGzip({ level: 6 }), createWriteStream(outPath));
}
