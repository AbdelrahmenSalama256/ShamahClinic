import { mkdir, writeFile } from "node:fs/promises";

const BASE = (process.env.WP_BASE || "https://www.shamahclinics.com").replace(
  /\/$/,
  "",
);
const tests = [
  "/wp-json/wp/v2/types",
  "/wp-json/wp/v2/posts?per_page=100&_embed",
  "/wp-json/wp/v2/posts?per_page=100&_embed&lang=ar",
  "/wp-json/wp/v2/posts?per_page=100&_embed&lang=en",
  "/wp-json/wp/v2/pages?per_page=100",
  "/wp-json/wp/v2/pages?per_page=100&lang=ar",
  "/wp-json/wp/v2/pages?per_page=100&lang=en",
  "/wp-json/wp/v2/categories?per_page=100",
  "/wp-json/wp/v2/tags?per_page=100",
  "/wp-json/wp/v2/media?per_page=20",
  "/wp-json/wp/v2/product?per_page=1",
  "/wp-json/wc/store/v1/products?per_page=100",
  "/wp-json/wc/store/v1/products?per_page=100&lang=ar",
  "/wp-json/wc/store/v1/products?per_page=100&lang=en",
  "/wp-json/wc/store/v1/products/categories",
  "/wp-json/pll/v1/languages",
  "/wp-json/menus/v1/menus",
  "/wp-json/contact-form-7/v1/contact-forms",
  "/wp-json/rankmath/v1/getHead?url=" + encodeURIComponent(BASE + "/"),
  "/wp-json/wp/v2/search?search=laser&per_page=3",
];

await mkdir("docs/api/probe", { recursive: true });
const firstIds = {};
const rows = [];

for (const path of tests) {
  try {
    const r = await fetch(BASE + path, {
      headers: { Accept: "application/json" },
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    const shape = Array.isArray(json)
      ? `array(${json.length})`
      : json && typeof json === "object"
        ? `object(${Object.keys(json).slice(0, 8).join(",")})`
        : "not-json";
    const total = r.headers.get("x-wp-total") ?? "-";
    const pages = r.headers.get("x-wp-totalpages") ?? "-";
    if (Array.isArray(json) && json[0]?.id)
      firstIds[path] = json
        .slice(0, 5)
        .map((x) => x.id)
        .join(",");
    const file = path.replace(/[^a-z0-9]+/gi, "_").slice(0, 90) + ".json";
    await writeFile(
      `docs/api/probe/${file}`,
      JSON.stringify(json ?? text.slice(0, 2000), null, 2),
    );
    rows.push(`${r.status}\t${shape}\ttotal=${total}\tpages=${pages}\t${path}`);
  } catch (e) {
    rows.push(`ERR\t${e.message}\t${path}`);
  }
}

const cmp = (a, b) =>
  `${a.split("?")[0]} ar vs en ids: ${firstIds[a] ?? "n/a"} | ${firstIds[b] ?? "n/a"} -> ${firstIds[a] && firstIds[a] !== firstIds[b] ? "lang param WORKS" : "lang param NOT separating"}`;
rows.push("", cmp(tests[2], tests[3]), cmp(tests[11 + 1], tests[11 + 2]));

await writeFile("docs/api/probe/SUMMARY.txt", rows.join("\n"));
console.log(rows.join("\n"));
