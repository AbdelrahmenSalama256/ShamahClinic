/**
 * Renders the real card and section components against records with fields that are
 * missing, empty, very long or written in the wrong language, and asserts the output
 * stays sane: nothing throws, no empty heading or section appears, no zero price or
 * "null"/"undefined" leaks into the page, and Home never grows an orphan "View all".
 *
 * The fixtures live in `src/app/[lang]/preview-missing-fields/page.tsx`, which is
 * dev-only (`notFound()` in a production build), so this runs against `npm run dev`:
 *
 *   npm run dev              # then, in another shell
 *   node scripts/test-missing-fields.mjs [origin]
 *
 * Default origin: http://localhost:3000
 */
import * as cheerio from "cheerio";

const ORIGIN = process.argv[2] || "http://localhost:3000";
const PATH = "/preview-missing-fields";
const VIEW_ALL = {
  ar: ["كل الخدمات", "كل العروض", "تفاصيل الفروع", "كل المدونات"],
  en: ["All services", "All offers", "Branch details", "All blogs"],
};

const pass = [];
const fail = [];
const check = (cond, msg) => (cond ? pass : fail).push(`${cond ? "ok  " : "FAIL"} ${msg}`);
const text = (el) => el.text().replace(/\s+/g, " ").trim();

/**
 * The fixture lives in a dev server, and the first request after an edit compiles
 * the route while answering — that partial pass throws a 500 on a page that renders
 * in full a second later. Retry the compile before calling it a broken case.
 */
async function open(url) {
  let res = await fetch(url, { cache: "no-store" });
  for (let attempt = 1; res.status >= 500 && attempt < 3; attempt++) {
    await new Promise((done) => setTimeout(done, 2500));
    res = await fetch(url, { cache: "no-store" });
  }
  return res;
}

