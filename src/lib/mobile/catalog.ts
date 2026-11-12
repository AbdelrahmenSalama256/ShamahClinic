/**
 * Branches and services as the mobile app needs them, read from the same published
 * `list_items` rows the website renders — one source, edited in the console.
 *
 * The app keys its bundled content by slug (`nasr-city`, `botox`, `fillers`…). Branch
 * slugs already equal the CMS row uids. Service slugs differ in a few places, so
 * `SERVICE_ALIASES` maps the app's slug onto the CMS uid; anything else is looked up
 * as-is, and an unknown slug still books (the clinic reads the name the app sent).
 */
import { sql } from 'kysely';
import { db } from '@/lib/db';
import type { Lang } from './http';

export interface MobileBranch {
  uid: string;
  name: { ar: string; en: string };
  address: { ar: string; en: string };
  phone: string;
  email: string;
  openAt: string;
  closeAt: string;
  latitude: number | null;
  longitude: number | null;
}

export interface MobileService {
  uid: string;
  name: { ar: string; en: string };
  price: number | null;
  image: string;
}

/** App slug → CMS `services` uid. */
export const SERVICE_ALIASES: Record<string, string> = {
  botox: 'botox-injections',
  fillers: 'filler-injections',
  'chemical-peel': 'chemical-peeling',
  'skincare-deep-cleansing': 'skincare',
  'skin-booster': 'glow-brightening-injections',
};

/** The app's own starting prices, used when the CMS row carries none. */
const APP_PRICES: Record<string, number> = {
  'laser-hair-removal': 850,
  'skincare-deep-cleansing': 900,
  botox: 2400,
  fillers: 3200,
  hydrafacial: 1200,
  'chemical-peel': 1500,
  prp: 1600,
  'fractional-laser': 2200,
  'skin-booster': 2800,
  'skin-tightening': 3500,
};

/** Display names for app slugs the CMS has no row for. */
const APP_NAMES: Record<string, { ar: string; en: string }> = {
  'laser-hair-removal': { ar: 'إزالة الشعر بالليزر', en: 'Laser Hair Removal' },
  'skincare-deep-cleansing': { ar: 'تنظيف البشرة العميق', en: 'Deep Skin Cleansing' },
  botox: { ar: 'حقن البوتوكس', en: 'Botox Injections' },
  fillers: { ar: 'حقن الفيلر', en: 'Filler Injections' },
  hydrafacial: { ar: 'هيدرافيشيال', en: 'HydraFacial' },
  'chemical-peel': { ar: 'التقشير الكيميائي', en: 'Chemical Peel' },
  prp: { ar: 'بلازما PRP', en: 'PRP' },
  'fractional-laser': { ar: 'الفراكشنال ليزر', en: 'Fractional Laser' },
  'skin-booster': { ar: 'حقن تعزيز البشرة', en: 'Skin Booster' },
  'skin-tightening': { ar: 'شد البشرة', en: 'Skin Tightening' },
};

const DEFAULT_OPEN = '10:00';
const DEFAULT_CLOSE = '22:00';

type Doc = Record<string, unknown>;

function str(doc: Doc, key: string): string {
  const value = doc[key];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function num(doc: Doc, key: string): number | null {
  const raw = doc[key];
  const value = typeof raw === 'number' ? raw : Number.parseFloat(typeof raw === 'string' ? raw : '');
  return Number.isFinite(value) ? value : null;
}

async function publishedDocs(listKey: string): Promise<Array<{ uid: string; doc: Doc }>> {
  const rows = await db
    .selectFrom('list_items as i')
    .innerJoin('lists as l', 'l.id', 'i.list_id')
    .select(['i.uid', sql<string | null>`i.published`.as('published')])
    .where('l.list_key', '=', listKey)
    .where('i.deleted_at', 'is', null)
    .where('i.enabled', '=', 1)
    .where('i.status', '=', 'published')
    .orderBy('i.position')
    .execute();
  const out: Array<{ uid: string; doc: Doc }> = [];
  for (const row of rows) {
    if (!row.published) continue;
    try {
      const parsed = typeof row.published === 'string' ? JSON.parse(row.published) : row.published;
      if (parsed && typeof parsed === 'object') out.push({ uid: row.uid, doc: parsed as Doc });
    } catch {
      // A row whose JSON does not parse is skipped, never half-rendered.
    }
  }
  return out;
}

export async function listBranches(): Promise<MobileBranch[]> {
  const docs = await publishedDocs('branches');
  return docs.map(({ uid, doc }) => ({
    uid,
    name: { ar: str(doc, 'name_ar') || str(doc, 'name_en'), en: str(doc, 'name_en') || str(doc, 'name_ar') },
    address: {
      ar: str(doc, 'address_ar') || str(doc, 'address_en'),
      en: str(doc, 'address_en') || str(doc, 'address_ar'),
    },
    phone: str(doc, 'phone'),
    email: str(doc, 'email'),
    openAt: str(doc, 'open_at') || DEFAULT_OPEN,
    closeAt: str(doc, 'close_at') || DEFAULT_CLOSE,
    latitude: num(doc, 'latitude'),
    longitude: num(doc, 'longitude'),
  }));
}

export async function findBranch(uid: string): Promise<MobileBranch | null> {
  const all = await listBranches();
  return all.find((branch) => branch.uid === uid) ?? null;
}

export async function listServices(): Promise<MobileService[]> {
  const docs = await publishedDocs('services');
  return docs.map(({ uid, doc }) => ({
    uid,
    name: { ar: str(doc, 'name_ar') || str(doc, 'name_en'), en: str(doc, 'name_en') || str(doc, 'name_ar') },
    price: num(doc, 'price'),
    image: str(doc, 'image'),
  }));
}

/**
 * The service an app slug names: the CMS row when there is one, the app's own name and
 * price otherwise, and null only for a slug nobody knows.
 */
export async function resolveService(productId: string): Promise<MobileService | null> {
  const slug = productId.trim();
  if (!slug) return null;
  const uid = SERVICE_ALIASES[slug] ?? slug;
  const row = (await listServices()).find((service) => service.uid === uid || service.uid === slug);
  const fallbackName = APP_NAMES[slug];
  const fallbackPrice = APP_PRICES[slug] ?? null;
  if (row) {
    return { ...row, uid: slug, price: row.price ?? fallbackPrice };
  }
  if (fallbackName) return { uid: slug, name: fallbackName, price: fallbackPrice, image: '' };
  return null;
}

/** Absolute URL for an image path the CMS stores as `/uploads/...` or `/wp/...`. */
export function absoluteUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path;
}

export function pick(value: { ar: string; en: string }, lang: Lang): string {
  return (lang === 'en' ? value.en : value.ar) || value.ar || value.en;
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
