"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { Article } from "@/data/journal";
import { journalData } from "@/data/journal";
import { getSpecialist } from "@/data/specialists";
import {
  Clock,
  CalendarDays,
  ArrowRight,
  ArrowLeft,
  Share2,
  Link2,
  Check,
  ChevronUp,
  List,
  MessageCircle,
  BookOpen,
} from "lucide-react";

export const JournalArticleClient: React.FC<{ article: Article }> = ({
  article,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const author = getSpecialist(article.authorId);
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  const related = useMemo(
    () => journalData.filter((a) => a.slug !== article.slug).slice(0, 3),
    [article.slug],
  );

  // ── Build TOC from sections ──
  const toc = useMemo(
    () =>
      article.sections
        .map((s, i) => ({
          id: `section-${i}`,
          heading: s.heading,
        }))
        .filter((s) => s.heading),
    [article.sections],
  );

  // ── Reading progress ──
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const h = el.scrollHeight - el.clientHeight;
      setProgress(h > 0 ? (el.scrollTop / h) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Share ──
  const [copied, setCopied] = useState(false);
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = language === "ar" ? article.title.ar : article.title.en;
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${pageUrl}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // ── Sticky "back to top" ──
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Reading progress bar */}
      <div
        aria-hidden="true"
        className="fixed top-0 start-0 end-0 h-0.5 z-50 bg-transparent pointer-events-none"
      >
        <div
          className="h-full bg-gold-gradient transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <PageHero
        variant="band"
        title={article.title}
        lead={article.excerpt}
        photo={article.image}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/blogs", label: { ar: "المدونة", en: "Blogs" } },
          {
            href: `/blogs/${article.slug}`,
            label: { ar: article.title.ar, en: article.title.en },
          },
        ]}
      />

      <article className="py-5 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-10 lg:gap-14">
            {/* ══════════════ MAIN CONTENT ══════════════ */}
            <div className="min-w-0">
              {/* Meta row + author */}
              <Reveal className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-muted)] mb-8 pb-6 border-b border-[var(--gold-border)]/40">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-[var(--gold-mid)]" />
                  {t(article.date.ar, article.date.en)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--gold-mid)]" />
                  {t(
                    `${formatNumber(article.readMinutes)} دقائق قراءة`,
                    `${article.readMinutes} min read`,
                  )}
                </span>
                {author && (
                  <span className="inline-flex items-center gap-1.5">
                    {t("بقلم", "By")}{" "}
                    <Link
                      href={getLocalizedHref("/doctors", language)}
                      className="font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors"
                    >
                      {t(author.name.ar, author.name.en)}
                    </Link>
                  </span>
                )}
              </Reveal>

              {/* Body */}
              <div className="space-y-10">
                {article.sections.map((sec, i) => (
                  <Reveal key={i} className="scroll-mt-28">
                    <section id={`section-${i}`}>
                      {sec.heading && (
                        <h2 className="text-xl sm:text-2xl lg:text-[28px] font-black text-[var(--text-primary)] mb-4 leading-snug">
                          {t(sec.heading.ar, sec.heading.en)}
                        </h2>
                      )}
                      <div className="space-y-4">
                        {sec.paragraphs[language].map((p, j) => (
                          <p
                            key={j}
                            className="text-[15px] sm:text-base lg:text-[17px] leading-[1.9] text-[var(--text-secondary)]"
                          >
                            {p}
                          </p>
                        ))}
                      </div>
                      {sec.bullets && (
                        <ul className="mt-5 space-y-2.5 border-s-2 border-[var(--gold-border)] ps-5">
                          {sec.bullets[language].map((b) => (
                            <li
                              key={b}
                              className="text-[15px] sm:text-base leading-relaxed text-[var(--text-primary)]"
                            >
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </Reveal>
                ))}
              </div>

              {/* Inline CTA — mid-article */}
              <Reveal className="my-12 rounded-2xl bg-gold-gradient p-6 sm:p-8 text-center shadow-lg">
                <h3 className="text-lg sm:text-xl font-black text-white mb-2">
                  {t(
                    "محتاجة استشارة شخصية لحالتكِ؟",
                    "Need a personal consultation for your case?",
                  )}
                </h3>
                <p className="text-sm text-white/85 mb-5 max-w-lg mx-auto">
                  {t(
                    "احجزي موعدكِ مع إحدى طبيباتنا واستلمي خطة مخصصة لبشرتكِ.",
                    "Book your appointment with one of our doctors and get a plan tailored to your skin.",
                  )}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <BookButton size="lg" />
                  <WhatsAppButton
                    size="lg"
                    variant="outline"
                    className="!text-white !border-white/50 !bg-white/10 hover:!bg-white/20"
                  />
                </div>
              </Reveal>

              {/* Tags */}
              <div className="mt-10 flex flex-wrap gap-2">
                {article.tags[language].map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--gold-border)]/40 rounded-full px-3 py-1 hover:border-[var(--gold-mid)] hover:text-[var(--gold-end)] transition-colors duration-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Share row */}
              <Reveal className="mt-8 flex flex-wrap items-center gap-3 py-5 border-t border-b border-[var(--gold-border)]/40">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                  <Share2 className="w-4 h-4 text-[var(--gold-mid)]" />
                  {t("شاركي المقال:", "Share this article:")}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={shareLinks.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on WhatsApp"
                    className="w-9 h-9 rounded-full border border-[var(--gold-border)]/50 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 flex items-center justify-center transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                  <a
                    href={shareLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on X"
                    className="w-9 h-9 rounded-full border border-[var(--gold-border)]/50 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center justify-center transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a
                    href={shareLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on Facebook"
                    className="w-9 h-9 rounded-full border border-[var(--gold-border)]/50 text-blue-600 hover:bg-blue-50 hover:border-blue-300 flex items-center justify-center transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                  <button
                    onClick={copyLink}
                    aria-label="Copy link"
                    className="w-9 h-9 rounded-full border border-[var(--gold-border)]/50 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:border-[var(--gold-mid)] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </Reveal>

              {/* Author box */}
              {author && (
                <Reveal className="mt-12 flex flex-col sm:flex-row gap-5 items-start rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-secondary)]/60 p-6">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0">
                    <Photo
                      slot={author.image}
                      ratio="square"
                      className="!aspect-square"
                      sizes="120px"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--gold-end)] mb-1">
                      {t("الكاتبة", "Author")}
                    </p>
                    <h3 className="text-lg font-black text-[var(--text-primary)]">
                      {t(author.name.ar, author.name.en)}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {t(author.title.ar, author.title.en)}
                    </p>
                    <Link
                      href={getLocalizedHref("/doctors", language)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300"
                    >
                      {t("تعرّفي على الفريق الطبي", "Meet the medical team")}
                      <Arrow className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Reveal>
              )}

              {/* Related */}
              {related.length > 0 && (
                <div className="mt-16">
                  <div className="flex items-end justify-between mb-6">
                    <h2 className="text-xl font-black text-[var(--text-primary)]">
                      {t("مدونات ذات صلة", "Related blogs")}
                    </h2>
                    <Link
                      href={getLocalizedHref("/blogs", language)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors"
                    >
                      {t("كل المدونات", "All blogs")}
                      <Arrow className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {related.map((a) => (
                      <ArticleCard key={a.slug} article={a} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ══════════════ SIDEBAR ══════════════ */}
            <aside className="hidden lg:block min-w-0">
              <div className="sticky top-28 space-y-8">
                {/* TOC */}
                {toc.length > 0 && (
                  <nav
                    aria-label="Table of contents"
                    className="rounded-2xl border border-[var(--gold-border)]/40 bg-[var(--bg-card)] p-5"
                  >
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[var(--gold-border)]/40">
                      <List className="w-4 h-4 text-[var(--gold-mid)]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        {t("في هذا المقال", "In this article")}
                      </span>
                    </div>
                    <ul className="space-y-2.5">
                      {toc.map((item, i) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            className="group flex items-start gap-2 text-[13px] leading-snug text-[var(--text-secondary)] hover:text-[var(--gold-end)] transition-colors"
                          >
                            <span className="text-[10px] font-bold text-[var(--gold-end)] tabular-nums pt-0.5 shrink-0">
                              {formatNumber(i + 1)}
                            </span>
                            <span className="border-b border-transparent group-hover:border-[var(--gold-border)] transition-colors">
                              {item.heading
                                ? t(item.heading.ar, item.heading.en)
                                : ""}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}

                {/* Sidebar CTA */}
                <div className="rounded-2xl bg-[var(--bg-dark)] p-5 text-center">
                  <div className="w-12 h-12 rounded-xl bg-gold-gradient mx-auto mb-3 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-black text-white mb-2">
                    {t("استشارة مخصصة", "Personal consultation")}
                  </h3>
                  <p className="text-xs text-white/70 mb-4 leading-relaxed">
                    {t(
                      "خطة علاجية مناسبة لبشرتكِ مع طبيبة متخصصة.",
                      "A treatment plan tailored to your skin with a specialist doctor.",
                    )}
                  </p>
                  <BookButton size="sm" />
                </div>

                {/* Back to blogs */}
                <Link
                  href={getLocalizedHref("/blogs", language)}
                  className="block text-center text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--gold-end)] transition-colors"
                >
                  {t("→ الرجوع إلى المدونة", "→ Back to all blogs")}
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </article>

      {/* Back to top button */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-6 end-6 z-40 w-11 h-11 rounded-full bg-gold-gradient text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-[transform,box-shadow] duration-300 flex items-center justify-center cursor-pointer"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </>
  );
};
