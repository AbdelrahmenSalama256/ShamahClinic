/**
 * Asserts, over the rendered HTML of a running production build, that
 *   1. the header menu is the site's one menu — the footer repeats it, every line
 *      reaches a page that answers, each label arrives in the served language, and a
 *      dropdown adds no anchor to the served HTML — and that the header carries a
 *      booking button with words of its own,
 *   2. no Home card section renders more than three cards, and a section carries a
 *      "View all" link to its full page exactly when records are left out,
 *   3. every service section page 696 publishes is rendered on /services in both
 *      languages, and a service WordPress gives no price or session data for
 *      renders no price, no empty block and no schema.org Offer, and
 *   4. an unknown URL answers HTTP 404 with the branded page and the `<html lang
 *      dir>` the server chose, Arabic by default and English under `/en`, and a slug
 *      the CMS does not publish answers 404 with `noindex`, and
 *   5. /results paginates the posts whose own text names a result — nine per page,
 *      every card indexed, no authored before/after case presented as a result, and no
 *      card opening a pair it only has half of, and
 *   6. every image the WooCommerce Store API returns for a product renders — on its
 *      card and on its detail page (one product has one image, three have three),
 *      served from the local mirror and never hotlinked back to the CMS host.
 *
 * Usage: node scripts/verify-render.mjs [origin]   (default http://localhost:3100)
 * Run it against `npm run start`, not `npm run dev`.
 */
import { existsSync, readFileSync } from "node:fs";
import * as cheerio from "cheerio";

const ORIGIN = process.argv[2] || "http://localhost:3100";
const MAX_CARDS = 3;

const pass = [];
const fail = [];
const check = (cond, msg) => (cond ? pass : fail).push(`${cond ? "ok  " : "FAIL"} ${msg}`);

/**
 * The menu is not a file any more. `getNavList()` serves the console's `nav` rows and
 * reads `src/data/nav.ts` only while nothing in that list is published, so the expected
 * labels cannot be taken from either source here: from the file they would pin the site
 * to a fallback it has already left (which is how this script grew twelve stale
 * failures), and from the database they would re-implement the row reader the site
 * already owns. What a served document can prove without either is the wiring — one
 * menu, repeated faithfully, every line a page, the dropdown closed until a cursor
 * reaches it — and the browser proof of *this slice* adds what only a console write can
 * show: that renaming or reordering a row moves the header with it.
 */

/** "/ar/offers" and "/offers" are the same menu line. */
const stripLang = (href) => {
  const hit = (href || "").match(/^\/(ar|en)(\/|$)/);
  const rest = hit ? href.slice(3) || "/" : href || "";
  return rest.startsWith("/") ? rest : `/${rest}`;
};
const text = (el) => el.text().replace(/\s+/g, " ").trim();

/** The WordPress page titles the menu deliberately does not follow. */
const wpTitles = [];
for (const lang of ["ar", "en"]) {
  const list = JSON.parse(
    readFileSync(new URL(`../data/wp/pages-list.${lang}.json`, import.meta.url), "utf8"),
  );
  for (const slug of ["home", "about", "our-services", "shop", "journal", "contact"]) {
    const row = list.find((p) => p.slug === slug);
    if (row?.title) wpTitles.push(`${lang}/${slug} (#${row.id}): ${row.title.rendered || "(empty)"}`);
  }
}

/**
 * Each Home card section, the "View all" label that leads to its full list, and
 * where the API reports its record count. Home caps a section at three cards, so
 * the rendered HTML cannot say whether a fourth record exists — the API the page
 * itself reads can.
 */
const HOME_SECTIONS = [
  { name: "services band", key: "services", totalPath: (lang) => `/api/v1/services?lang=${lang}` },
  { name: "#offers articles", key: "offers", totalPath: () => "/api/v1/offers?per_page=100" },
  { name: "#branches cards", key: "branches", totalPath: () => "/api/v1/branches" },
  { name: "#blogs cards", key: "blogs", totalPath: () => "/api/v1/posts?per_page=100" },
];

