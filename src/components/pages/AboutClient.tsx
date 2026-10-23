"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
import { GoldLink } from "@/components/shared/Actions";
import { images } from "@/lib/images";
import type { AboutContent } from "@/data/about";

/**
 * Copy comes from WordPress page 32 through `about`; the branch and treatment
 * counters are the WordPress branch list and service list. The values block and
 * the two teasers have no WordPress source and stay authored (docs/WIRING.md).
 */
export const AboutClient: React.FC<{
  about: AboutContent;
  branchCount: number;
  treatmentCount: number;
}> = ({ about, branchCount, treatmentCount }) => {
  const { t, formatNumber } = useLanguage();

  const reasons = [
    {
      title: { ar: "استشارة قبل أي إجراء", en: "A consultation before any procedure" },
      body: {
        ar: "لا نبدأ جلسة قبل تحليل بشرتكِ وتوضيح المتوقع واقعياً وعدد الجلسات والتكلفة.",
        en: "No session begins before analysing your skin and setting realistic expectations, session count and cost.",
      },
    },
    {
      title: { ar: "طاقم طبي نسائي بالكامل", en: "An all-female medical team" },
      body: {
        ar: "طبيبات وأخصائيات وتمريض نسائي في كل الفروع، لخصوصية وراحة كاملتين.",
        en: "Female doctors, specialists and nurses at every branch, for complete privacy and comfort.",
      },
    },
    {
      title: { ar: "أجهزة حديثة ومنتجات أصلية", en: "Modern devices, authentic products" },
      body: {
        ar: "أجهزة ليزر بأنظمة تبريد، وفيلر وبوتوكس أصلي معتمد يُفتح أمامكِ.",
        en: "Lasers with cooling systems, and authentic approved filler and Botox opened in front of you.",
      },
    },
    {
      title: { ar: "ثلاثة فروع قريبة منكِ", en: "Three branches near you" },
      body: {
        ar: "مدينة نصر، التجمع الخامس، والشيخ زايد — للحجز في أيٍّ منها تواصلي عبر واتساب أو الهاتف.",
        en: "Nasr City, Fifth Settlement and Sheikh Zayed — to book at any of them, reach us on WhatsApp or by phone.",
      },
    },
  ];

  const values = [
    {
      title: { ar: "الصدق قبل البيع", en: "Honesty before selling" },
      body: {
        ar: "نقول لكِ ما تحتاجه بشرتكِ فعلاً، وقد نؤجل إجراءً أو نرفضه إن لم يكن في مصلحتك. الثقة تُبنى بالصدق لا بالوعود.",
        en: "We tell you what your skin actually needs, and may postpone or decline a procedure if it is not in your interest. Trust is built on honesty, not promises.",
      },
    },
    {
      title: { ar: "الطب أساس كل جلسة", en: "Medicine underpins every session" },
      body: {
        ar: "التجميل عندنا قرار طبي: تشخيص، خطة، ومتابعة. لا إجراءات سريعة بلا تقييم، ولا منتجات غير معروفة المصدر.",
        en: "Aesthetics here is a medical decision: diagnosis, plan and follow-up. No rushed procedures without assessment, no products of unknown origin.",
      },
    },
    {
      title: { ar: "خصوصية وراحة كاملتان", en: "Complete privacy and comfort" },
      body: {
        ar: "طاقم نسائي بالكامل وغرف خاصة — لتخوضي تجربتكِ بأريحية تامة في أي فرع.",
        en: "An all-female team and private rooms — so you go through your experience in total comfort at any branch.",
      },
    },
  ];

  return (
    <>
      <PageHero
        title={about.title}
        lead={about.lead}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/about", label: about.title },
        ]}
        photo={images.interiors.reception}
      />

      {/* Story / Process — one editorial split per WordPress section */}
      {about.sections.map((section, i) => (
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
            title={{ ar: "لماذا تختار العميلات عيادات شامه؟", en: "Why clients choose Shamah Clinics" }}
            lead={{
              ar: "أربع نقاط نجيب عليها بصراحة قبل أي جلسة.",
              en: "Four points we answer plainly before any session.",
            }}
          />
          <ol className="mt-12 space-y-10">
            {reasons.map((reason, i) => (
              <Reveal as="li" key={i} delay={i * 0.08} className="flex gap-6">
                <span className="text-4xl font-black text-[var(--gold-end)] num leading-none">
                  {formatNumber(i + 1)}
                </span>
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)]" dir="auto">
                    {t(reason.title.ar, reason.title.en)}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]" dir="auto">
                    {t(reason.body.ar, reason.body.en)}
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
            {values.map((v, i) => (
              <Reveal as="li" key={i} delay={i * 0.08} className="flex gap-6">
                <span className="text-4xl font-black text-[var(--gold-end)] num leading-none">
                  {formatNumber(i + 1)}
                </span>
                <div>
                  <h3 className="text-xl font-black text-[var(--text-primary)]">{t(v.title.ar, v.title.en)}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">{t(v.body.ar, v.body.en)}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Teasers to team & branches */}
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
