"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
import { GoldLink } from "@/components/shared/Actions";
import { images } from "@/lib/images";
import type { PhotoSlot } from "@/lib/images";
import type { AboutContent, AboutStructuredData, AboutSection } from '@/data/about';

/** Fallback copy used before the owner has written any field: today's hard-coded text, so
 *  the page keeps rendering exactly as it did before this field exists. */
function structuredOrDefault(about: AboutContent): AboutStructuredData & {
  teamIds: string[];
  branchesIds: string[];
  sections: AboutSection[];
} {
  const s = about.structured ?? null;
  return {
    sections: s?.sections ?? about.sections,
    teamIds: s?.team ?? [],
    branchesIds: s?.branches ?? [],
    heroTitle: s?.heroTitle ?? { ar: "من نحن", en: "About Shamah" },
    heroLead: s?.heroLead ?? about.lead,
    storyAr: s?.storyAr ?? null,
    storyEn: s?.storyEn ?? null,
    missionTitle: { ar: "رؤيتنا", en: "Our vision" },
    missionBody: { ar: "أن نكون الصورة المثالية لعيادات التجمیل النسائية في مصر، نذكروا مع الطبقة الطبية دائماً، ونشتق النتائج من الواقع وليس من المبالغة.", en: "To be the leading all-female cosmetic clinic in Egypt, always guided by medical ethics and producing results that are real, not exaggerated." },
    visionTitle: { ar: "قيادتنا", en: "Our leadership" },
    visionBody: { ar: "نضع دائماً البشرة قبل الربح، والراحة قبل الشمول، والشفافية قبل الترويج.", en: "We always put the skin before the profit, comfort before coverage, and transparency before promotion." },
    values: s?.values ?? [
      { ar: "الصدق قبل البيع", en: "Honesty before selling" },
      { ar: "الطب أساس كل جلسة", en: "Medicine underpins every session" },
      { ar: "خصوصية وراحة كاملتان", en: "Complete privacy and comfort" },
    ],
    whyChooseUsTitle: { ar: "لماذا تختار العميلات عيادات شامه؟", en: "Why clients choose Shamah Clinics" },
    whyChooseUsLead: { ar: "أربع نقاط نجيب عليها بصراح قبل أي جلسة.", en: "Four points we answer plainly before any session." },
    whyChooseUs: s?.whyChooseUs ?? [
      { ar: "استشارة قبل أي إجراء", en: "A consultation before any procedure" },
      { ar: "طاقم طبي نسائي بالكامل", en: "An all-female medical team" },
      { ar: "أجهزة حديثة ومنتجات أصلية", en: "Modern devices, authentic products" },
      { ar: "ثلاثة فروع قريبة منكِ", en: "Three branches near you" },
    ],
    numbers: s?.numbers ?? [
      { valueAr: "100", valueEn: "100", labelAr: "طاقم نسائي", labelEn: "Female staff", noteAr: null, noteEn: null },
      { valueAr: "3", valueEn: "3", labelAr: "فرع", labelEn: "Branch", noteAr: null, noteEn: null },
      { valueAr: "9", valueEn: "9", labelAr: "سنة خبرة", labelEn: "Years of experience", noteAr: null, noteEn: null },
    ],
    team: s?.team ?? [],
    branches: s?.branches ?? [],
    certifications: s?.certifications ?? [],
    ctaTitle: { ar: "ابدأِ رحلة بشرة طبيعية", en: "Start your natural skin journey" },
    ctaLink: null,
    ctaVerb: { ar: "تواصلی الآن", en: "Contact us now" },
  };
}

/**
 * Copy comes from WordPress page 32 through `about`; the branch and treatment
 * counters are the WordPress branch list and service list. The values block and
 * the two teasers have no WordPress source and stay authored (docs/WIRING.md).
 */
