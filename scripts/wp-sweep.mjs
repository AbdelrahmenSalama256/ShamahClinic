/**
 * Read-only sweep of the live WordPress site.
 *
 * The REST API only exposes post content, so it cannot prove what the site
 * actually publishes: widgets, footer blocks, gallery captions, pages that only
 * exist as pretty permalinks, and the Arabic subsite's own URLs are all outside
 * /wp-json. This script discovers every public URL from robots.txt + the
 * sitemaps + the links inside the homepage (EN and AR), fetches each page's
 * rendered HTML, and then searches everything we still keep in `src/data` for a
 * WordPress source. Its output is the evidence behind docs/STATIC-SWEEP.md.
 *
 * GET requests only, concurrency 2, 300 ms between requests, per-request
 * timeout, no form is ever submitted and nothing is written to WordPress.
 *
 * Usage
 *   node scripts/wp-sweep.mjs probe          is the origin answering at all?
 *   node scripts/wp-sweep.mjs crawl          discover + fetch -> .tmp/sweep/
 *   node scripts/wp-sweep.mjs match          search cache + snapshot -> matches.json
 *   node scripts/wp-sweep.mjs status         what the last crawl found
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

const WP = (process.env.WP_ORIGIN || "https://www.shamahclinics.com").replace(/\/+$/, "");
const OUT = new URL("../.tmp/sweep/", import.meta.url);
const HTML_DIR = new URL("html/", OUT);
const MANIFEST = new URL("manifest.json", OUT);
const MATCHES = new URL("matches.json", OUT);

const CONCURRENCY = 2;
const DELAY_MS = 300;
const TIMEOUT_MS = 25_000;
const MAX_URLS = 200;
const MAX_DEPTH = 2;
const RETRIES = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileFor = (url) => `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.html`;
const langOf = (url) => (/\/ar(\/|$)/.test(new URL(url).pathname) ? "ar" : "en");

const stats = { requests: 0, bytes: 0 };

/** One GET, retried once, never longer than TIMEOUT_MS. */
async function get(url, { accept = "text/html" } = {}) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      stats.requests += 1;
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: "follow",
        headers: { "User-Agent": "shamah-site-sync/1.0 (+read-only CMS snapshot)", Accept: accept },
      });
      const body = await res.text();
      stats.bytes += Buffer.byteLength(body);
      if (res.status >= 500 && attempt < RETRIES) {
        await sleep(2000);
        continue;
      }
      return { status: res.status, body, ok: res.ok };
    } catch (err) {
      if (attempt < RETRIES) {
        await sleep(2000);
        continue;
      }
      return { status: 0, body: "", ok: false, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 0, body: "", ok: false };
}

/** Worker pool: at most CONCURRENCY requests in flight, DELAY_MS between starts. */
async function pool(items, work) {
  const queue = [...items];
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const i = index++;
      if (i >= queue.length) return;
      await sleep(DELAY_MS);
      await work(queue[i], i);
    }
  });
  await Promise.all(runners);
}

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

/** Only internal, non-asset, non-REST permalinks are worth a page fetch. */
function internalLinks($, base) {
  const found = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(tel|mailto|javascript|#|data):/i.test(href)) return;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (url.host !== new URL(WP).host) return;
    url.hash = "";
    // Query strings on this site are facets and tracking, not pages.
    url.search = "";
    const p = url.pathname;
    if (/^\/(wp-json|wp-admin|wp-login|wp-content|wp-includes|feed)/.test(p)) return;
    if (/\.(xml|txt|css|js|png|jpe?g|webp|gif|svg|ico|pdf|zip)$/i.test(p)) return;
    found.add(url.toString().replace(/\/+$/, "") || url.toString());
  });
  return [...found];
}

function locsFromXml(xml) {
  return [...xml.matchAll(/<(?:loc|url)>([^<]+)<\/(?:loc|url)>/g)].map((m) => m[1].trim());
}

