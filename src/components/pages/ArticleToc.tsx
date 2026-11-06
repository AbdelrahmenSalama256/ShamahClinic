"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { List } from "lucide-react";
import type { TocEntry } from "@/lib/content/article-body";

/**
 * The scroll contract between the table of contents and the article body.
 *
 * The ids live in the server HTML (`article-body.ts` gives every H2/H3 one), so this
 * file never invents an address — it only walks to an address that already exists.
 * That is what keeps the two halves of the page agreeing: with JavaScript off the
 * links are ordinary `#hash` links to real anchors, and hydration has nothing to
 * renumber.
 *
 * Three rules the implementation is picky about:
 *   - the jump stops below the fixed header, and the distance comes from the header's
 *     own height, not a number copied into JavaScript;
 *   - `prefers-reduced-motion` turns the smooth scroll into an instant one;
 *   - the hash is written encoded and read decoded, because an Arabic heading is a
 *     percent-encoded string in the address bar and a real one everywhere else.
 */

/** The band the fixed header covers, measured rather than remembered. */
function headerOffset(): number {
  const height = document.getElementById("site-header")?.getBoundingClientRect().height;
  return height && height > 0 ? height + 8 : 72;
}

function prefersReduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The id a visitor asked for, in the form the document uses. */
function hashId(): string {
  const raw = window.location.hash;
  if (raw.length < 2) return "";
  try {
    return decodeURIComponent(raw.slice(1));
  } catch {
    // A malformed `%` sequence is not a decodable address; the raw text may still match.
    return raw.slice(1);
  }
}

export interface TocScroll {
  /** The heading the reader is under right now. Empty until one is. */
  activeId: string;
  /** Walk to an id, focus it, and put it in the address bar. Returns false if absent. */
  goTo: (id: string) => boolean;
}

/**
 * One owner for the scroll behaviour, whatever number of TOC views render it.
 *
 * Called once by the page and handed down, so a desktop sidebar and a mobile fold-out
 * never run two observers over the same headings or race each other into the history.
 */
