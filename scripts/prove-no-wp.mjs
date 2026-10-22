/**
 * BK-7.4 — the runtime half of "the site never asks WordPress for anything".
 *
 * It starts the built server with scripts/wp-guard.mjs imported into its process,
 * crawls every public route the site itself advertises, then reads the server's
 * stderr. One `[wp-guard] BLOCKED` line and the run fails.
 *
 *   npm run build
 *   npm run prove:no-wp
 *
 * The route list is not hand-written: it is the `<loc>` set of /sitemap.xml, so the
 * crawl covers the journal, the offers, the services, the branches and every static
 * page in both languages, plus the paginated lists, the read-only /api/v1 endpoints
 * (the detail ones fed by the slugs the sitemap just returned) and the console login.
 * A route that answers anything but 2xx/3xx with a body is a failure, so a blank page
 * cannot be mistaken for a clean run.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 3117);
const BASE = `http://127.0.0.1:${PORT}`;
const CONCURRENCY = 4;
const LIST_PATH = /^(?:\/(?:en|ar))?\/(blogs|offers|results|services|pages)(?:$|\?)/;

const results = [];
const print = [];
const check = (condition, message) => {
  results.push(condition);
  print.push(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
  return condition;
};

function startServer() {
  const guard = fileURLToPath(new URL('wp-guard.mjs', import.meta.url));
  const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      // A file: URL keeps NODE_OPTIONS free of spaces and backslashes, both of which
      // it parses badly on Windows.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${pathToFileURL(guard).href}`.trim(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.stdout.resume();
  return { child, getStderr: () => stderr };
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode} before it became ready`);
    try {
      const res = await fetch(`${BASE}/robots.txt`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('server did not answer /robots.txt within 60 s');
}

async function fetchText(path) {
  const res = await fetch(BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  return { status: res.status, body: await res.text() };
}

/** Every URL the site points at itself — what a visitor can actually reach. */
async function sitePaths() {
  const { body } = await fetchText('/sitemap.xml');
  const paths = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => { try { return new URL(match[1]).pathname; } catch { return null; } })
    .filter(Boolean);
  return [...new Set(paths)];
}

async function detailPaths(paths) {
  const after = (prefix) => [...new Set(paths.filter((p) => p.startsWith(prefix)).map((p) => decodeURIComponent(p.slice(prefix.length))))].filter(Boolean);
  const article = after('/en/blogs/')[0];
  const offer = after('/en/offers/')[0];
  const out = [];
  if (article) out.push(`/api/v1/posts/${encodeURIComponent(article)}`, `/api/v1/posts/${encodeURIComponent(article)}?lang=ar`);
  if (offer) out.push(`/api/v1/offers/${encodeURIComponent(offer)}?lang=ar`);
  // /api/v1/pages/<slug> wants the WordPress page slug, which is not always the URL
  // segment the site renders (`privacy` maps to page 3 whose slug is longer), so the
  // slugs come from the pages list endpoint rather than from the sitemap.
  const list = await fetchText('/api/v1/pages');
  try {
    for (const item of (JSON.parse(list.body)?.items || []).slice(0, 2)) {
      if (item?.slug) out.push(`/api/v1/pages/${encodeURIComponent(item.slug)}`);
    }
  } catch {
    /* the list is crawled on its own, so a bad body is reported there */
  }
  return out;
}

async function crawl(paths) {
  const queue = [...paths];
  const done = [];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const path = queue.shift();
      try {
        const res = await fetchText(path);
        const isApi = path.startsWith('/api/');
        let parsed = true;
        if (isApi) {
          try { JSON.parse(res.body); } catch { parsed = false; }
        }
        done.push({ path, status: res.status, bytes: res.body.length, isApi, parsed });
      } catch (err) {
        done.push({ path, status: 0, bytes: 0, isApi: path.startsWith('/api/'), parsed: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
  await Promise.all(workers);
  return done;
}

async function main() {
  const { child, getStderr } = startServer();
  try {
    await waitForServer(child);
    const paths = await sitePaths();
    check(paths.length > 20, `sitemap lists ${paths.length} public URLs`);

    const listPaths = [...new Set(paths.filter((p) => LIST_PATH.test(p)))];
    const paged = listPaths.flatMap((list) => ['?page=2', '?page=3'].map((query) => list + query));
    const api = [
      '/api/v1/home?lang=en', '/api/v1/home?lang=ar', '/api/v1/posts?page=1',
      '/api/v1/posts?search=laser', '/api/v1/pages', '/api/v1/offers?lang=ar',
      '/api/v1/offer-categories', '/api/v1/categories', '/api/v1/branches',
      '/api/v1/services', '/api/v1/settings',
    ];
    const pages = [...paths, ...paged, ...api, ...(await detailPaths(paths)), '/console/login'];

    const crawled = await crawl(pages);
    // A page must carry a page; an API endpoint only has to answer with JSON it can
    // parse — an empty list is a legitimate answer now that a kind can be published
    // from the console one row at a time (the content assertions live in
    // tests/no-wp-network.test.ts, which runs against a database with nothing in it).
    const smallestPage = crawled.filter((r) => !r.isApi && r.status >= 200 && r.status < 400).reduce((min, r) => Math.min(min, r.bytes), Infinity);
    const bad = crawled.filter((r) => {
      const accepted = r.status >= 200 && r.status < 400;
      // An out-of-range list page is a branded 404 by design, so a `?page=` request is
      // allowed to answer 404; nothing else is.
      const allowed = !accepted && r.path.includes('?page=') && r.status === 404;
      if (accepted && r.isApi) return !r.parsed;
      if (accepted) return r.bytes < 4000;
      return !allowed;
    });
    bad.forEach((r) => check(false, `${r.path} -> HTTP ${r.status}, ${r.bytes} bytes${r.isApi && !r.parsed ? ' (body is not JSON)' : ''}${r.error ? ` (${r.error})` : ''}`));
    check(bad.length === 0, `${crawled.length} routes rendered, ${bad.length} failed; smallest HTML page ${smallestPage} bytes`);

    const stderr = getStderr();
    check(stderr.includes('[wp-guard] armed'), 'the guard reports it loaded into the server process');
    const blocked = stderr.split('\n').filter((line) => line.includes('[wp-guard] BLOCKED'));
    blocked.forEach((line) => console.error(line));
    check(blocked.length === 0, `the server attempted ${blocked.length} request(s) to the WordPress origin`);
    // The guard names the host in its own "armed" line, so exclude its output from the
    // check that the *server* never mentioned it.
    const mentions = stderr.split('\n').filter((line) => !line.includes('[wp-guard]')).join('\n').match(/shamahclinics\.com/g);
    check(!mentions, `the server log names the WordPress host ${mentions ? mentions.length : 0} time(s)`);
  } finally {
    child.kill();
    await sleep(500);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  print.forEach((line) => console.log(line));
  console.log(`\n${results.filter(Boolean).length} checks passed, ${results.filter((ok) => !ok).length} failed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