async function cmdProbe() {
  for (const path of ["/", "/ar/"]) {
    const res = await get(`${WP}${path}`, { accept: "text/html" });
    console.log(`GET ${WP}${path} -> ${res.status || res.error || "no response"} (${res.body.length} bytes)`);
    if (res.status >= 500) console.log(`   origin said: ${clean(res.body).slice(0, 120)}`);
  }
  const rest = await get(`${WP}/wp-json/wp/v2/pages?per_page=1`, { accept: "application/json" });
  console.log(`GET ${WP}/wp-json/wp/v2/pages?per_page=1 -> ${rest.status || rest.error}`);
}

async function cmdCrawl() {
  mkdirSync(HTML_DIR, { recursive: true });

  // ── 1. discovery: robots.txt + every sitemap the origin advertises ──
  const sitemaps = new Set();
  const robots = await get(`${WP}/robots.txt`, { accept: "text/plain" });
  if (robots.ok) {
    for (const line of robots.body.split(/\r?\n/)) {
      const m = /^sitemap:\s*(\S+)/i.exec(line.trim());
      if (m) sitemaps.add(m[1]);
    }
  }
  for (const candidate of [
    "/wp-sitemap.xml",
    "/wp-sitemap-posts-page-1.xml",
    "/wp-sitemap-posts-post-1.xml",
    "/wp-sitemap-posts-product-1.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/sitemap.xml",
  ]) {
    sitemaps.add(`${WP}${candidate}`);
  }

  const urls = new Map(); // url -> {depth, via}
  const seeds = [`${WP}/`, `${WP}/ar/`];
  for (const s of seeds) urls.set(s, { depth: 0, via: "seed" });

  const sitemapUrls = [...sitemaps];
  const seenSitemaps = new Set();
  await pool(sitemapUrls, async (sm) => {
    const res = await get(sm, { accept: "application/xml" });
    if (!res.ok || res.status !== 200) {
      console.log(`  sitemap ${sm.replace(WP, "")} -> ${res.status || res.error}`);
      return;
    }
    const locs = locsFromXml(res.body);
    console.log(`  sitemap ${sm.replace(WP, "")} -> ${locs.length} loc(s)`);
    for (const loc of locs) {
      if (/sitemap/i.test(new URL(loc).pathname) && !seenSitemaps.has(loc) && seenSitemaps.size < 30) {
        seenSitemaps.add(loc);
        sitemapUrls.push(loc); // nested sitemap index
        continue;
      }
      if (!urls.has(loc)) urls.set(loc, { depth: 1, via: "sitemap" });
    }
  });

  // ── 2. fetch the discovered pages, then their internal links ──
  const manifest = [];
  const toFetch = [...urls.entries()].slice(0, MAX_URLS);
  let done = 0;
  const queue = toFetch.map(([url, meta]) => ({ url, ...meta }));

  for (let round = 0; round < MAX_DEPTH && queue.length; round++) {
    const batch = queue.splice(0, MAX_URLS);
    await pool(batch, async (item) => {
      const res = await get(item.url, { accept: "text/html" });
      done += 1;
      const entry = {
        url: item.url,
        lang: langOf(item.url),
        depth: item.depth,
        via: item.via,
        status: res.status,
        error: res.error || null,
        bytes: res.body.length,
        file: existsSync(HTML_DIR) && res.ok ? fileFor(item.url) : null,
      };
      if (res.ok) {
        writeFileSync(new URL(entry.file, HTML_DIR), res.body, "utf8");
        const $ = cheerio.load(res.body);
        entry.title = clean($("title").first().text());
        entry.headings = $("h1,h2,h3").toArray().map((h) => clean($(h).text())).filter(Boolean).slice(0, 40);
        entry.images = $("img").toArray().map((i) => ({
          src: $(i).attr("src") || $(i).attr("data-src") || "",
          alt: clean($(i).attr("alt") || ""),
        })).slice(0, 60);
        entry.textChars = clean($("body").text()).length;
        if (item.depth < MAX_DEPTH) {
          for (const link of internalLinks($, item.url)) {
            if (!urls.has(link) && urls.size < MAX_URLS) {
              urls.set(link, { depth: item.depth + 1, via: item.url });
              queue.push({ url: link, depth: item.depth + 1, via: item.url });
            }
          }
        }
      }
      manifest.push(entry);
      process.stdout.write(`\r  fetched ${done} page(s), ${stats.requests} request(s)`);
    });
  }
  console.log("");

  manifest.sort((a, b) => a.url.localeCompare(b.url));
  writeFileSync(MANIFEST, JSON.stringify({ origin: WP, crawledAt: new Date().toISOString(), requests: stats.requests, bytes: stats.bytes, manifest }, null, 2), "utf8");
  const ok = manifest.filter((m) => m.status === 200).length;
  console.log(`URLs discovered: ${urls.size}, fetched ok: ${ok}, failed: ${manifest.length - ok}`);
  console.log(`requests: ${stats.requests}, bytes: ${stats.bytes}`);
  for (const m of manifest.filter((x) => x.status !== 200)) {
    console.log(`  ! ${m.status || m.error} ${m.url}`);
  }
}