const VIEW_ALL = {
  services: { ar: "كل الخدمات", en: "All services" },
  offers: { ar: "كل العروض", en: "All offers" },
  branches: { ar: "تفاصيل الفروع", en: "Branch details" },
  blogs: { ar: "كل المدونات", en: "All blogs" },
};

/** The record count behind an API endpoint, whether it returns a page or a bare list. */
async function totalOf(path) {
  const body = await (await fetch(`${ORIGIN}${path}`, { cache: "no-store" })).json();
  const list = Array.isArray(body) ? body : body.items;
  return typeof body.total === "number" ? body.total : list.length;
}

for (const lang of ["ar", "en"]) {
  const res = await fetch(`${ORIGIN}/${lang}`, { cache: "no-store" });
  if (!res.ok) {
    fail.push(`FAIL ${lang}: ${ORIGIN}/${lang} returned ${res.status}`);
    continue;
  }
  const $ = cheerio.load(await res.text());
  // ── 1. one menu, and both places it appears ──
  const header = $("header nav")
    .find("a")
    .toArray()
    .map((a) => ({ href: stripLang($(a).attr("href")), label: text($(a)) }));

  check(
    header.length > 0 && header.every((l) => l.href && l.label),
    `${lang}: the header renders ${header.length} menu line(s) from the console's nav list${
      header.length ? ` — ${header.map((l) => l.label).join(" · ")}` : ""
    }`,
  );

  const repeated = header
    .map((l) => l.href)
    .filter((href, i, all) => href && all.indexOf(href) !== i);
  check(
    !repeated.length,
    `${lang}: no menu line is linked twice (${[...new Set(repeated)].join(", ") || "none"})`,
  );

  // Each locale's column is picked on the server: an Arabic label served under `/en`
  // would mean the row reached the page through the wrong field.
  const offLanguage = header.filter((l) => /[؀-ۿ]/.test(l.label) !== (lang === "ar"));
  check(
    !offLanguage.length,
    `${lang}: every menu label arrives in ${lang}${
      offLanguage.length ? ` (off-language: ${offLanguage.map((l) => l.label).join(", ")})` : ""
    }`,
  );

  const footerHrefs = $("footer a").toArray().map((a) => stripLang($(a).attr("href")));
  const absent = header.filter((l) => !footerHrefs.includes(l.href));
  check(
    !absent.length,
    `${lang}: the footer link group repeats every header line${
      absent.length ? ` (missing ${absent.map((l) => l.href).join(", ")})` : ""
    }`,
  );

  const cta = $("header button")
    .toArray()
    .find((b) => /احجزي|Book/.test($(b).attr("aria-label") || ""));
  check(
    !!cta && text($(cta)).length > 0,
    `${lang}: the header's booking button carries words (${
      cta ? `"${text($(cta))}"` : "no such button"
    })`,
  );

  // The dropdown is hover-rendered, so its children cannot be asserted from static
  // HTML; assert that it stays closed — one anchor per line, none added.
  const lines = new Set(header.map((l) => l.href)).size;
  check(
    header.length === lines,
    `${lang}: a dropdown adds no anchor to the served HTML (${header.length} anchors for ${lines} line(s))`,
  );

  // A menu line the owner points at a hidden or mistyped page is a dead link the
  // console can publish, so every one of them has to answer here.
  for (const line of header) {
    const target = line.href === "/" ? `/${lang}` : `/${lang}${line.href}`;
    const page = await fetch(`${ORIGIN}${target}`, { cache: "no-store", redirect: "manual" });
    check(
      page.status === 200,
      `${lang}: menu line ${target} answers ${page.status}`,
    );
  }

  // ── 2. three cards per Home section, with a route to the rest ──
  // Arabic is the prefix-less locale, so detail links are matched by substring.
  // The band is found by its content, not by counting sections: the hero sits
  // above it and a Home block can be hidden when WordPress has nothing for it.
  const band = $(
    $("main > section")
      .toArray()
      .find((s) => $(s).find(`a[href*="/services/"]`).length),
  );

  const cardCount = {
    services: band.find(`a[href*="/services/"]`).length,
    offers: $("#offers article").length,
    branches: $(`#branches a[href*="/branches/"]`).length,
    blogs: $(`#blogs a[href*="/blogs/"]`).length,
  };

  for (const section of HOME_SECTIONS) {
    const count = cardCount[section.key];
    check(
      count > 0 && count <= MAX_CARDS,
      `${lang}: ${section.name} shows ${count} card(s) (limit ${MAX_CARDS})`,
    );

    // The cap only earns a "View all" when records are actually left out. Three
    // branches are the whole network, so that band must not grow a dead link.
    const total = await totalOf(section.totalPath(lang));
    const label = VIEW_ALL[section.key][lang];
    const found = $("a").toArray().some((a) => text($(a)) === label);
    check(
      found === (total > MAX_CARDS),
      `${lang}: "${label}" ${
        total > MAX_CARDS
          ? `links the rest of its ${total} records`
          : `stays away, since all ${total} record(s) render`
      } (found: ${found})`,
    );
  }

  // Home's services band links to /services and carries the page 696 title.
  check(
    band.find(`a[href$="/services"]`).length > 0,
    `${lang}: the services band links to /services`,
  );
  check(
    band.find("h2").length === 2,
    `${lang}: that band holds the WordPress introduction and the services heading (${band.find("h2").length} h2)`,
  );
  check(
    band.find("section").length === 0,
    `${lang}: Home renders no nested band and no empty wrapper inside it`,
  );

  // ── no empty heading, on the pages WordPress feeds ──
  for (const path of ["", "/services", "/offers", "/blogs", "/results", "/branches", "/about"]) {
    const page = await fetch(`${ORIGIN}/${lang}${path}`, { cache: "no-store" });
    const $p = cheerio.load(await page.text());
    const blanks = $p("main h1, main h2, main h3, main h4")
      .toArray()
      .filter((h) => !$p(h).text().trim())
      .map((h) => h.tagName);
    check(
      !blanks.length,
      `${lang}: ${path || "/"} renders no empty heading${blanks.length ? ` (${blanks.join(", ")})` : ""}`,
    );
    check(
      page.ok,
      `${lang}: ${path || "/"} returned ${page.status}`,
    );
  }

  // ── the language is decided on the server, not by the client ──
  const h1 = text($("main h1").first());
  const arabicScript = /[؀-ۿ]/.test(h1);
  check(
    $("html").attr("dir") === (lang === "ar" ? "rtl" : "ltr") &&
      $("html").attr("lang") === lang,
    `${lang}: the served document declares lang=${lang} dir=${$("html").attr("dir")}`,
  );
  check(
    lang === "ar" ? arabicScript : !arabicScript,
    `${lang}: the H1 arrives in ${lang} from the server ("${h1.slice(0, 48)}")`,
  );
}

