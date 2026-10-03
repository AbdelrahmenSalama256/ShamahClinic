"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
import { GoldLink } from "@/components/shared/Actions";
import { images } from "@/lib/images";
import { verifiedFacts } from "@/data/placeholders";
import { treatmentsData } from "@/data/treatments";

export const AboutClient: React.FC = () => {
  const { t, formatNumber } = useLanguage();

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
        ar: "طاقم نسائي بالكامل، غرف خاصة، ومواعيد مرنة — لتخوضي تجربتكِ بأريحية تامة في أي فرع.",
        en: "An all-female team, private rooms and flexible hours — so you go through your experience in total comfort at any branch.",
      },
    },
  ];

  return (
    <>
      <PageHero
        title={{ ar: "من نحن", en: "About Shamah" }}
        lead={{
          ar: "عيادات شامه وجهة لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة، تقوم على فكرة بسيطة: بشرة صحية بنتيجة طبيعية، وقرار طبي واضح بلا مبالغة.",
          en: "Shamah Clinics is a destination for aesthetic medicine, laser and skincare in Cairo and Giza, built on a simple idea: healthy skin with natural results, and a clear medical decision without exaggeration.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/about", label: { ar: "من نحن", en: "About" } },
        ]}
        photo={images.interiors.reception}
      />

      {/* Story — asymmetric editorial split */}
      <section className="py-5 lg:py-16 bg-[var(--bg-primary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-6">
            <SectionHeading
              title={{ ar: "بدأنا من سؤال بسيط", en: "We started from a simple question" }}
            />
            <div className="mt-6 space-y-4 text-base leading-[1.9] text-[var(--text-secondary)]">
              <Reveal>
                <p>
                  {t(
                    "لماذا تخرج كثيرات من عيادات التجميل بنتيجة لا تشبههن؟ كان هذا سؤالنا الأول. الإجابة عندنا أن التجميل الناجح لا يغيّر الملامح بل يرتاح بها الوجه، وأن كل بشرة حالة مستقلة تحتاج تقييماً لا قالباً جاهزاً.",
                    "Why do many women leave aesthetic clinics with a result that does not look like them? That was our first question. Our answer is that successful aesthetics does not change features but lets the face rest, and that every skin is a unique case needing assessment, not a ready-made template."
                  )}
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <p>
                  {t(
                    "من هذه الفكرة وُلدت عيادات شامه: طاقم طبي نسائي متخصص، أجهزة حديثة بمنتجات أصلية، وبروتوكول يبدأ دائماً باستشارة وتحليل مكتوب. اليوم نخدم عميلاتنا من ثلاثة فروع في القاهرة والجيزة.",
                    "From this idea Shamah Clinics was born: a specialised all-female medical team, modern devices with authentic products, and a protocol that always begins with a consultation and a written analysis. Today we serve our clients from three branches across Cairo and Giza."
                  )}
                </p>
              </Reveal>
            </div>

            {/* Real, verified figures only */}
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-[var(--gold-border)]/50 pt-8">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("فرع", "Branches")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(verifiedFacts.branchCount)}</span></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("خدمة", "Treatments")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(treatmentsData.length)}</span></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">{t("طاقم نسائي", "Female staff")}</dt>
                <dd className="text-3xl font-black text-[var(--gold-end)]"><span>{formatNumber(100)}٪</span></dd>
              </div>
            </dl>
          </div>
          <div className="lg:col-span-6">
            <Reveal direction="start">
              <div className="rounded-3xl overflow-hidden">
                <Photo slot={images.interiors.consultation} ratio="landscape" curtain sizes="(max-width:1024px) 100vw, 45vw" />
              </div>
            </Reveal>
          </div>
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
                <span className="text-4xl font-black text-[var(--gold-end)] tabular-nums leading-none">
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
              <h3 className="text-xl sm:text-2xl font-black text-white mb-2">{t("الفريق الطبي", "The medical team")}</h3>
              <p className="text-sm text-white/80 mb-4 max-w-sm">
                {t("استشاريات وأخصائيات يقُدن كل قسم بأنفسهن.", "Consultants and specialists who personally lead each department.")}
              </p>
              <GoldLink href="/doctors" withArrow size="sm" className="!bg-white/95">
                {t("تعرّفي عليهن", "Meet them")}
              </GoldLink>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="relative rounded-3xl overflow-hidden min-h-[300px] group">
            <Photo slot={images.interiors.corridor} ratio="landscape" className="!aspect-auto !absolute inset-0 !h-full" imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" sizes="(max-width:768px) 100vw, 45vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-dark)]/85 via-[var(--bg-dark)]/30 to-transparent" />
            <div className="absolute bottom-0 p-7">
              <h3 className="text-xl sm:text-2xl font-black text-white mb-2">{t("فروعنا", "Our branches")}</h3>
              <p className="text-sm text-white/80 mb-4 max-w-sm">
                {t("مدينة نصر، التجمع الخامس، والشيخ زايد.", "Nasr City, Fifth Settlement and Sheikh Zayed.")}
              </p>
              <GoldLink href="/branches" withArrow size="sm" className="!bg-white/95">
                {t("اختاري الفرع", "Choose a branch")}
              </GoldLink>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
};