export const AboutClient: React.FC<{
  about: AboutContent & { structured: AboutStructuredData | null };
  branchCount: number;
  treatmentCount: number;
  banner: PhotoSlot;
}> = ({ about, branchCount, treatmentCount, banner }) => {
  const s = structuredOrDefault(about);
  const { t, formatNumber } = useLanguage();

  return (
    <>
      <PageHero
        title={about.title}
        lead={about.lead}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/about", label: about.title },
        ]}
        photo={banner}
      />

      {/* Story / Process — one editorial split per WordPress section */}
      {s.sections.map((section, i) => (
        <section
          key={`${i}-${section.heading.en}`}
          className={`py-5 lg:py-16 ${
            i % 2 ? "bg-[var(--bg-secondary)]/60" : "bg-[var(--bg-primary)]"
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <div className={section.image ? "lg:col-span-6" : "lg:col-span-12"}>
              <SectionHeading title={section.heading} />
              <div className="mt-6 space-y-4 text-base leading-[1.9] text-[var(--text-secondary)]">
                {section.paragraphs.map((paragraph, p) => (
                  <Reveal key={p} delay={p * 0.08}>
                    <p>{t(paragraph.ar, paragraph.en)}</p>
                  </Reveal>
                ))}
              </div>

              {i === 0 ? (
                <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-[var(--border-control)] pt-8">
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">{t("فرع", "Branches")}</dt>
                    <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(branchCount)}</span></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">{t("خدمة", "Treatments")}</dt>
                    <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(treatmentCount)}</span></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">{t("طاقم نسائي", "Female staff")}</dt>
                    <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(100)}٪</span></dd>
                  </div>
                </dl>
              ) : null}
            </div>
            {section.image ? (
              <div className="lg:col-span-6">
                <Reveal direction="start">
                  <div className="rounded-3xl overflow-hidden">
                    <Photo slot={section.image} ratio="landscape" curtain sizes="(max-width:1024px) 100vw, 45vw" />
                  </div>
                </Reveal>
              </div>
            ) : null}
          </div>
        </section>
      ))}

      {/* Why clients choose Shamah — the four reasons Home used to carry. They have
          no WordPress source (see docs/STATIC-SWEEP.md), so they live here as
          authored copy and Home links to this block. */}
      <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <SectionHeading
            align="center"
            title={s.whyChooseUsTitle}
            lead={s.whyChooseUsLead}
          />
          <ol className="mt-12 space-y-10">
            {s.whyChooseUs.map((reason: { ar: string; en: string }, i: number) => (
              <Reveal as="li" key={i} delay={i * 0.08} className="flex gap-6">
                <span className="text-4xl font-black text-[var(--gold-end)] num leading-none">
                  {formatNumber(i + 1)}
                </span>
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)]" dir="auto">
                    {t(reason.ar, reason.en)}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]" dir="auto">
                    {t(reason.ar, reason.en)}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Values — numbered editorial list, not identical cards */}
      <section className="py-5 lg:py-16 bg-[var(--bg-secondary)]/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <SectionHeading
            align="center"
            title={{ ar: "ما نلتزم به", en: "What we stand by" }}
            lead={{ ar: "ثلاث قواعد تحكم كل قرار في عيادات شامه.", en: "Three rules that govern every decision at Shamah." }}
          />
          <ol className="mt-12 space-y-10">
            {s.values.map((v: { ar: string; en: string }, i: number) => (
              <Reveal as="li" key={i} delay={i * 0.08} className="flex gap-6">
                <span className="text-4xl font-black text-[var(--gold-end)] num leading-none">
                  {formatNumber(i + 1)}
                </span>
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)]">{t(v.ar, v.en)}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">{t(v.ar, v.en)}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Numbers the owner enters, rendered as a grid of big stat cards. */}
      {s.numbers.length > 0 ? (
        <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              align="center"
              title={{ ar: "أرقامنا", en: "Our numbers" }}
              lead={{ ar: "أرقام العيادة اللي تقدر تشوفها أي عميل.", en: "The numbers behind the clinic you can see." }}
            />
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {s.numbers.map((n: { valueAr: string; valueEn: string; labelAr: string; labelEn: string; noteAr: string | null; noteEn: string | null }, i: number) => (
                <Reveal key={i} delay={i * 0.08} className="bg-[var(--bg-card)]/70 rounded-2xl p-6 text-center">
                  <div className="text-3xl font-black text-[var(--gold-end)]">{formatNumber(n.valueAr)}</div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{t(n.labelAr, n.labelEn)}</div>
                  {n.noteAr && (
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{t(n.noteAr ?? "", n.noteEn ?? "")}</div>
                  )}
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
