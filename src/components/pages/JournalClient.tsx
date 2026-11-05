"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { apiCardToUI } from "@/lib/wp/ui-helpers";
import { getLocalizedHref } from "@/lib/locale";
import type { Article } from "@/data/journal";
import type { ArticleCard as WpArticleCard, CategoryTerm } from "@/lib/wp/types";
import type { PhotoSlot } from "@/lib/images";
import { track } from "@/lib/tracking/first-party";

interface Paged {
  items: WpArticleCard[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface Props {
  /** WordPress page 62 heading, with an authored fallback. */
  title: { ar: string; en: string };
  firstPage: Article[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  categories: CategoryTerm[];
  activeCategory?: string;
  activeSearch?: string;
  /** The page's banner, saved in the console or authored. */
  banner: PhotoSlot | null;
}

const EMPTY: WpArticleCard[] = [];

function SkeletonCard() {
  return (
    <div className="h-full rounded-2xl overflow-hidden border border-[var(--border-control)] bg-[var(--bg-card)]">
      <div className="aspect-[3/2] animate-pulse bg-[var(--bg-secondary)]" />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="h-3 w-1/3 rounded animate-pulse bg-[var(--bg-secondary)]" />
        <div className="h-4 w-4/5 rounded animate-pulse bg-[var(--bg-secondary)]" />
        <div className="h-3 w-full rounded animate-pulse bg-[var(--bg-secondary)]" />
        <div className="h-3 w-2/3 rounded animate-pulse bg-[var(--bg-secondary)]" />
      </div>
    </div>
  );
}

export const JournalClient: React.FC<Props> = ({
  title,
  firstPage,
  page: serverPage,
  perPage,
  total,
  totalPages,
  categories,
  activeCategory,
  activeSearch,
  banner,
}) => {
  const { t, language } = useLanguage();
  const router = useRouter();
  // A bare `/blogs` would be rewritten onto `/ar`, so an English reader paginating
  // the list would land on Arabic pages.
  const blogBase = getLocalizedHref("/blogs", language);

  // `firstPage` is server-rendered for the current query; only pages loaded by
  // "Load more" live in state, so a new server render can't desync the list.
  const [appended, setAppended] = useState<Article[]>([]);
  const [loadedPage, setLoadedPage] = useState(serverPage);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(serverPage < totalPages);
  const [searchInput, setSearchInput] = useState(activeSearch || "");

  const articles = useMemo(() => [...firstPage, ...appended], [firstPage, appended]);
  const page = loadedPage;

  const resetLoaded = (nextPage: number, more: boolean) => {
    setAppended([]);
    setLoadedPage(nextPage);
    setHasMore(more);
  };

  const buildQuery = (p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("per_page", String(perPage));
    if (activeCategory) params.set("category", activeCategory);
    if (activeSearch) params.set("search", activeSearch);
    return params.toString();
  };

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/v1/posts?${buildQuery(next)}`);
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as Paged;
      setAppended((prev) => [...prev, ...data.items.map(apiCardToUI)]);
      setLoadedPage(data.page);
      setHasMore(data.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (category?: string) => {
    resetLoaded(1, totalPages > 1);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (activeSearch) params.set("search", activeSearch);
    const qs = params.toString();
    router.push(`${blogBase}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    resetLoaded(1, totalPages > 1);
    const params = new URLSearchParams();
    if (activeCategory) params.set("category", activeCategory);
    if (searchInput.trim()) params.set("search", searchInput.trim());
    const qs = params.toString();
    // The question itself, because the gap between what people search and what is
    // published is a content decision; a searched phrase that finds nothing is the
    // article somebody should write.
    if (searchInput.trim()) track("search_query", { q: searchInput.trim(), scope: "journal", hits: articles.length });
    router.push(`${blogBase}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const shownCount = useMemo(() => articles.length, [articles.length]);

  return (
    <>
      <PageHero
        title={title}
        lead={{
          ar: "مقالات طبية مبسطة تكتبها طبيباتنا: تصحيح للمفاهيم الشائعة، شرح للجلسات، وروتينات عناية واقعية تناسب مناخ مصر.",
          en: "Clear medical articles written by our doctors: correcting common myths, explaining treatments, and realistic care routines for Egypt's climate.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/blogs", label: title },
        ]}
        photo={banner ?? undefined}
      />

      <section className="py-5 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filter + search toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8">
            <div className="flex flex-wrap gap-2 flex-1">
              <button
                onClick={() => applyFilters(undefined)}
                aria-pressed={!activeCategory}
                className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                  !activeCategory
                    ? "bg-gold-gradient border-transparent"
                    : "border-[var(--border-control)] text-[var(--text-secondary)] hover:border-[var(--border-control)]"
                }`}
              >
                {t("الكل", "All")}
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => applyFilters(c.slug)}
                  aria-pressed={activeCategory === c.slug}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                    activeCategory === c.slug
                      ? "bg-gold-gradient border-transparent"
                      : "border-[var(--border-control)] text-[var(--text-secondary)] hover:border-[var(--border-control)]"
                  }`}
                >
                  {t(c.name.ar, c.name.en)}
                </button>
              ))}
            </div>
            <form onSubmit={submitSearch} className="flex items-center gap-2">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("ابحثي في المدونة…", "Search the blog…")}
                aria-label={t("بحث", "Search")}
                className="w-full sm:w-56 rounded-full border border-[var(--border-control)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-control)]"
              />
              <button
                type="submit"
                className="rounded-full bg-[var(--bg-dark)] text-[var(--text-on-dark)] px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
              >
                {t("بحث", "Search")}
              </button>
            </form>
          </div>

          <h2 className="sr-only">{t("أحدث المدونات", "Latest blog posts")}</h2>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            {t("{0} مقالاً", "{0} articles", total)}
          </p>

          {articles.length === 0 && !loading ? (
            <EmptyState
              title={
                activeSearch || activeCategory
                  ? t("لم نعثر على مقالات مطابقة", "No matching articles found")
                  : t("لا توجد مقالات منشورة الآن", "No articles have been published yet")
              }
              description={
                activeSearch || activeCategory
                  ? t(
                      "جرّبي عبارة بحث مختلفة أو اختاري تصنيفاً آخر.",
                      "Try a different search or choose another category.",
                    )
                  : t(
                      "ستجدين هنا المقالات الطبية والتوعوية فور نشرها.",
                      "Medical and wellness articles will appear here when published.",
                    )
              }
            />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
              {articles.map((a, i) => (
                <Reveal className="h-full" key={`${a.slug}-${i}`} delay={Math.min(i, 8) * 0.05}>
                  <ArticleCard article={a} priority={i < 2} />
                </Reveal>
              ))}
              {loading &&
                EMPTY.concat(Array.from({ length: 3 })).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
            </div>
          )}

          {/* Load more + real crawlable page links */}
          <div className="mt-10 flex flex-col items-center gap-4">
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full bg-gold-gradient font-bold text-sm px-7 py-3 hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-hover disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer"
              >
                {loading ? t("جارٍ التحميل…", "Loading…") : t("عرض المزيد", "Load more")}
              </button>
            )}
            <p className="text-xs text-[var(--text-muted)]">
              {t("عرض {0} من {1}", "Showing {0} of {1}", shownCount, total)}
            </p>
            <nav className="flex items-center gap-1" aria-label={t("ترقيم الصفحات", "Pagination")}>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const n = idx + 1;
                if (totalPages > 7 && n > 3 && n < totalPages - 1 && Math.abs(n - page) > 1) {
                  if (n === 4) return <span key="dots" className="px-2 text-[var(--text-muted)]">…</span>;
                  return null;
                }
                return (
                  <button
                    key={n}
                    onClick={() => router.push(`${blogBase}?${buildQuery(n)}`, { scroll: false })}
                    aria-current={n === page ? "page" : undefined}
                    className={`min-w-9 h-9 rounded-full text-sm font-bold border transition-colors ${
                      n === page
                        ? "bg-[var(--bg-dark)] text-[var(--text-on-dark)] border-transparent"
                        : "border-[var(--border-control)] text-[var(--text-secondary)] hover:border-[var(--border-control)]"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </nav>
          </div>

          <p className="mt-10 text-center text-sm text-[var(--text-secondary)]">
            {t(
              "محتوى المدونة للتوعية العامة ولا يغني عن الاستشارة الطبية. لحالتكِ الخاصة، احجزي استشارة مع إحدى طبيباتنا.",
              "Blog content is for general awareness and does not replace medical advice. For your specific case, book a consultation with one of our doctors.",
            )}
          </p>
        </div>
      </section>
    </>
  );
};