console.log(`\nWordPress page titles the menu no longer follows:\n  ${wpTitles.join("\n  ")}`);

// ── 3. every service WordPress publishes on page 696 reaches the site ──
/** A service block always carries its own image; a heading without one is page
 *  chrome (the AR page opens with "كل خدمات عيادات شامة"). The dashboard holds a
 *  stray list number on one AR heading; the trim is reported, not passed over. */
const numbered = [];
function wpSectionTitles(lang) {
  const rows = JSON.parse(
    readFileSync(new URL(`../data/wp/pages.${lang}.json`, import.meta.url), "utf8"),
  );
  const page = rows.find((p) => p.id === 696);
  const $ = cheerio.load(page?.content?.rendered || "");
  const seen = [];
  $("h2, h3").each((_, h) => {
    const raw = $(h).text().replace(/\s+/g, " ").trim();
    const title = raw.replace(/^\s*\d+\.\s*/, "");
    if (title.length < 3 || seen.includes(title)) return;
    if (!$(h).closest(".vc_column-inner, .wpb_column, .vc_column_container").find("img").length) return;
    seen.push(title);
    if (raw !== title) {
      numbered.push(`${lang}: the dashboard heading "${raw}" renders as "${title}" (leading list number trimmed)`);
    }
  });
  return seen;
}

