/**
 * SiteDash host runtime — the ONLY file the installed site depends on for CMS
 * overrides. `installRuntime` copies this file verbatim into the host, and the
 * thin glue module wires it to the baked snapshot. With an empty snapshot every
 * `sd` returns its original default and every `SDSection` renders its children,
 * so the installed site is pixel-identical until an override is published.
 *
 * It imports React only for TYPES (erased at build), so the shipped runtime has
 * no runtime dependency beyond the host's own React. This is the canonical,
 * unit-tested implementation; the generator copies these bytes so the tested
 * logic IS the shipped logic.
 */
import type { ReactNode } from "react";

/** A stored content value: a scalar, or a locale-keyed bag for bilingual fields. */
export type SdValue = string | number | boolean | null | { [locale: string]: string | undefined };

export interface SdSnapshot {
  /** field key → published value (scalar, or `{ ar, en }` for bilingual fields). */
  content: Record<string, SdValue>;
  /** section id → visible (only an explicit `false` hides the section). */
  sectionState: Record<string, boolean>;
  /** global setting key → value. */
  settings: Record<string, SdValue>;
}

export type SdReader = <T>(key: string, def: T) => T;
export type SdSectionComponent = (props: { id: string; children?: ReactNode }) => ReactNode;

interface SdRuntime {
  sd: SdReader;
  SDSection: SdSectionComponent;
}

function isBag(v: unknown): v is { [locale: string]: string | undefined } {
  return v !== null && typeof v === "object";
}

const ARABIC_SCRIPT = new RegExp("[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]");

/**
 * The language a SCALAR default is written in, judged by its own script. Bilingual
 * hosts resolve the locale before calling `sd` (a `t(ar, en)` helper), so a scalar
 * call site belongs to exactly one language and the published bag has to be read
 * back in that same language.
 */
function sameLanguage(def: unknown, value: unknown): boolean {
  return typeof value === "string" && value !== "" && ARABIC_SCRIPT.test(value) === ARABIC_SCRIPT.test(String(def));
}

/**
 * Build the runtime bound to a snapshot. `sd(key, def)` returns `def` untouched
 * when no published value exists — the guarantee behind pixel-identical install.
 * When a value exists it is merged by SHAPE so the result matches the type the
 * call site expects (a bilingual field keeps receiving its `{ ar, en }` bag and
 * the host's own `[lang]` selection resolves the locale; single-value fields
 * receive a scalar). No locale is needed here, so this stays synchronous.
 */
export function buildRuntime(snapshot: SdSnapshot): SdRuntime {
  function sd<T>(key: string, def: T): T {
    const ov = snapshot.content[key];
    if (ov === undefined || ov === null) return def;

    if (isBag(def)) {
      if (isBag(ov)) return { ...def, ...ov } as unknown as T; // per-locale merge
      // A scalar edit on a bilingual field applies to every captured locale.
      const filled: Record<string, string> = {};
      for (const locale of Object.keys(def)) filled[locale] = String(ov);
      return filled as unknown as T;
    }

    if (isBag(ov)) {
      // Single-value call site (text/attr position) needs a scalar, not a bag — and it
      // needs the slot written in ITS OWN language. Bilingual hosts resolve the locale
      // before calling (`t(ar, en)`), so taking the first slot handed every English
      // page the Arabic text once a snapshot was published.
      for (const value of Object.values(ov)) if (sameLanguage(def, value)) return value as unknown as T;
      return def; // only the other language is published: keep the source text rather than swap
    }

    return ov as unknown as T;
  }

  function SDSection(props: { id: string; children?: ReactNode }): ReactNode {
    if (snapshot.sectionState[props.id] === false) return null;
    return props.children ?? null;
  }

  return { sd, SDSection };
}
