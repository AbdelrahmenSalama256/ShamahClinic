#!/usr/bin/env node
/**
 * Pulls every piece of WordPress content this site renders into `data/wp/*.json`.
 * Run locally before deploying: `npm run sync:wp`
 *
 * `next build` reads ONLY these files (zero requests to the client's production
 * WordPress). At runtime the site tries live WordPress with a short abort and
 * falls back to this snapshot.
 */
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const ORIGIN = (process.env.WP_BASE_URL || "https://www.shamahclinics.com").replace(/\/+$/, "");
const OUT_DIR = path.resolve(process.cwd(), "data", "wp");
const IMG_DIR = path.resolve(process.cwd(), "public", "wp");

/** Mirroring is bounded so a runaway media library cannot bloat the deploy. */
const MIRROR_MAX_IMAGES = 140;
const MIRROR_MAX_WIDTH = 1280;
const MIRROR_MAX_INPUT_BYTES = 12_000_000;
const MIRROR_QUALITY = 72;

const CONCURRENCY = 2;
const DELAY_MS = 300;
const TIMEOUT_MS = 30_000;
const RETRIES = 1;
const RETRY_BACKOFF_MS = [1500, 4000];

/** WP list views never carry `content`; detail views do. Snapshots store both. */
const LIST_FIELDS = "id,slug,date,modified,link,title,excerpt,categories,featured_media";
const CONTENT_FIELDS = `${LIST_FIELDS},content`;
const MEDIA_FIELDS = "id,source_url,alt_text,media_details";
const PAGE_LIST_FIELDS = "id,slug,date,modified,link,title,excerpt";
const PAGE_CONTENT_FIELDS = `${PAGE_LIST_FIELDS},content`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requests = 0;
let bytes = 0;