const EN_TITLES = wpSectionTitles("en");
const AR_TITLES = wpSectionTitles("ar");
const WP_ONLY = ["glow-brightening-injections", "mens-aesthetic-services"];

for (const lang of ["ar", "en"]) {
  const list = await fetch(`${ORIGIN}/${lang}/services`, { cache: "no-store" });
  const html = await list.text();
  const $ = cheerio.load(html);
  const titles = (lang === "ar" ? AR_TITLES : EN_TITLES).filter((t) => t.length > 3);
  const shown = $("main").find("h3").toArray().map((h) => text($(h)));

  check(
    list.ok,
    `${lang}: /services returned ${list.status}`,
  );
  for (const title of titles) {
    const needle = lang === "ar" ? title : title.replace(/&/g, "&amp;");
    check(
      shown.some((s) => s === needle) || html.includes(needle),
      `${lang}: WordPress service "${title}" is rendered on /services`,
    );
  }

  const cards = $("main").find(`a[href*="/services/"]`).length;
  check(
    cards >= titles.length,
    `${lang}: /services grid renders ${cards} service card(s) for ${titles.length} WordPress section(s)`,
  );

  // A service WordPress gives only a title, intro and photo must not gain an
  // invented price, an empty fact grid or blank Benefits/Steps/Aftercare blocks.
  for (const slug of WP_ONLY) {
    const res = await fetch(`${ORIGIN}/${lang}/services/${slug}`, { cache: "no-store" });
    const body = await res.text();
    const $d = cheerio.load(body);
    check(
      res.ok,
      `${lang}: /services/${slug} returned ${res.status}`,
    );
    check(
      text($d("h1")).length > 3,
      `${lang}: ${slug} H1 = "${text($d("h1"))}"`,
    );
    check(
      $d("main").text().replace(/\s+/g, " ").length > 200,
      `${lang}: ${slug} carries the WordPress intro paragraph, not an empty page`,
    );
    // A related card may show its own price, so assert this service has no price
    // fact at all rather than scanning the whole page.
    check(
      !/السعر يبدأ من|Price from/.test(text($d("main"))),
      `${lang}: ${slug} shows no invented price fact for itself`,
    );
    for (const heading of ["الفوائد", "خطوات الجلسة", "العناية بعد الجلسة", "Benefits", "How the session works", "Aftercare"]) {
      check(
        !$d("h2").toArray().some((h) => text($(h)) === heading),
        `${lang}: ${slug} omits the empty "${heading}" block`,
      );
    }
    check(
      !/src="https:\/\/www\.shamahclinics\.com\/wp-content/.test(body),
      `${lang}: ${slug} has no unmirrored WordPress image`,
    );
    check(
      $d("script[type='application/ld+json']").text().includes("MedicalProcedure"),
      `${lang}: ${slug} publishes its MedicalProcedure JSON-LD`,
    );
    check(
      !$d("script[type='application/ld+json']").text().includes('"offers"'),
      `${lang}: ${slug} publishes no schema.org Offer without a price`,
    );
  }

  // Every service row `src/data/treatments.ts` used to author is commented out now
  // that WordPress publishes all of them, so botox is the check that the CMS body
  // really reaches the detail page — and that no invented price came with it.
  const detail = await (
    await fetch(`${ORIGIN}/${lang}/services/botox-injections`, { cache: "no-store" })
  ).text();
  check(
    /عن هذه الجلسة|About this treatment/.test(detail),
    `${lang}: the botox detail renders its WordPress section heading`,
  );
  check(
    /Botox Injections|بوتوكس/.test(detail),
    `${lang}: the botox detail renders the long-form body of WordPress page 885`,
  );
  check(
    !/(EGP|ج\.م)/.test(detail.replace(/<[^>]+>/g, " ")),
    `${lang}: the botox detail renders no price the CMS does not state`,
  );
}