for (const lang of ["ar", "en"]) {
  const url = `${ORIGIN}/${lang}${PATH}`;
  const res = await open(url);
  if (res.status === 404) {
    console.error(
      `FAIL ${url} returned 404.\n` +
        "     The fixture route only exists in a dev server: run `npm run dev` first.",
    );
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`FAIL ${url} returned ${res.status} — a fixture case threw during render.`);
    process.exit(1);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const cases = $("section[data-case]");
  check(
    cases.length > 0 && $("main").length > 0,
    `${lang}: ${cases.length} fixture case(s) rendered without throwing`,
  );

  // ── global: nothing empty, nothing leaked ──
  const emptyHeadings = $("main h1, main h2, main h3, main h4, main h5, main h6")
    .toArray()
    .filter((h) => !text($(h)))
    .map((h) => h.tagName);
  check(
    !emptyHeadings.length,
    `${lang}: no empty heading on the page${emptyHeadings.length ? ` (${emptyHeadings.join(", ")})` : ""}`,
  );

  const emptySections = $("main section[data-case], main section[id]")
    .toArray()
    .filter((s) => !$(s).attr("data-expect-empty") && !text($(s)))
    .map((s) => $(s).attr("data-case") || $(s).attr("id"));
  check(
    !emptySections.length,
    `${lang}: no section renders without any text${emptySections.length ? ` (${emptySections.join(", ")})` : ""}`,
  );

  const emptyCases = $("main section[data-expect-empty]")
    .toArray()
    .filter((s) => text($(s)));
  check(
    !emptyCases.length,
    `${lang}: the cases that must render nothing do render nothing${
      emptyCases.length ? ` (${emptyCases.map((s) => $(s).attr("data-case")).join(", ")})` : ""
    }`,
  );

  const brokenImages = $("main img").toArray().filter((i) => !($(i).attr("src") || "").trim());
  check(!brokenImages.length, `${lang}: no <img> with an empty src (${brokenImages.length})`);

  const external = $(`main img[src*="shamahclinics.com/wp-content"]`).length;
  check(!external, `${lang}: no unmirrored WordPress image (${external})`);

  const visible = text($("main"));
  check(
    !/\b(undefined|NaN)\b/.test(visible),
    `${lang}: no "undefined"/"NaN" in the rendered text`,
  );
  check(
    !/\bnull\b/.test(visible),
    `${lang}: no "null" in the rendered text`,
  );
  check(
    !/\b0\s*(EGP|ج\.م)\b/.test(visible) && !/(يبدأ من|From)\s*0\b/.test(visible),
    `${lang}: a missing price never prints as "0 EGP"`,
  );

  const byCase = (id) => $(`section[data-case="${id}"]`);

  // ── headings ──
  const headingCase = byCase("heading-no-title");
  check(
    headingCase.find("h2").length === 2 && !headingCase.find("p").length,
    `${lang}: a heading with no title renders nothing; an empty lead renders no <p> (got ${headingCase.find("h2").length} h2, ${headingCase.find("p").length} p)`,
  );

  // ── service card ──
  const noPhoto = byCase("card-no-photo");
  check(
    !!noPhoto.length && !noPhoto.find("img[src='']").length,
    `${lang}: a service with no featured image renders the framed fallback, not a broken image`,
  );
  check(
    noPhoto.find('[aria-hidden="true"]').length > 0,
    `${lang}: the image fallback is decorative (aria-hidden) and carries the logo mark`,
  );

  const bare = byCase("card-no-tagline-no-price");
  check(
    !/يبدأ من|From\s*[0-9٠-٩]/.test(text(bare)),
    `${lang}: a service with no price shows no price line ("${text(bare).slice(0, 40)}…")`,
  );
  check(
    /التفاصيل|Details/.test(text(bare)),
    `${lang}: the price-less card keeps its action row so the card does not collapse`,
  );
  check(
    bare.find("h3").length === 1 && !!text(bare.find("h3")),
    `${lang}: the bare service card still titles itself`,
  );
  check(
    bare.find("h3").first().attr("class")?.includes("line-clamp-2") &&
      bare.find("h3").first().attr("dir") === "auto",
    `${lang}: card titles are clamped and direction-neutral`,
  );
  check(
    !!bare.find("p").first().attr("class")?.match(/min-h-\[/),
    `${lang}: an empty intro keeps its reserved two-line slot instead of collapsing the card`,
  );

  const longText = byCase("card-long-text");
  check(
    longText.find("h3").length === 1 && longText.find("p").length === 1,
    `${lang}: a very long service name and intro stay one title and one intro (no wrap into extra blocks)`,
  );

  const wrongLang = byCase("card-wrong-language");
  const wrongTitle = text(wrongLang.find("h3"));
  check(
    lang === "ar" ? wrongTitle === "Laser Hair Removal" : wrongTitle === "إزالة الشعر بالليزر",
    `${lang}: a field written in the other language is shown as stored, not dropped ("${wrongTitle}")`,
  );
  check(
    wrongLang.find("h3").first().attr("dir") === "auto",
    `${lang}: the mixed-language title is marked dir="auto"`,
  );

  // ── offer card ──
  const emptyOffer = byCase("offer-empty");
  check(
    !emptyOffer.find("ul").length,
    `${lang}: an offer with no package list renders no list`,
  );
  check(
    !/وفّري|Save/.test(text(emptyOffer)),
    `${lang}: an offer with no real discount shows no savings badge`,
  );
  check(
    !emptyOffer.find(".line-through").length,
    `${lang}: an offer with no original price shows no struck-through price`,
  );
  check(
    /السعر عند الحجز|Price on booking/.test(text(emptyOffer)),
    `${lang}: an offer with no price falls back to the booking action text ("${text(emptyOffer).slice(0, 60)}…")`,
  );
  check(
    /احجزي العرض|Book Offer/.test(text(emptyOffer)),
    `${lang}: the price-less offer still offers the booking button`,
  );

  const badgeless = byCase("offer-popular-no-badge");
  check(
    !badgeless
      .find("div")
      .toArray()
      .some((d) => ($(d).attr("class") || "").includes("bg-gold-gradient") && !text($(d))),
    `${lang}: a popular offer with an empty badge renders no empty badge strip`,
  );

  const longOffer = byCase("offer-long-text");
  check(
    longOffer.find("h3").length === 1 &&
      longOffer.find("h3").first().find("a").length === 1 &&
      !!text(longOffer.find("h3")),
    `${lang}: a very long offer title stays a single linked heading`,
  );

  // ── article card ──
  const emptyArticle = byCase("article-empty");
  check(
    !emptyArticle.find("p").toArray().some((p) => !text($(p))),
    `${lang}: an article with no excerpt and no reading time renders no empty paragraph`,
  );
  check(
    !/بقلم|By\s*$/.test(text(emptyArticle)),
    `${lang}: an article whose author WordPress does not know shows no byline ("${text(emptyArticle).slice(0, 50)}…")`,
  );
  check(
    !!text(emptyArticle.find("h3")),
    `${lang}: the author-less article still titles itself`,
  );

  // ── Home sections ──
  const emptyHome = byCase("home-empty-lists");
  check(
    !emptyHome.find("section").length,
    `${lang}: Home with every WordPress list empty renders no band at all (${emptyHome.find("section").length})`,
  );
  check(
    !VIEW_ALL[lang].some((label) =>
      emptyHome.find("a").toArray().some((a) => text($(a)) === label),
    ),
    `${lang}: no orphan "View all" link when the list is empty`,
  );

  const fullHome = byCase("home-four-cards");
  const cardCounts = {
    services: fullHome.find('a[href*="/services/"]').length,
    offers: fullHome.find("#offers article").length,
    branches: fullHome.find('a[href*="/branches/"]').length,
    articles: fullHome.find('a[href*="/blogs/"]').length,
  };
  for (const [name, count] of Object.entries(cardCounts)) {
    check(count === 3, `${lang}: Home's ${name} block shows ${count} card(s) of the 4 offered (expected exactly 3)`);
  }
  const homeLinks = fullHome.find("a").toArray().map((a) => text($(a)));
  for (const label of VIEW_ALL[lang]) {
    check(homeLinks.includes(label), `${lang}: "View all" link "${label}" present when the total is larger`);
  }
  check(
    fullHome.find("section").length === 4,
    `${lang}: Home keeps four bands (${fullHome.find("section").length})`,
  );

  const branchNoPhoto = byCase("home-branch-without-photo");
  check(
    !!branchNoPhoto.find('a[href*="/branches/"]').length &&
      !branchNoPhoto.find("img[src='']").length,
    `${lang}: a branch card without its WordPress image renders the card, without an empty image frame`,
  );
  check(
    branchNoPhoto.find('a[href^="tel:"]').attr("dir") === "ltr",
    `${lang}: a branch action row without a phone keeps its links marked left-to-right`,
  );
}

console.log("");
for (const line of [...pass, ...fail]) console.log(line);
console.log(`\n${pass.length} checks passed, ${fail.length} failed.`);
process.exit(fail.length ? 1 : 0);
