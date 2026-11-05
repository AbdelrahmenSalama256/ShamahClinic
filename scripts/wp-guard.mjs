/**
 * Loaded into the production server's process by scripts/prove-no-wp.mjs
 * (`NODE_OPTIONS=--import <this file>`), so the proof runs where the render happens.
 *
 * It does one thing: any outbound HTTP call to the WordPress origin is refused and
 * written to stderr as `[wp-guard] BLOCKED <url>`. The driver crawls every public
 * route and fails if a single line appears — "no live read" is then a property of the
 * running server, not just of the modules a unit test happened to import.
 *
 * Both transports are hooked, at different strengths: `globalThis.fetch` (undici) is what
 * app code would use and replacing it is airtight, because every module reads the property
 * at call time. `http/https.request` is patched on the exports object, which catches a
 * `https.request(...)` call but not an `import { request } from 'node:https'` binding taken
 * before this file ran — Node snapshots a builtin's named exports. That gap is why the
 * proof has a structural half (tests/no-wp-network.test.ts: no `fetch(` anywhere under
 * `src/lib`, no `wp-json` outside the lead route, the REST client file must stay deleted).
 * `net`/TLS sockets are deliberately not touched — MariaDB is a socket client on localhost
 * and the guard must stay blind to it.
 */
import http from 'node:http';
import https from 'node:https';

const HOSTS = (process.env.WP_GUARD_HOSTS || 'shamahclinics.com')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const blockedUrls = [];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isBlocked(url) {
  const host = hostnameOf(url);
  if (!host) return false;
  return HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function block(url, transport) {
  blockedUrls.push(url);
  console.error(`[wp-guard] BLOCKED ${transport} ${url}`);
  return new Error(`wp-guard: ${transport} to ${url} is refused in this process`);
}

function urlFrom(input) {
  if (typeof input === 'string' || input instanceof URL) return String(input);
  if (input && typeof input === 'object') {
    if (typeof input.url === 'string') return input.url;
    const options = input;
    if (options.protocol && options.hostname) {
      return `${options.protocol}//${options.hostname}${options.path || ''}`;
    }
  }
  return '';
}

const originalFetch = globalThis.fetch;
globalThis.fetch = function blockedFetch(input, init) {
  const url = urlFrom(input) || (input && init && init.href ? String(init.href) : '');
  if (url && isBlocked(url)) return Promise.reject(block(url, 'fetch'));
  return originalFetch.call(this, input, init);
};

for (const mod of [http, https]) {
  const transport = mod === https ? 'https' : 'http';
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function blockedRequest(...args) {
      const url = urlFrom(args[0]);
      if (url && isBlocked(url)) throw block(url, `${transport}.${method}`);
      return original.apply(this, args);
    };
  }
}

// The driver asserts this line exists: without it, "0 blocked requests" could just mean
// the guard never loaded into the server process.
console.error(`[wp-guard] armed, blocking hosts: ${HOSTS.join(', ')}`);

// A readable marker for the driver, in case the process is asked to report on exit.
process.on('exit', () => {
  if (blockedUrls.length) {
    console.error(`[wp-guard] total blocked: ${blockedUrls.length}`);
  }
});