// ── 5. unknown URLs answer with a 404 the server already localized ──
const NOT_FOUND_CASES = [
  { path: "/does-not-exist", lang: "ar", dir: "rtl", h1: "غير موجودة" },
  { path: "/en/does-not-exist", lang: "en", dir: "ltr", h1: "exist" },
  // `/fr/...` is rewritten onto the Arabic segment by `src/proxy.ts`.
  { path: "/fr/does-not-exist", lang: "ar", dir: "rtl", h1: "غير موجودة" },
];

for (const c of NOT_FOUND_CASES) {
  const res = await fetch(`${ORIGIN}${c.path}`, { cache: "no-store", redirect: "manual" });
  const html = await res.text();
  const $ = cheerio.load(html);
  check(res.status === 404, `${c.path}: HTTP 404 (got ${res.status})`);
  check(
    $("html").attr("lang") === c.lang && $("html").attr("dir") === c.dir,
    `${c.path}: the server renders <html lang="${c.lang}" dir="${c.dir}"> (got "${$("html").attr(
      "lang",
    )}" / "${$("html").attr("dir")}")`,
  );
  check(
    $("h1").text().includes(c.h1),
    `${c.path}: the branded 404 heading is in the response, not only after hydration`,
  );
  check(
    ($("meta[name='robots']").attr("content") || "").includes("noindex"),
    `${c.path}: noindex`,
  );
}

// A slug the CMS does not publish has to answer 404 as well. Those routes fetch at
// request time, so the framework owns the document: assert the status and the index
// guard, which is what it controls.
for (const path of [
  "/blogs/no-such-article",
  "/offers/no-such-offer",
  "/services/no-such-service",
  "/branches/no-such-branch",
]) {
  const res = await fetch(`${ORIGIN}${path}`, { cache: "no-store" });
  const html = await res.text();
  check(
    res.status === 404,
    `${path}: HTTP 404 for a slug WordPress does not have (got ${res.status})`,
  );
  check(/noindex/.test(html), `${path}: noindex`);
}

