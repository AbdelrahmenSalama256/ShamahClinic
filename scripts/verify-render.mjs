/**
 * Asserts, over the rendered HTML of a running production build, that
 *   1. the header menu, the footer link group and the booking CTA come from
 *      `src/data/nav.ts` (same labels, same order, both languages), and
 *   2. no Home card section renders more than three cards, and a section carries a
 *      "View all" link to its full page exactly when records are left out,
 *   3. every service section page 696 publishes is rendered on /services in both
 *      languages, and a service WordPress gives no price or session data for
 *      renders no price, no empty block and no schema.org Offer.
 *
 * Usage: node scripts/verify-render.mjs [origin]   (default http://localhost:3100)
 * Run it against `npm run start`, not `npm run dev`.
 */
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

const ORIGIN = process.argv[2] || "http://localhost:3100";
const MAX_CARDS = 3;

const pass = [];
const fail = [];
const check = (cond, msg) => (cond ? pass : fail).push(`${cond ? "ok  " : "FAIL"} ${msg}`);

const navSrc = readFileSync(new URL("../src/data/nav.ts", import.meta.url), "utf8");

/** Bracket depth just before a match: 1 = top level, 2 = a dropdown child. */
function bracketLevel(src, index) {
  let level = 0;
  for (let i = 0; i < index; i++) {
    if (src[i] === "[") level++;
    else if (src[i] === "]") level--;
  }
  return level;
}

const menu = [
  ...navSrc.matchAll(
    /href:\s*"([^"]+)",\s*label:\s*\{\s*ar:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}/g,
  ),
].map((m) => ({ href: m[1], ar: m[2], en: m[3], level: bracketLevel(navSrc, m.index) }));

const top = menu.filter((l) => l.level === 1);
const children = menu.filter((l) => l.level === 2);
const book = navSrc.match(/bookCta[^=]*=\s*\{\s*ar:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}/);

if (!top.length || !book) {
  console.error("could not read the menu out of src/data/nav.ts");
  process.exit(1);
}

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
  // ── 1. the menu is the authored file ──
  const header = $("header nav")
    .find("a")
    .toArray()
    .map((a) => ({ href: stripLang($(a).attr("href")), label: text($(a)) }));

  check(
    header.length === top.length,
    `${lang}: header renders ${header.length} menu line(s); src/data/nav.ts has ${top.length}`,
  );

  top.forEach((line, i) => {
    const got = header[i];
    check(
      !!got && got.href === line.href && got.label === line[lang],
      `${lang}: header #${i + 1} = "${line.href}" / "${line[lang]}"${
        got ? ` (rendered "${got.href}" / "${got.label}")` : " (line missing)"
      }`,
    );
  });

  const footerHrefs = $("footer a").toArray().map((a) => stripLang($(a).attr("href")));
  const missing = top.filter((l) => !footerHrefs.includes(l.href));
  check(
    !missing.length,
    `${lang}: footer link group lists every menu page${missing.length ? ` (missing ${missing.map((m) => m.href).join(", ")})` : ""}`,
  );

  check(
    text($("header")).includes(book[lang === "ar" ? 1 : 2]),
    `${lang}: booking CTA reads "${book[lang === "ar" ? 1 : 2]}" (src/data/nav.ts)`,
  );

  // The dropdown is hover-rendered, so its lines cannot be asserted from static
  // HTML; assert the parent is the only entry point instead.
  check(
    children.length === 4 && $("header nav").find("a").length === top.length,
    `${lang}: Services dropdown stays closed in HTML (authored children: ${children.map((c) => c.href).join(", ")})`,
  );

  // ── 2. three cards per Home section, with a route to the rest ──
  // Arabic is the prefix-less locale, so detail links are matched by substring.
  // The band is found by its content, not by counting sections: the hero sits
  // above it and a Home block can be hidden when WordPress has nothing for it.
  const band = $(
    $("main > section")
      .toArray()
      .find((s) => $(s).find(`a[href*="/treatments/"]`).length),
  );

  const cardCount = {
    services: band.find(`a[href*="/treatments/"]`).length,
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
  for (const path of ["", "/services", "/offers", "/blogs", "/branches", "/about"]) {
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

  const cards = $("main").find(`a[href*="/treatments/"]`).length;
  check(
    cards >= titles.length,
    `${lang}: /services grid renders ${cards} service card(s) for ${titles.length} WordPress section(s)`,
  );

  // A service WordPress gives only a title, intro and photo must not gain an
  // invented price, an empty fact grid or blank Benefits/Steps/Aftercare blocks.
  for (const slug of WP_ONLY) {
    const res = await fetch(`${ORIGIN}/${lang}/treatments/${slug}`, { cache: "no-store" });
    const body = await res.text();
    const $d = cheerio.load(body);
    check(
      res.ok,
      `${lang}: /treatments/${slug} returned ${res.status}`,
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

  // The authored pages keep their blocks, so the guards are conditional, not global.
  const authored = await fetch(`${ORIGIN}/${lang}/treatments/botox`, { cache: "no-store" });
  const authoredHtml = await authored.text();
  check(
    /الفوائد|Benefits/.test(authoredHtml),
    `${lang}: an authored service still renders its Benefits block`,
  );
  check(
    /[0-9\u0660-\u0669][\s0-9\u0660-\u0669]*\s*(EGP|ج\.م)/.test(authoredHtml.replace(/<[^>]+>/g, " ")),
    `${lang}: an authored service still renders its price`,
  );
}

check(numbered.length > 0, numbered.join("\n  ") || "no dashboard heading needed the numbering trim");
console.log("");
for (const line of [...pass, ...fail]) console.log(line);
console.log(`\n${pass.length} checks passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
