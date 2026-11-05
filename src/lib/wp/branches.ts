import * as cheerio from "cheerio";
import type { BranchDetail } from "@/data/branches";
import { branchesData } from "@/data/branches";
import { images, type PhotoSlot } from "@/lib/images";
import { decodeEntities, htmlToText } from "./sanitize";
import type { Bi } from "./types";

/**
 * One office block of the WordPress homepage (`#contact` row of page 622):
 * `.ws-contact-office-item` = thumbnail + caption(strong + address + `P:` phone).
 * That row is the client's own branch list, so its title, address, phone and
 * photo are what the site shows. The Arabic subsite serves the English blocks
 * through REST (169 Arabic characters in a 40 KB body), so the authored Arabic
 * name/address stays as the Arabic side and only the English fields follow the
 * dashboard.
 */
export interface WpOffice {
  name: string;
  address: string;
  phone: string;
  image: string | null;
}

/** Match a WP office to an authored row: the phone is the only stable key. */
function byPhone(rows: BranchDetail[], phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return undefined;
  return rows.find((b) => b.phone.replace(/\D/g, "").includes(digits) || digits.includes(b.phone.replace(/\D/g, "")));
}

export function parseOffices(html: string): WpOffice[] {
  const $ = cheerio.load(`<div id="__root">${html || ""}</div>`);
  const out: WpOffice[] = [];
  for (const el of $("#__root").find(".ws-contact-office-item").toArray()) {
    const $el = $(el);
    const raw = $el.html() || "";
    const name = decodeEntities($el.find("strong").first().text()).replace(/\s+/g, " ").trim();
    const phone = (raw.match(/P:\s*([\d\s+/-]{7,})/i)?.[1] || "").replace(/\D/g, "");
    const body = raw
      .replace(/<strong[\s\S]*?<\/strong>/gi, "")
      .replace(/P:\s*[\d\s+/-]{7,}/i, "");
    const address = htmlToText(body.replace(/<br\s*\/?>(\s*)?/gi, ", $1"))
      .replace(/\s*,\s*,/g, ",")
      .replace(/[,;\s]+$/g, "")
      .trim();
    const image = $el.find("img").first().attr("src") || null;
    if (name && phone) out.push({ name, address, phone, image });
  }
  return out;
}

function slot(src: string | null, fallback: PhotoSlot, alt: Bi): PhotoSlot {
  if (!src) return fallback;
  return { ...fallback, src, alt };
}

/**
 * Authored rows (Arabic prose, ids, feature lists — no WordPress source) with
 * the English name, address, phone and photo replaced by the homepage offices.
 * Offices the dashboard lists but this file has no row for are appended, so a
 * new branch appears on the site without a code change.
 */
export function mergeBranches(offices: WpOffice[]): BranchDetail[] {
  const merged: BranchDetail[] = [];
  const claimed = new Set<string>();

  for (const office of offices) {
    const row = byPhone(branchesData, office.phone);
    if (row) {
      claimed.add(row.id);
      const name: Bi = { ar: row.name.ar, en: office.name };
      merged.push({
        ...row,
        name,
        area: { ar: row.area.ar, en: office.name },
        address: { ar: row.address.ar, en: office.address || row.address.en },
        phone: office.phone,
        image: slot(office.image, row.image, { ar: row.name.ar, en: office.name }),
      });
      continue;
    }
    const id = `branch-${office.phone}`;
    const name: Bi = { ar: office.name, en: office.name };
    merged.push({
      id,
      name,
      area: name,
      address: { ar: office.address, en: office.address },
      phone: office.phone,
      image: slot(office.image, images.interiors.reception, name),
      intro: { ar: "", en: "" },
      features: { ar: [], en: [] },
      landmark: { ar: "", en: "" },
    });
  }

  // An authored row the dashboard no longer lists still shows; nothing is hidden.
  for (const row of branchesData) if (!claimed.has(row.id)) merged.push(row);
  return merged;
}