// The old treatments segment is retired. Both the list and a detail URL must answer
// a permanent redirect onto the same slug under /services, never a 404.
for (const [path, expected] of [
  ["/treatments", "/services"],
  ["/en/treatments", "/en/services"],
  ["/ar/treatments/botox-injections", "/ar/services/botox-injections"],
]) {
  const res = await fetch(`${ORIGIN}${path}`, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  check(
    res.status === 301 || res.status === 308,
    `${path}: permanently redirects (got ${res.status})`,
  );
  check(
    location === expected,
    `${path}: redirects to ${expected} (got "${location}")`,
  );
}

// ── 6. /results lists the posts whose own text names a result ──
/**
 * The membership rule lives in the snapshot (`data/wp/result-stories.json`, written
 * by `collectResultStories()` during `npm run sync:wp`), so the expectation is
 * checked against that index rather than against a hand-written count.
 */
const PER_PAGE = 9;
const storyIndex = JSON.parse(
  readFileSync(new URL("../data/wp/result-stories.json", import.meta.url), "utf8"),
);
const storySlugs = new Set(storyIndex.map((s) => s.slug));
const storySlugsOf = ($) =>
  $("main a[href*='/blogs/']")
    .toArray()
    .map((a) => $(a).attr("href").split("?")[0].split("/").filter(Boolean).pop());

for (const { prefix, lang } of [
  { prefix: "", lang: "ar" },
  { prefix: "/en", lang: "en" },
]) {
  const one = await fetch(`${ORIGIN}${prefix}/results`, { cache: "no-store" });
  const $one = cheerio.load(await one.text());
  check(one.ok, `${lang}: /results returned ${one.status}`);

  const first = storySlugsOf($one);
  check(
    first.length === Math.min(PER_PAGE, storyIndex.length),
    `${lang}: /results page 1 renders ${first.length} story card(s); ${storyIndex.length} posts qualify`,
  );
  const foreign = first.filter((s) => !storySlugs.has(s));
  check(
    !foreign.length,
    `${lang}: every /results card is a post the dashboard's own text frames as a result${
      foreign.length ? ` (not indexed: ${foreign.join(", ")})` : ""
    }`,
  );
  check(
    !/Acne skincare course|Melasma and pigmentation plan|كورس العناية بالبشرة الحبية|خطة الكلف/.test(
      $one("main").text(),
    ),
    `${lang}: no authored before/after case is presented as a result`,
  );

  // Half a comparison is not one. The rule is structural, so it survives the clinic
  // rewriting the page's prose — and the message names how many pair cards exist today,
  // so a pass over none of them is visibly a pass over nothing.
  const halves = $one("main article")
    .toArray()
    .map(
      (card) =>
        $one(card)
          .find("button[aria-label]")
          .toArray().filter((b) => /picture|صورة/.test($one(b).attr("aria-label") || ""))
          .length,
    );
  check(
    halves.every((n) => n === 2),
    `${lang}: every card that opens a pair carries both halves (${
      halves.length ? `pair cards: ${halves.join(", ")}` : "no pair card rendered today"
    })`,
  );

  const two = await fetch(`${ORIGIN}${prefix}/results?page=2`, { cache: "no-store" });
  const $two = cheerio.load(await two.text());
  const second = storySlugsOf($two);
  check(two.ok, `${lang}: /results?page=2 returned ${two.status}`);
  check(
    second.length > 0 && !second.some((s) => first.includes(s)),
    `${lang}: ?page=2 renders the next ${second.length} stories, not page 1 again`,
  );

  // An out-of-range page clamps to the last real page, exactly as /blogs does, so
  // it cannot publish a second page-1 under its own canonical.
  const lastPage = Math.ceil(storyIndex.length / PER_PAGE);
  const out = await fetch(`${ORIGIN}${prefix}/results?page=999`, { cache: "no-store" });
  const $out = cheerio.load(await out.text());
  check(
    ($out("link[rel='canonical']").attr("href") || "").includes(`page=${lastPage}`),
    `${lang}: ?page=999 canonicalizes to the last real page (${lastPage})`,
  );
}

check(numbered.length > 0, numbered.join("\n  ") || "no dashboard heading needed the numbering trim");

// ── 7. every image the Store API returns for a product reaches its card and its gallery ──
/**
 * The expectation is read out of the snapshot (`data/wp/products.*.json`, the raw
 * Store API rows) and the mirror map (`data/wp/images.json`, written by
 * `collectMirrorCandidates`), so this asserts the data contract rather than a
 * hand-written count: product 785 has one image, 781/780/581 have three each.
 */
const mirrorMap = JSON.parse(
  readFileSync(new URL("../data/wp/images.json", import.meta.url), "utf8"),
);
const uploadsOf = (url) => {
  const hit = String(url).trim().match(/^(?:https?:)?\/\/[^/]*(\/wp-content\/uploads\/.*)$/);
  return hit ? `https://www.shamahclinics.com${hit[1].split("?")[0]}` : String(url).split("?")[0];
};
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
/** The last path segment of a link, language prefix gone and percent-decoded. */
const tailOf = (href) => decode((href || "").split("?")[0].split("/").filter(Boolean).pop() || "");

/** One `src`/`srcset` entry resolved to the image `next/image` was handed. */
function nextTarget(raw) {
  const value = (raw || "").trim().split(" ")[0];
  if (!value) return null;
  return value.startsWith("/_next/image")
    ? decode(new URL(value, ORIGIN).searchParams.get("url") || "")
    : value;
}

/** Every image target on a page, `src` and `srcset`, without duplicates. */
function imageTargets($) {
  const out = new Set();
  $("img").each((_, el) => {
    const src = nextTarget($(el).attr("src"));
    if (src) out.add(src);
    for (const entry of ($(el).attr("srcset") || "").split(",")) {
      const target = nextTarget(entry);
      if (target) out.add(target);
    }
  });
  return [...out];
}

for (const { prefix, lang } of [
  { prefix: "", lang: "ar" },
  { prefix: "/en", lang: "en" },
]) {
  const rows = JSON.parse(
    readFileSync(new URL(`../data/wp/products.${lang}.json`, import.meta.url), "utf8"),
  );
  const expectedOf = (p) =>
    (p.images || []).map((img) => mirrorMap[uploadsOf(img.src)] || uploadsOf(img.src));

  const list = await fetch(`${ORIGIN}${prefix}/offers`, { cache: "no-store" });
  const $list = cheerio.load(await list.text());
  check(list.ok, `${lang}: ${prefix}/offers returned ${list.status}`);

  // Each product's own card carries an <img> that points at a file on disk.
  const cardSrcs = [];
  for (const p of rows) {
    const card = $list("article")
      .toArray()
      .find((a) =>
        $list(a)
          .find("a")
          .toArray()
          .some((el) => tailOf($list(el).attr("href")) === decode(p.slug)),
      );
    const img = card ? $list(card).find("img").first() : null;
    const target = img && img.length ? nextTarget(img.attr("src")) : null;
    const src = target || (img && img.length ? "NO IMAGE" : "NO CARD");
    cardSrcs.push(`${p.id} (${(p.name || "").slice(0, 28)}): ${src}`);
    check(!!card, `${lang}: /offers renders a card for product ${p.id}`);
    check(
      !!img && !!img.length && !!target,
      `${lang}: product ${p.id} card shows its first image${target ? ` at ${target}` : ""}`,
    );
    check(
      !!target &&
        (target.startsWith("/wp/")
          ? existsSync(new URL(`../public${target}`, import.meta.url))
          // Not mirrored means the sync has not downloaded it yet — then, and only
          // then, the live WordPress URL is the correct answer.
          : !mirrorMap[uploadsOf(target)]),
      `${lang}: product ${p.id} image ${target || "(none)"} ${
        target?.startsWith("/wp/")
          ? "is a mirrored file, served from this host"
          : "is a live CMS URL, which is only allowed for an upload the mirror does not hold"
      }`,
    );
  }
  console.log(`\n${lang}: /offers card images (one per product the store returns)\n  ${cardSrcs.join("\n  ")}`);

  // Detail pages carry the full list: one image is one photo with no gallery
  // chrome, three images are three photos.
  for (const p of rows) {
    const expected = expectedOf(p);
    const res = await fetch(`${ORIGIN}${prefix}/offers/${p.slug}`, { cache: "no-store" });
    const html = await res.text();
    const $d = cheerio.load(html);
    const targets = imageTargets($d);
    const shown = targets.filter((t) => expected.includes(t));
    check(res.ok, `${lang}: /offers/${p.id} returned ${res.status}`);
    check(
      shown.length === expected.length,
      `${lang}: product ${p.id} detail renders all ${expected.length} of its image(s)${
        shown.length !== expected.length ? ` (found ${shown.length}: ${shown.join(", ") || "none"})` : ""
      }`,
    );
    // A mirrored upload must never be hotlinked again, and a product with no
    // image must not print a broken one.
    const hotlinks = targets.filter(
      (t) => t.startsWith("http") && t.includes("/wp-content/uploads/") && mirrorMap[uploadsOf(t)],
    );
    check(
      !hotlinks.length,
      `${lang}: product ${p.id} detail has no hotlink for a mirrored image${
        hotlinks.length ? ` (${hotlinks.join(", ")})` : ""
      }`,
    );
  }

  const listHotlinks = imageTargets($list).filter(
    (t) => t.startsWith("http") && t.includes("/wp-content/uploads/") && mirrorMap[uploadsOf(t)],
  );
  check(
    !listHotlinks.length,
    `${lang}: /offers has no hotlink for a mirrored image${listHotlinks.length ? ` (${listHotlinks.join(", ")})` : ""}`,
  );
}

console.log("");
console.log("");
for (const line of [...pass, ...fail]) console.log(line);
console.log(`\n${pass.length} checks passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