function cmdStatus() {
  if (!existsSync(MANIFEST)) {
    console.log("no crawl on record — run `node scripts/wp-sweep.mjs crawl`");
    return;
  }
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const byStatus = {};
  for (const e of m.manifest) byStatus[e.status || "error"] = (byStatus[e.status || "error"] || 0) + 1;
  console.log(`crawled ${m.crawledAt} from ${m.origin}`);
  console.log(`pages: ${m.manifest.length}, requests: ${m.requests}, bytes: ${m.bytes}`);
  console.log(`status codes: ${JSON.stringify(byStatus)}`);
  for (const lang of ["en", "ar"]) {
    const rows = m.manifest.filter((e) => e.lang === lang && e.status === 200);
    console.log(`  ${lang}: ${rows.length} page(s)`);
    for (const r of rows.slice(0, 60)) console.log(`     ${r.url.replace(WP, "") || "/"} — ${r.title}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// match: does a WordPress page publish the text we still keep in src/data?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each item is a block we still author. `phrases` are strings taken verbatim
 * from our own files (so a hit proves the same copy exists on the site), and
 * `markers` are topic words that would show up even if the wording differed —
 * a topic with no marker anywhere is a real negative, not a phrasing miss.
 */
const ITEMS = [
  {
    id: "specialists",
    where: "src/data/specialists.ts (3 doctors: names, titles, credentials, bios, specialties, experience, photos)",
    phrases: ["Nourhan", "El-Masry", "Salma Abdallah", "Reem El-Wakeel", "نورهان", "سلمى عبد الله", "ريم الوكيل", "Consultant Dermatologist", "استشارية الأمراض الجلدية"],
    markers: ["doctor", "Dr.", "dermatolog", "استشاري", "أطباء", "فريق", "team", "specialist"],
  },
  {
    id: "results-before-after",
    where: "src/data/results.ts (4 before/after cases: treatment, area, sessions, note, photos)",
    phrases: ["Before and After", "before-after", "التقشير الأصفر للتصبغات", "كورس العناية بالبشرة الحبية", "خطة الكلف"],
    markers: ["before and after", "before-after", "قبل وبعد", "results", "نتائج", "gallery", "معرض"],
  },
  {
    id: "faq",
    where: "src/data/faq.ts (12 questions and answers)",
    phrases: ["laser hair removal sessions painful", "متى تظهر نتائج حقن الفيلر", "HydraFacial and Yellow Chemical Peel", "طاقم طبي وتمريضي نسائي"],
    markers: ["faq", "question", "answer", "أسئلة", "إجابة", "accordion", "toggle"],
  },
  {
    id: "contact-details",
    where: "src/config/site.ts (phone, WhatsApp, email, working hours, social links)",
    phrases: ["01121880908", "201121880908", "info@shamah", "01026788285", "01018064881", "01121880855", "10:00"],
    markers: ["whatsapp", "واتساب", "@shamahclinics.com", "hours", "أوقات العمل", "مواعيد", "facebook.com/", "instagram.com/"],
  },
  {
    id: "branch-extras",
    where: "src/data/branches.ts (per-branch intro, features list, landmark, area, photo)",
    phrases: ["Mostafa Hemam", "Medical Park", "Trivium", "غرفتا ليزر", "غرفة تعقيم مركزية", "Mustafa Hamam"],
    markers: ["nasr city", "مدينة نصر", "settlement", "التجمع", "zayed", "زايد", "branch", "فرع"],
  },
  {
    id: "service-detail-blocks",
    where: "src/data/treatments.ts (benefits, steps, aftercare, ideal-for, duration, sessions, price per service)",
    phrases: ["How the session works", "خطوات الجلسة", "العناية بعد الجلسة", "لمن تناسب", "مدة الجلسة", "عدد الجلسات"],
    markers: ["benefits", "فوائد", "aftercare", "care after", "العناية بعد", "recovery", "downtime", "duration", "المدة", "ideal for", "sessions"],
  },
  {
    id: "service-prices",
    where: "src/data/treatments.ts (priceStartingAt per service)",
    phrases: ["EGP 900", "EGP 1500", "EGP 2500", "ج.م"],
    markers: ["price", "سعر", "اسعار", "EGP", "LE", "cost", "تبدأ من"],
  },
  {
    id: "offer-terms",
    where: "src/data/offers.ts (badge, subtitle, includes[], validUntil) for rows WordPress does not hold",
    phrases: ["validUntil", "يشمل الباقة", "valid until"],
    markers: ["valid", "offer", "عرض", "باقة", "package", "inclusive", "يشمل"],
  },
  {
    id: "hero-copy",
    where: "Home hero headline, sub-line and CTAs (src/components/home)",
    phrases: ["وجهتك الأولى", "إشراقتك تبدأ"],
    markers: ["hero", "slider", "revslider", "banner"],
  },
  {
    id: "about-copy",
    where: "src/data/about.ts fallback (lead + section prose)",
    phrases: ["بدأنا من سؤال بسيط", "من هذه الفكرة وُلدت"],
    markers: ["about", "عن"],
  },
  {
    id: "privacy-copy",
    where: "src/components/pages/PrivacyClient.tsx (policy sections)",
    phrases: ["we never sell your data", "بياناتك"],
    markers: ["privacy", "خصوصية", "data protection", "GDPR"],
  },
];

function elementSelector($, el) {
  const parts = [];
  let node = el;
  while (node && node.type === "tag" && parts.length < 4) {
    const $n = $(node);
    const cls = ($n.attr("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const id = $n.attr("id") ? `#${$n.attr("id")}` : "";
    parts.unshift(node.name + id + (cls ? `.${cls}` : ""));
    node = node.parent;
    node = node && node.type === "tag" ? node : null;
  }
  return parts.join(" > ");
}

function scanHtml(label, url, html) {
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();
  const hits = [];
  const nodes = $("h1,h2,h3,h4,h5,p,li,a,img,span,div,td,caption,figcaption,blockquote").toArray();
  for (const el of nodes) {
    const $el = $(el);
    const own = el.name === "img" ? `${$el.attr("alt") || ""} ${$el.attr("title") || ""}` : clean($el.text());
    if (own.length > 1200) continue; // big containers: their children carry the real match
    for (const text of [own, $el.attr("href") || "", $el.attr("src") || ""]) {
      if (!text) continue;
      const idx = text.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      hits.push({
        source: label,
        url,
        selector: elementSelector($, el),
        tag: el.name,
        snippet: clean(text).slice(Math.max(0, idx - 60), idx + phraseLen + 60),
      });
      break;
    }
  }
  return hits;
}

let needle = "";
let phraseLen = 0;

function snapshotRows() {
  const rows = [];
  const read = (name) => {
    const p = new URL(`../data/wp/${name}`, import.meta.url);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
  };
  for (const lang of ["en", "ar"]) {
    for (const page of read(`pages.${lang}.json`)) {
      rows.push({ label: `snapshot:pages.${lang}`, url: page.link || `wp page ${page.id}`, html: page.content?.rendered || "" });
      rows.push({ label: `snapshot:pages.${lang}`, url: page.link || `wp page ${page.id}`, html: page.title?.rendered || "" });
    }
    for (const post of read(`posts.${lang}.json`)) {
      rows.push({ label: `snapshot:posts.${lang}`, url: post.link || `wp post ${post.id}`, html: `${post.title?.rendered || ""}${post.excerpt?.rendered || ""}${post.content?.rendered || ""}` });
    }
    for (const product of read(`products.${lang}.json`)) {
      rows.push({ label: `snapshot:products.${lang}`, url: product.permalink || `wp product ${product.id}`, html: `${product.name || ""}${product.short_description || ""}${product.description || ""}` });
    }
  }
  for (const m of read("media.json")) {
    rows.push({
      label: "snapshot:media",
      url: m.source_url || `wp media ${m.id}`,
      html: `${m.alt_text || ""}||${m.title?.rendered || ""}||${m.caption?.rendered || ""}`,
    });
  }
  return rows;
}

function cmdMatch() {
  const crawled = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
  const liveRows = [];
  if (crawled) {
    for (const e of crawled.manifest) {
      if (e.status !== 200 || !e.file) continue;
      const p = new URL(e.file, HTML_DIR);
      if (!existsSync(p)) continue;
      liveRows.push({ label: "live-html", url: e.url, html: readFileSync(p, "utf8") });
    }
  }
  const rows = [...liveRows, ...snapshotRows()];
  console.log(`searching ${rows.length} document(s) ` + `(${liveRows.length} live HTML, ${rows.length - liveRows.length} snapshot)`);
  console.log(`live crawl: ${crawled ? crawled.crawledAt : "NONE — origin was not reachable"}`);

  const results = [];
  for (const item of ITEMS) {
    const entry = { id: item.id, where: item.where, phrases: [], markers: [] };
    for (const phrase of item.phrases) {
      needle = phrase.toLowerCase();
      phraseLen = needle.length;
      const hits = [];
      for (const row of rows) hits.push(...scanHtml(row.label, row.url, row.html));
      entry.phrases.push({ phrase, hits: hits.slice(0, 25), total: hits.length });
    }
    for (const marker of item.markers) {
      needle = marker.toLowerCase();
      phraseLen = needle.length;
      const hits = [];
      for (const row of rows) hits.push(...scanHtml(row.label, row.url, row.html));
      const urls = [...new Set(hits.map((h) => h.url))];
      entry.markers.push({ marker, pages: urls.length, total: hits.length, sample: urls.slice(0, 8) });
    }
    results.push(entry);
    const found = entry.phrases.filter((p) => p.total > 0).length;
    console.log(`\n${item.id}: ${found}/${item.phrases.length} of our phrases appear on the site`);
    for (const p of entry.phrases.filter((x) => x.total > 0).slice(0, 6)) {
      console.log(`   "${p.phrase}" x${p.total} -> ${p.hits[0].url}`);
      console.log(`        [${p.hits[0].selector}] "${p.hits[0].snippet}"`);
    }
    console.log(`   markers: ${entry.markers.map((m) => `${m.marker}=${m.pages}p`).join(", ")}`);
  }

  writeFileSync(MATCHES, JSON.stringify({ crawledAt: crawled?.crawledAt || null, searched: rows.length, results }, null, 2), "utf8");
  console.log(`\nwrote ${MATCHES.pathname}`);
}

const cmd = process.argv[2] || "match";
if (cmd === "probe") await cmdProbe();
else if (cmd === "crawl") await cmdCrawl();
else if (cmd === "status") cmdStatus();
else if (cmd === "match") cmdMatch();
else console.log("usage: node scripts/wp-sweep.mjs [probe|crawl|match|status]");