async function fetchJson(url, { text = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      requests += 1;
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "shamah-site-sync/1.0 (+read-only CMS snapshot)",
          Accept: text ? "text/html" : "application/json",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const body = text ? await res.text() : await res.json();
      bytes += Buffer.byteLength(typeof body === "string" ? body : JSON.stringify(body));
      return { ok: true, body, elapsed: Date.now() - started };
    } catch (err) {
      lastErr = err;
      console.warn(`  ! attempt ${attempt + 1} failed (${err.message}) for ${shorten(url)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastErr?.message || "unknown error" };
}

function shorten(url) {
  return url.replace(ORIGIN, "").slice(0, 110);
}

/** Rest base per language subsite (TranslatePress keeps ids stable across both). */
const rest = (lang, rel) => `${ORIGIN}${lang === "ar" ? "/ar" : ""}/wp-json${rel}`;

/** Simple pool: keeps at most CONCURRENCY requests in flight, spaced by DELAY_MS. */
async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      await sleep(DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function writeJson(name, value) {
  const file = path.join(OUT_DIR, name);
  const payload = JSON.stringify(value, null, 0);
  await writeFile(file, payload, "utf8");
  return { file: `data/wp/${name}`, kb: Math.round(payload.length / 1024) };
}

/** Media objects are language-neutral, so one map covers both subsites. */
async function collectMedia(posts, pages) {
  const ids = new Set();
  for (const list of [posts.en, posts.ar, pages.en, pages.ar]) {
    for (const item of list || []) if (item?.featured_media) ids.add(item.featured_media);
  }
  const ordered = [...ids].sort((a, b) => a - b);
  const chunks = [];
  for (let i = 0; i < ordered.length; i += 100) chunks.push(ordered.slice(i, i + 100));
  const out = [];
  for (const chunk of chunks) {
    const rel = `/wp/v2/media?include=${chunk.join(",")}&per_page=100&_fields=${MEDIA_FIELDS}`;
    const r = await fetchJson(rest("en", rel));
    if (r.ok && Array.isArray(r.body)) out.push(...r.body);
    else console.warn(`  media chunk skipped: ${r.error}`);
  }
  return { ids: ordered.length, media: out };
}

/**
 * `/results` shows the posts whose own body tells an outcome story. WordPress has
 * no result records and no before/after media (see docs/RESULTS-SOURCE.md), so the
 * only data-side signal for "this article is about a result" is the article text
 * naming one. Membership therefore comes from the body we already downloaded, at
 * sync time, instead of a second pass over 92 posts on every request. Titles,
 * excerpts, covers and dates still come from the live API at render time, so a
 * reworded article is fresh; only the phrase index is snapshot-derived.
 */
const RESULT_PHRASES = [
  "قبل وبعد",
  "قبل و بعد",
  "نتيجة العلاج",
  "نتائج العلاج",
  "النتائج بعد",
  "before and after",
  "before/after",
  "after treatment",
  "after results",
];

function collectResultStories(posts) {
  const byId = new Map();
  for (const lang of ["en", "ar"]) {
    for (const item of posts[lang] || []) {
      if (!item?.id) continue;
      const body = `${item.title?.rendered || ""} ${item.excerpt?.rendered || ""} ${item.content?.rendered || ""}`
        .replace(/<[^>]+>/g, " ")
        .replace(/\u0640/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
      const found = RESULT_PHRASES.filter((p) => body.includes(p.toLowerCase()));
      if (!found.length) continue;
      const row = byId.get(item.id) || { id: item.id, slug: item.slug, phrases: [] };
      row.phrases = [...new Set([...row.phrases, ...found])];
      byId.set(item.id, row);
    }
  }
  return [...byId.values()];
}

/** Head meta for a small set of canonical URLs (detail pages fall back to WP title/excerpt). */
async function collectSeo() {
  const targets = [
    ["en", `${ORIGIN}/`],
    ["ar", `${ORIGIN}/ar/`],
    ["en", `${ORIGIN}/about-us/`],
    ["ar", `${ORIGIN}/ar/about-us/`],
    ["en", `${ORIGIN}/services/`],
    ["ar", `${ORIGIN}/ar/services/`],
    ["en", `${ORIGIN}/contact/`],
    ["ar", `${ORIGIN}/ar/contact/`],
  ];
  const res = await pool(
    targets,
    async ([lang, url]) => {
      const r = await fetchJson(url, { text: true });
      if (!r.ok) return { lang, url, head: null };
      return { lang, url, head: parseHead(r.body) };
    },
    CONCURRENCY,
  );
  return res.filter((x) => x && x.head);
}

function parseHead(html) {
  const grab = (re) => {
    const m = html.match(re);
    return m ? decode(m[1]).trim() : "";
  };
  return {
    title: grab(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description:
      grab(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      grab(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i),
    canonical: grab(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    ogImage:
      grab(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
      grab(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i),
  };
}

function decode(value) {
  return value
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "");
}

async function main() {
  const started = Date.now();
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Syncing WordPress snapshot from ${ORIGIN} (both subsites)`);

  const listJobs = [
    ["posts.en", rest("en", `/wp/v2/posts?per_page=100&_fields=${CONTENT_FIELDS}`)],
    ["posts.ar", rest("ar", `/wp/v2/posts?per_page=100&_fields=${CONTENT_FIELDS}`)],
    ["pages.en", rest("en", `/wp/v2/pages?per_page=100&_fields=${PAGE_CONTENT_FIELDS}`)],
    ["pages.ar", rest("ar", `/wp/v2/pages?per_page=100&_fields=${PAGE_CONTENT_FIELDS}`)],
    ["categories.en", rest("en", "/wp/v2/categories?per_page=100&_fields=id,name,slug,count")],
    ["categories.ar", rest("ar", "/wp/v2/categories?per_page=100&_fields=id,name,slug,count")],
    ["products.en", rest("en", "/wc/store/v1/products?per_page=100")],
    ["products.ar", rest("ar", "/wc/store/v1/products?per_page=100")],
    ["offer-categories.en", rest("en", "/wc/store/v1/products/categories")],
  ];

  const collected = {};
  await pool(listJobs, async ([key, url]) => {
    const r = await fetchJson(url);
    if (!r.ok) throw new Error(`${key}: ${r.error}`);
    console.log(`  ok ${key.padEnd(20)} ${Array.isArray(r.body) ? r.body.length : 1} items  ${shorten(url)}`);
    collected[key] = r.body;
    return key;
  });

  const posts = { en: collected["posts.en"], ar: collected["posts.ar"] };
  const pages = { en: collected["pages.en"], ar: collected["pages.ar"] };

  console.log("  fetching media map…");
  const { ids, media } = await collectMedia(posts, pages);
  console.log(`  ok media                 ${media.length}/${ids} referenced ids resolved`);

  console.log("  fetching SEO head meta…");
  const seo = await collectSeo();
  console.log(`  ok seo                   ${seo.length} URLs`);

  const candidates = await collectMirrorCandidates({
    posts,
    pages,
    media,
    products: collected["products.en"],
  });
  const previousImages = (await readIfExists(path.join(OUT_DIR, "images.json"))) || {};
  console.log(`  mirroring ${candidates.length} images the site renders…`);
  const mirror = await mirrorImages(candidates, previousImages);
  console.log(
    `  ok images                ${Object.keys(mirror.map).length}/${mirror.total} on disk ` +
      `(${mirror.written} encoded, ${mirror.reused} unchanged, ${mirror.skipped} left on WordPress), ` +
      `${(mirror.bytes / 1024 / 1024).toFixed(1)} MB`,
  );

  // Split the content-bearing lists into a small list view (what listings read)
  // and a content view (what detail pages read), mirroring the live API contract.
  const strip = (item, fields) => {
    const out = {};
    for (const f of fields) if (item[f] !== undefined) out[f] = item[f];
    return out;
  };
  const postListFields = LIST_FIELDS.split(",");
  const pageListFields = PAGE_LIST_FIELDS.split(",");

  const files = [];
  files.push(await writeJson("posts-list.en.json", posts.en.map((p) => strip(p, postListFields))));
  files.push(await writeJson("posts-list.ar.json", posts.ar.map((p) => strip(p, postListFields))));
  files.push(await writeJson("posts.en.json", posts.en));
  files.push(await writeJson("posts.ar.json", posts.ar));
  files.push(await writeJson("pages-list.en.json", pages.en.map((p) => strip(p, pageListFields))));
  files.push(await writeJson("pages-list.ar.json", pages.ar.map((p) => strip(p, pageListFields))));
  files.push(await writeJson("pages.en.json", pages.en));
  files.push(await writeJson("pages.ar.json", pages.ar));
  files.push(await writeJson("categories.en.json", collected["categories.en"]));
  files.push(await writeJson("categories.ar.json", collected["categories.ar"]));
  files.push(await writeJson("products.en.json", collected["products.en"]));
  files.push(await writeJson("products.ar.json", collected["products.ar"]));
  files.push(await writeJson("offer-categories.en.json", collected["offer-categories.en"]));
  files.push(await writeJson("media.json", media));
  files.push(await writeJson("images.json", mirror.map));
  files.push(await writeJson("seo.json", seo));
  const resultStories = collectResultStories(posts);
  files.push(await writeJson("result-stories.json", resultStories));

  const previous = await readIfExists(path.join(OUT_DIR, "meta.json"));
  const meta = {
    generatedAt: new Date().toISOString(),
    previousGeneratedAt: previous?.generatedAt || null,
    origin: ORIGIN,
    requests,
    bytes,
    counts: {
      posts: posts.en.length,
      pages: pages.en.length,
      categories: collected["categories.en"].length,
      products: collected["products.en"].length,
      media: media.length,
      resultStories: resultStories.length,
      imagesMirrored: Object.keys(mirror.map).length,
      seoUrls: seo.length,
    },
  };
  files.push(await writeJson("meta.json", meta));

  console.log(`\nSnapshot written to ${OUT_DIR}`);
  for (const f of files) console.log(`  ${f.file.padEnd(32)} ${f.kb} KB`);
  console.log(`\n${requests} WordPress requests in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("Commit data/wp/ so the build stays WordPress-free.");
}

async function readIfExists(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** ------------------------------------------------------------------ *
 * Image mirror
 *
 * WordPress uploads are 0.9–2 MB PNGs behind an origin that takes seconds to
 * answer, and next/image must fetch them before it can resize them. Every image
 * this site actually renders is therefore downloaded once, re-encoded small and
 * served from `public/wp/`; anything not in the map keeps its live URL.
 * ------------------------------------------------------------------ */

/** Same size preference the runtime mappers use, so the keys line up. */
function chosenSrc(sizes, full) {
  if (!sizes) return full;
  for (const key of ["large", "medium_large", "full", "medium"]) {
    if (sizes[key]?.source_url) return sizes[key].source_url;
  }
  return Object.values(sizes)[0]?.source_url || full;
}

function isUpload(url) {
  return typeof url === "string" && url.includes("/wp-content/uploads/");
}

/**
 * Same canonical form the runtime mirror lookup uses: page builders print some
 * upload URLs protocol-relative and without the `www` the media library uses, and
 * those have to land on the same key as the REST `source_url`.
 */
function canonicalUpload(url) {
  const clean = String(url).trim();
  const hit = clean.match(/^(?:https?:)?\/\/[^/]*(\/wp-content\/uploads\/.*)$/);
  return hit ? `${ORIGIN}${hit[1].split("?")[0]}` : clean.split("?")[0];
}

function contentImages(html) {
  const out = [];
  if (!html) return out;
  // `src` covers ordinary images; the slider keeps its backgrounds in
  // `data-thumb`/`data-lazyload` on tags the sanitizer discards, so they need
  // collecting here or the hero would load them straight off the CMS host.
  for (const m of html.matchAll(/(?:<img[^>]+src|data-(?:thumb|lazyload))="([^"]+)"/g)) {
    // WP puts the size suffix in the src, e.g. `photo-1024x683.png`.
    const src = canonicalUpload(m[1].replace(/\s.*$/, ""));
    if (isUpload(src)) out.push(src);
  }
  return out;
}

/** Stable, readable filename: `2025-10-Botox-Injections4-a1b2c3d4.webp`. */
function localNameFor(url) {
  const file = new URL(url).pathname.split("/").pop() || "image";
  const slug = file
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 8);
  return `${slug || "wp-image"}-${hash}.webp`;
}

async function collectMirrorCandidates({ posts, pages, media, products }) {
  const urls = new Set();
  for (const m of media) {
    const src = canonicalUpload(chosenSrc(m.media_details?.sizes, m.source_url));
    if (isUpload(src)) urls.add(src);
  }
  for (const p of products) {
    for (const img of p.images || []) if (isUpload(img?.src)) urls.add(canonicalUpload(img.src));
  }
  for (const list of [posts.en, posts.ar, pages.en, pages.ar]) {
    for (const item of list || []) {
      for (const src of contentImages(item.content?.rendered)) urls.add(src);
    }
  }
  return [...urls];
}

async function mirrorImages(candidates, existingMap) {
  await mkdir(IMG_DIR, { recursive: true });
  const map = {};
  let reused = 0;
  let written = 0;
  let skipped = 0;
  let bytes = 0;

  const targets = candidates.slice(0, MIRROR_MAX_IMAGES);
  if (candidates.length > targets.length) {
    console.warn(`  ! ${candidates.length - targets.length} images over the mirror cap stay on WordPress URLs`);
  }

  const results = await pool(
    targets,
    async (url) => {
      const name = localNameFor(url);
      const file = path.join(IMG_DIR, name);
      if (existingMap[url] === `/wp/${name}`) {
        try {
          const info = await stat(file);
          map[url] = `/wp/${name}`;
          reused += 1;
          bytes += info.size;
          return "reuse";
        } catch {
          /* fall through and re-download */
        }
      }
      const r = await fetchBinary(url);
      if (!r.ok) {
        skipped += 1;
        return "fetch-failed";
      }
      if (r.body.length > MIRROR_MAX_INPUT_BYTES) {
        skipped += 1;
        return "too-large";
      }
      try {
        const out = await sharp(r.body)
          .rotate()
          .resize({ width: MIRROR_MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: MIRROR_QUALITY })
          .toFile(file);
        map[url] = `/wp/${name}`;
        written += 1;
        bytes += out.size;
        return "write";
      } catch {
        // Corrupt or unsupported media: keep the live URL rather than break the page.
        skipped += 1;
        return "decode-failed";
      }
    },
    3,
  );

  return { map, reused, written, skipped, bytes, attempted: results.length, total: candidates.length };
}

/** GET a binary asset; read-only, same politeness rules as the JSON pulls. */
async function fetchBinary(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      requests += 1;
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: "follow",
        headers: { "User-Agent": "shamah-site-sync/1.0 (+read-only CMS snapshot)", Accept: "image/avif,image/webp,image/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      return { ok: true, body };
    } catch (err) {
      console.warn(`  ! image attempt ${attempt + 1} failed (${err.message}) for ${shorten(url)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false };
}


main().catch((err) => {
  console.error(`\nsync:wp failed — ${err.message}`);
  process.exit(1);
});
