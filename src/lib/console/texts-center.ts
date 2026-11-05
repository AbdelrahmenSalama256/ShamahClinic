/**
 * What the texts screen shows: every sentence the site was built with, and whatever a
 * person has written over it.
 *
 * The rows are not read from the database — they are read from `src/lib/copy/catalog.ts`,
 * which the build generates from the components themselves. A screen fed by `content_fields`
 * alone would list the sentences somebody has already changed and call that "the site's
 * text", which is backwards: an owner's first visit has to show the whole site, most of it
 * untouched. The database then supplies the overlay on top, and any row it holds that the
 * catalog no longer lists is shown apart, because a sentence a developer reworded leaves an
 * override nothing renders and somebody has to be able to clear it.
 *
 * The language tab is not a filter. Arabic and English overrides are separate records — one
 * language can be rewritten while the other still says what the code says — and the row a
 * person edits is the row the API is told to write, so the tab decides which field the
 * inputs hold.
 */
import { can, type Grant } from '../auth/permissions';
import type { ContentLocale } from '../content/kinds';
import { COPY_CATALOG, COPY_BY_KEY, type CopyEntry } from '../copy/catalog';
import { readCopyRows, type CopyRow } from '../copy/store';

/** The console's groups, in the order a person walks the site: chrome, home, pages, cards. */
export const TEXT_AREAS = ['shell', 'home', 'pages', 'cards', 'booking', 'tracking', 'common', 'app'] as const;
export type TextArea = (typeof TEXT_AREAS)[number];

/** Unknown groups sort last, so a new generator area never jumps above the ones a label exists for. */
function areaRank(area: string): number {
  const index = (TEXT_AREAS as readonly string[]).indexOf(area);
  return index === -1 ? TEXT_AREAS.length : index;
}

export interface TextRow {
  key: string;
  /** The group the file lives in: `shell`, `home`, `pages`, … */
  area: string;
  ar: string;
  en: string;
  file: string;
  line: number;
  uses: number;
  /** The stored override per language; `null` means the site's own wording is in force. */
  override: { ar: string | null; en: string | null };
}

/** A stored row whose address no component asks for any more. */
export interface OrphanTextRow {
  key: string;
  /** The wording the override was written against — the only place it still appears. */
  defaultAr: string | null;
  defaultEn: string | null;
  ar: string | null;
  en: string | null;
  file: string | null;
}

export interface TextsData {
  locale: ContentLocale;
  rows: TextRow[];
  orphaned: OrphanTextRow[];
  /** Rows carrying an override in *either* language, for the lede's one number. */
  changed: number;
  total: number;
  writable: boolean;
}

function rowOf(entry: CopyEntry, stored: CopyRow | undefined): TextRow {
  return {
    key: entry.key,
    area: entry.area,
    ar: entry.ar,
    en: entry.en,
    file: entry.file,
    line: entry.line,
    uses: entry.uses,
    override: { ar: stored?.ar ?? null, en: stored?.en ?? null },
  };
}

/**
 * Every catalog entry, in the order the site is walked rather than the order the hash came
 * out, with the stored overlay joined on.
 */
export async function textsCenterData(input: {
  grants: readonly Grant[];
  locale: ContentLocale;
}): Promise<TextsData | null> {
  // The grant is `page`, not a new `copy` resource: changing the words of a page is the
  // act a page grant already describes, and a second vocabulary would mean six role
  // definitions to keep in step for one more way to say the same thing.
  if (!can(input.grants, 'page', 'read', {})) return null;

  const stored = await readCopyRows();
  const byKey = new Map(stored.map((row) => [row.key, row]));

  const rows = COPY_CATALOG.map((entry) => rowOf(entry, byKey.get(entry.key))).sort(
    (a, b) =>
      areaRank(a.area) - areaRank(b.area) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      // Two copies of the same sentence in one file still need one order.
      a.key.localeCompare(b.key),
  );

  const orphaned = stored
    .filter((row) => !COPY_BY_KEY.has(row.key))
    .map((row) => ({
      key: row.key,
      defaultAr: row.defaultAr,
      defaultEn: row.defaultEn,
      ar: row.ar,
      en: row.en,
      file: row.sourceFile,
    }));

  return {
    locale: input.locale,
    rows,
    orphaned,
    changed: rows.filter((row) => row.override.ar !== null || row.override.en !== null).length + orphaned.length,
    total: rows.length,
    writable: can(input.grants, 'page', 'update', { locales: input.locale }),
  };
}