export function useArticleToc(toc: readonly TocEntry[]): TocScroll {
  const [activeId, setActiveId] = useState("");

  const goTo = useCallback((id: string): boolean => {
    const el = document.getElementById(id);
    if (!el) return false;
    // An FAQ answer is collapsed until it is the thing you asked for.
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" });
    // Focus without a second scroll: the heading is what a keyboard and a screen
    // reader should land on after a jump, and it is already where the eye is.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    window.history.pushState(null, "", `#${encodeURIComponent(id)}`);
    return true;
  }, []);

  useEffect(() => {
    if (!toc.length) return;
    const headings = toc
      .map((entry) => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!headings.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The topmost heading under the header is the section being read. An empty set
        // means the reader is between two headings — keep naming the last one, because
        // a TOC that blanks out mid-section reads as broken.
        const next = toc.find((entry) => visible.has(entry.id));
        if (next) setActiveId(next.id);
      },
      { rootMargin: `-${headerOffset()}px 0px 0px 0px`, threshold: 0 },
    );
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  // A `#hash` in the URL arrives before the body has settled: webfonts and pictures
  // move the headings after the first paint, and a jump computed at document load then
  // points at the wrong paragraph. So the jump is asked for again once each of them is
  // done — until the reader touches something, after which their own scroll wins.
  useEffect(() => {
    const target = hashId();
    if (!target || !document.getElementById(target)) return;

    let cancelled = false;
    let movedByReader = false;
    const mark = () => {
      movedByReader = true;
    };
    const jump = (smooth: boolean) => {
      if (cancelled || movedByReader) return;
      const el = document.getElementById(target);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ behavior: smooth && !prefersReduced() ? "smooth" : "auto", block: "start" });
      setActiveId(target);
    };

    jump(false);
    const timers = [120, 400, 900].map((ms) => window.setTimeout(() => jump(false), ms));
    document.fonts?.ready.then(() => jump(true)).catch(() => {});

    const events: (keyof WindowEventMap)[] = ["wheel", "touchstart", "keydown"];
    events.forEach((name) => window.addEventListener(name, mark, { passive: true, once: true }));
    const onHashChange = () => {
      const id = hashId();
      if (id) goTo(id);
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      events.forEach((name) => window.removeEventListener(name, mark));
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [goTo]);

  return { activeId, goTo };
}

interface TocViewProps {
  toc: readonly TocEntry[];
  scroll: TocScroll;
  /** `aside` is the sticky desktop column; `fold` is the mobile one that closes. */
  variant: "aside" | "fold";
}

/**
 * The list itself, in the two shapes the page needs.
 *
 * Both are `<nav>` with a real `<a href="#id">` per row: a link a visitor can middle-
 * click, copy, or follow with no script. The click handler only upgrades the jump the
 * browser was about to perform (smoothly, focused, offset by the header) and calls
 * `preventDefault()` once it has.
 */
export const ArticleTocView: React.FC<TocViewProps> = ({ toc, scroll, variant }) => {
  const { t, formatNumber } = useLanguage();
  const { activeId, goTo } = scroll;
  const listRef = useRef<HTMLOListElement>(null);
  const foldRef = useRef<HTMLDetailsElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // Keep the row being read inside a list taller than its own box.
  useEffect(() => {
    if (variant !== "aside") return;
    const list = listRef.current;
    const item = activeId ? itemRefs.current.get(activeId) : undefined;
    if (!list || !item) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    if (itemBox.top >= listBox.top && itemBox.bottom <= listBox.bottom) return;
    const top = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: prefersReduced() ? "auto" : "smooth" });
  }, [activeId, variant, toc]);

  if (!toc.length) return null;

  const select = (event: React.MouseEvent, id: string) => {
    // Only take the click when the id is on this page; otherwise let the browser try
    // the anchor and land at the top, which is what a dead fragment does anyway.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (!goTo(id)) return;
    event.preventDefault();
    // The mobile fold closes behind the choice, so the article is what is on screen.
    if (variant === "fold" && foldRef.current) foldRef.current.open = false;
  };

  const list = (
    <ol
      ref={listRef}
      className={variant === "aside" ? "article-toc-list article-toc-scroll" : "article-toc-list"}
    >
      {toc.map((entry, index) => (
        <li
          key={entry.id}
          ref={(el) => {
            if (el) itemRefs.current.set(entry.id, el);
            else itemRefs.current.delete(entry.id);
          }}
          className={entry.level === 3 ? "article-toc-item is-sub" : "article-toc-item"}
          data-active={activeId === entry.id || undefined}
        >
          <a
            href={`#${encodeURIComponent(entry.id)}`}
            onClick={(event) => select(event, entry.id)}
            aria-current={activeId === entry.id ? "location" : undefined}
            className="article-toc-link"
          >
            {variant === "aside" && (
              <span className="article-toc-num" aria-hidden="true">
                {formatNumber(index + 1)}
              </span>
            )}
            <span>{entry.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  if (variant === "fold") {
    // A `<details>` rather than a button and a state flag: the fold opens with no
    // JavaScript at all, which is the whole point of a contents list on a phone.
    return (
      <nav aria-label={t("في هذا المقال", "In this article")} className="article-toc article-toc-fold">
        <details ref={foldRef}>
          <summary className="article-toc-toggle">
            <List className="w-4 h-4 shrink-0 text-[var(--text-gold)]" aria-hidden="true" />
            <span className="article-toc-heading">{t("في هذا المقال", "In this article")}</span>
          </summary>
          {list}
        </details>
      </nav>
    );
  }

  return (
    <nav aria-label={t("في هذا المقال", "In this article")} className="article-toc article-toc-aside">
      <div className="article-toc-head">
        <List className="w-4 h-4 text-[var(--text-gold)]" aria-hidden="true" />
        <span className="article-toc-heading">{t("في هذا المقال", "In this article")}</span>
      </div>
      {list}
    </nav>
  );
};
