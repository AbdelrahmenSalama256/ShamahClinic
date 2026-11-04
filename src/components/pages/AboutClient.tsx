"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
import { GoldLink } from "@/components/shared/Actions";
import { images } from "@/lib/images";
import type { AboutPage, AboutSplit } from "@/lib/content/about-page";

/**
 * The About page as its published row describes it.
 *
 * Every sentence here is a value the owner typed — `getAboutPage()` reads them off the
 * `/about` row's published copy — and every block that has nothing under it is not drawn.
 * The two figures the first split counts (branches, treatments) arrive counted, because a
 * number typed beside a list is a number that goes stale; the third is the owner's.
 *
 * The two cards at the foot of the page are the shell's own links to `/doctors` and
 * `/branches`: their words are catalogue copy the console's text center rewrites, and their
 * photographs are the site's standing ones, so neither belongs to this row.
 */
export const AboutClient: React.FC<{ page: AboutPage }> = ({ page }) => {
  const { t, formatNumber } = useLanguage();

  const split = (entry: AboutSplit, index: number) => (
    <section
      key={index}
      className={`py-5 lg:py-16 ${index % 2 ? "bg-[var(--bg-secondary)]/60" : "bg-[var(--bg-primary)]"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className={entry.image ? "lg:col-span-6" : "lg:col-span-12"}>
          <SectionHeading title={entry.title} />
          <div className="mt-6 space-y-4 text-base leading-[1.9] text-[var(--text-secondary)]">
            {entry.paragraphs.map((paragraph, position) => (
              <Reveal key={position} delay={position * 0.08}>
                <p dir="auto">{t(paragraph.ar, paragraph.en)}</p>
              </Reveal>
            ))}
          </div>

          {index === 0 ? (
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-[var(--border-control)] pt-8">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("فرع", "Branches")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(page.branchCount)}</span></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("خدمة", "Treatments")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(page.treatmentCount)}</span></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("طاقم نسائي", "Female staff")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(t(page.staffValue.ar, page.staffValue.en))}</span></dd>
              </div>
            </dl>
          ) : null}
        </div>
        {entry.image ? (
          <div className="lg:col-span-6">
            <Reveal direction="start">
              <div className="rounded-3xl overflow-hidden">
                <Photo slot={entry.image} ratio="landscape" curtain sizes="(max-width:1024px) 100vw, 45vw" />
              </div>
            </Reveal>
          </div>
        ) : null}
      </div>
    </section>
  );

  /** One numbered editorial list — the reasons and the values are drawn the same way. */
  const numberedList = (items: { ar: string; en: string }[]) => (
    <ol className="mt-12 space-y-10">
      {items.map((item, index) => (
        <Reveal as="li" key={index} delay={index * 0.08} className="flex gap-6">
          <span className="text-4xl font-black text-[var(--gold-end)] num leading-none">
            {formatNumber(index + 1)}
          </span>
          <h3 className="text-xl font-black text-[var(--text-primary)]" dir="auto">
            {t(item.ar, item.en)}
          </h3>
        </Reveal>
      ))}
    </ol>
  );

  return (
    <>
      <PageHero
        title={page.title}
        lead={page.lead}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/about", label: page.title },
        ]}
        photo={page.hero ?? undefined}
      />

      {page.splits.map(split)}

      {page.reasons.length > 0 ? (
        <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <SectionHeading align="center" title={page.reasonsTitle} lead={page.reasonsLead} />
            {numberedList(page.reasons)}
          </div>
        </section>
      ) : null}

      {page.values.length > 0 ? (
        <section className="py-5 lg:py-16 bg-[var(--bg-secondary)]/60">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <SectionHeading align="center" title={page.valuesTitle} lead={page.valuesLead} />
            {numberedList(page.values)}
          </div>
        </section>
      ) : null}

      {page.numbers.length > 0 ? (
        <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading align="center" title={page.numbersTitle} lead={page.numbersLead} />
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {page.numbers.map((entry, index) => (
                <Reveal key={index} delay={index * 0.08} className="bg-[var(--bg-card)]/70 rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-[var(--gold-end)]">{formatNumber(t(entry.value.ar, entry.value.en))}</div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]" dir="auto">{t(entry.label.ar, entry.label.en)}</div>
                  {entry.note.ar || entry.note.en ? (
                    <div className="mt-1 text-xs text-[var(--text-muted)]" dir="auto">{t(entry.note.ar, entry.note.en)}</div>
                  ) : null}
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6">
          <Reveal className="relative rounded-3xl overflow-hidden min-h-[300px] group">
            <Photo slot={images.doctors.doctor1} ratio="landscape" className="!aspect-auto !absolute inset-0 !h-full" imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" sizes="(max-width:768px) 100vw, 45vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-dark)]/85 via-[var(--bg-dark)]/30 to-transparent" />
            <div className="absolute bottom-0 p-7">
              <h3 className="text-xl sm:text-2xl font-black text-[var(--text-on-dark)] mb-2">{t("الفريق الطبي", "The medical team")}</h3>
              <p className="text-sm text-[var(--text-on-dark-muted)] mb-4 max-w-sm">
                {t("استشاريات وأخصائيات يقُدن كل قسم بأنفسهن.", "Consultants and specialists who personally lead each department.")}
              </p>
              <GoldLink href="/doctors" withArrow size="sm" className="!bg-[var(--bg-card)]/95">
                {t("تعرّفي عليهن", "Meet them")}
              </GoldLink>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="relative rounded-3xl overflow-hidden min-h-[300px] group">
            <Photo slot={images.interiors.corridor} ratio="landscape" className="!aspect-auto !absolute inset-0 !h-full" imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" sizes="(max-width:768px) 100vw, 45vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-dark)]/85 via-[var(--bg-dark)]/30 to-transparent" />
            <div className="absolute bottom-0 p-7">
              <h3 className="text-xl sm:text-2xl font-black text-[var(--text-on-dark)] mb-2">{t("فروعنا", "Our branches")}</h3>
              <p className="text-sm text-[var(--text-on-dark-muted)] mb-4 max-w-sm">
                {t("مدينة نصر، التجمع الخامس، والشيخ زايد.", "Nasr City, Fifth Settlement and Sheikh Zayed.")}
              </p>
              <GoldLink href="/branches" withArrow size="sm" className="!bg-[var(--bg-card)]/95">
                {t("اختاري الفرع", "Choose a branch")}
              </GoldLink>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
};
