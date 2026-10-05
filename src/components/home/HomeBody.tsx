"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { CtaBand } from "@/components/ui/CtaBand";
import { Swiper } from "@/components/ui/Swiper";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { GoldLink } from "@/components/shared/Actions";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { DoctorCard } from "@/components/cards/DoctorCard";
import { getLocalizedHref } from "@/lib/locale";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { ResultCaseCard } from "@/components/cards/ResultCaseCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { images } from "@/lib/images";
import { treatmentsData, getTreatment } from "@/data/treatments";
import { specialistsData } from "@/data/specialists";
import { branchesData } from "@/data/branches";
import { journalData } from "@/data/journal";
import { resultsData } from "@/data/results";
import { offersData } from "@/data/offers";
import { faqData } from "@/data/faq";
import { ArrowLeft, ArrowRight, MapPin, Phone } from "lucide-react";

const Section: React.FC<{
  id?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, children, className = "" }) => (
  <section id={id} className={`py-5 lg:py-16 ${className}`}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

const DifferentiatorItem: React.FC<{
  n: string;
  title: string;
  body: string;
}> = ({ n, title, body }) => (
  <div className="flex gap-5">
    <span className="text-xl sm:text-2xl font-black text-[var(--gold-end)] tabular-nums leading-none pt-1">
      {n}
    </span>
    <div>
      <h3 className="text-lg font-black text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1.5 text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  </div>
);

export const HomeBody: React.FC = () => {
  const { t, language, formatNumber } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  const featured = getTreatment("laser-hair-removal")!;
  const indexTreatments = treatmentsData
    .filter((x) => x.id !== featured.id)
    .slice(0, 6);
  const [leadArticle, ...restArticles] = journalData;

  const differentiators = [
    {
      n: "01",
      title: {
        ar: "استشارة قبل أي إجراء",
        en: "A consultation before any procedure",
      },
      body: {
        ar: "لا نبدأ جلسة قبل تحليل بشرتكِ وتوضيح المتوقع واقعياً وعدد الجلسات والتكلفة.",
        en: "No session begins before analysing your skin and setting realistic expectations, session count and cost.",
      },
    },
    {
      n: "02",
      title: { ar: "طاقم طبي نسائي بالكامل", en: "An all-female medical team" },
      body: {
        ar: "طبيبات وأخصائيات وتمريض نسائي في كل الفروع، لخصوصية وراحة كاملتين.",
        en: "Female doctors, specialists and nurses at every branch, for complete privacy and comfort.",
      },
    },
    {
      n: "03",
      title: {
        ar: "أجهزة حديثة ومنتجات أصلية",
        en: "Modern devices, authentic products",
      },
      body: {
        ar: "أجهزة ليزر بأنظمة تبريد، وفيلر وبوتوكس أصلي معتمد يُفتح أمامكِ.",
        en: "Lasers with cooling systems, and authentic approved filler and Botox opened in front of you.",
      },
    },
    {
      n: "04",
      title: { ar: "ثلاثة فروع قريبة منكِ", en: "Three branches near you" },
      body: {
        ar: "مدينة نصر، التجمع الخامس، والشيخ زايد — بمواعيد مرنة يومياً من ١٠ ص إلى ١٠ م.",
        en: "Nasr City, Fifth Settlement and Sheikh Zayed — flexible hours daily, 10am to 10pm.",
      },
    },
  ];

  return (
    <>
      {/* 01 — Editorial intro, asymmetric split */}
      <Section className="bg-[var(--bg-primary)]">
        {/* min-w-0 on grid items prevents the swiper from blowing out the layout */}
        <div className="mt-8 lg:mt-14 grid lg:grid-cols-12 gap-8 lg:gap-16 items-end">
          <div className="lg:col-span-5 min-w-0">
            <Reveal>
              <div className="rounded-3xl overflow-hidden">
                <Photo
                  slot={images.interiors.reception}
                  ratio="landscape"
                  curtain
                  sizes="(max-width:1024px) 100vw, 45vw"
                />
              </div>
            </Reveal>
          </div>
          <div className="lg:col-span-7 min-w-0">
            <SectionHeading
              index="01"
              title={{
                ar: "لماذا تختار العميلات عيادات شامه؟",
                en: "Why clients choose Shamah Clinics",
              }}
              lead={{
                ar: "لأننا نتعامل مع البشرة كحالة طبية تحتاج تقييماً وخطة، لا كمنتج يُباع. هذا ما يجعل النتائج طبيعية ومستقرة.",
                en: "Because we treat skin as a medical case needing assessment and a plan, not a product to sell. That is what makes results natural and stable.",
              }}
            />

            <div className="mt-5 w-full min-w-0 overflow-hidden">
              <Swiper
                label={{
                  ar: "لماذا تختار العميلات شامه",
                  en: "Why clients choose Shamah",
                }}
                mobilePerView={1}
                tabletPerView={2}
                loop={true}
                  desktopPerView={2}
                gap={24}
                autoPlayMs={5000}
                showArrows
                showDots
                slides={differentiators.map((d, i) => (
                  <Reveal key={d.n} delay={i * 0.08}>
                    <DifferentiatorItem
                      n={d.n}
                      title={t(d.title.ar, d.title.en)}
                      body={t(d.body.ar, d.body.en)}
                    />
                  </Reveal>
                ))}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 02 — Featured treatment + index rows */}
      <Section id="services" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="02"
            title={{ ar: "خدماتنا التجميلية", en: "Our aesthetic treatments" }}
            lead={{
              ar: "من الليزر والعناية بالبشرة إلى الحقن والنضارة — اختاري الخدمة للاطلاع على التفاصيل والأسعار.",
              en: "From laser and skincare to injectables and rejuvenation — open a service for details and prices.",
            }}
          />
          <GoldLink href="/services" withArrow className="mb-1">
            {t("كل الخدمات", "All treatments")}
          </GoldLink>
        </div>

        <div className="mt-6 lg:mt-10 grid lg:grid-cols-12 gap-8">
          <Reveal className="lg:col-span-5 min-w-0">
            <TreatmentCard treatment={featured} />
          </Reveal>
          <div className="lg:col-span-5 min-w-0">
            <ul className="border-t border-[var(--gold-border)]/40 grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
              {indexTreatments.map((x, i) => (
                <Reveal as="li" key={x.id} delay={i * 0.05}>
                  <Link
                    href={getLocalizedHref(`/treatments/${x.id}`, language)}
                    className="group flex items-center justify-between gap-4 py-5 border-b border-[var(--gold-border)]/40 hover:ps-2 transition-[padding] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                  >
                    <div>
                      <h3 className="text-sm sm:text-base lg:text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--gold-end)] transition-colors duration-300">
                        {t(x.name.ar, x.name.en)}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {t(x.categoryName.ar, x.categoryName.en)}
                      </p>
                    </div>
                    <Arrow className="w-5 h-5 text-[var(--gold-mid)] shrink-0 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Mid-page CTA band */}
      <CtaBand
        compact
        title={{
          ar: "احجزي استشارتكِ في أقرب فرع",
          en: "Book your consultation at the nearest branch",
        }}
        lead={{
          ar: "فريقنا يرد خلال دقائق على واتساب لتأكيد الموعد المناسب لكِ.",
          en: "Our team replies within minutes on WhatsApp to confirm a time that suits you.",
        }}
      />

      {/* 03 — Results preview */}
      <Section id="results" className="bg-[var(--bg-primary)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="03"
            title={{ ar: "نتائج من عياداتنا", en: "Results from our clinics" }}
            lead={{
              ar: "أمثلة على تحسن البشرة بعد كورسات علاجية. الصور المعروضة تمثيلية حتى توثيق صور عميلات بموافقتهن.",
              en: "Examples of skin improvement after treatment courses. Photos shown are representative until consented client photos are documented.",
            }}
          />
          <GoldLink href="/results" withArrow className="mb-1">
            {t("كل النتائج", "All results")}
          </GoldLink>
        </div>
        <div className="mt-6 lg:mt-5 w-full min-w-0 overflow-hidden">
          <Swiper
            label={{ ar: "نتائج قبل وبعد", en: "Before and after results" }}
            slides={resultsData.map((r) => (
              <ResultCaseCard key={r.id} result={r} />
            ))}
          />
        </div>
      </Section>

      {/* 04 — Doctors (staggered, not a rigid grid) */}
      <Section id="specialists" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="04"
            title={{ ar: "طبيبات شامه", en: "Shamah's doctors" }}
            lead={{
              ar: "استشاريات وأخصائيات يقدن كل قسم بأنفسهن، من الاستشارة حتى المتابعة.",
              en: "Consultants and specialists who personally lead each department, from consultation to follow-up.",
            }}
          />
          <GoldLink href="/doctors" withArrow className="mb-1">
            {t("الفريق الطبي", "Medical team")}
          </GoldLink>
        </div>
        <div className="mt-6 lg:mt-10 grid sm:grid-cols-3 gap-4 lg:gap-8">
          {specialistsData.map((doc, i) => (
            <Reveal className="h-full min-w-0" key={doc.id} delay={i * 0.1}>
              <DoctorCard doctor={doc} />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 05 — Featured offer */}
      <Section id="offers" className="bg-[var(--bg-primary)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="05"
            title={{ ar: "باقات الموسم", en: "Seasonal packages" }}
            lead={{
              ar: "باقات تجمع أكثر من جلسة بتوفير حقيقي، سارية في الفروع الثلاثة.",
              en: "Packages combining several sessions at a real saving, valid across all three branches.",
            }}
          />
          <GoldLink href="/offers" withArrow className="mb-1">
            {t("كل العروض", "All offers")}
          </GoldLink>
        </div>
        <div className="mt-6 lg:mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {offersData.slice(0, 3).map((o, i) => (
            <Reveal className="h-full min-w-0" key={o.id} delay={i * 0.08}>
              <OfferCard offer={o} />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 06 — Branches as cards */}
      <Section id="branches" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="06"
            title={{ ar: "فروعنا الثلاثة", en: "Our three branches" }}
            lead={{
              ar: "اختاري الفرع الأقرب واتصلي مباشرة أو اطّلعي على تفاصيله.",
              en: "Pick the nearest branch, call directly, or view its details.",
            }}
          />
          <GoldLink href="/branches" withArrow className="mb-1">
            {t("تفاصيل الفروع", "Branch details")}
          </GoldLink>
        </div>

        <div className="mt-10 lg:mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {branchesData.map((b, i) => (
            <Reveal key={b.id} delay={i * 0.08} className="h-full">
              <div className="group h-full flex flex-col rounded-3xl overflow-hidden bg-[var(--bg-card)] border border-[var(--gold-border)]/40 hover:border-[var(--gold-mid)]/60 shadow-sm hover:shadow-xl transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)]">
                {/* Image with overlay */}
                <Link
                  href={getLocalizedHref(`/branches/${b.id}`, language)}
                  className="relative block overflow-hidden aspect-[4/3]"
                >
                  <Photo
                    slot={b.image}
                    ratio="landscape"
                    className="!aspect-auto !h-full w-full"
                    imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  {/* Dark gradient for legibility */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                  />
                  {/* Branch number chip */}
                  <span className="absolute top-4 start-4 text-[10px] font-bold tracking-[0.2em] uppercase text-white bg-black/40 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1">
                    {t("فرع", "Branch")} {formatNumber(i + 1)}
                  </span>
                  {/* Branch name over image */}
                  <div className="absolute bottom-0 start-0 end-0 p-5">
                    <h3 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-md">
                      {t(b.name.ar, b.name.en)}
                    </h3>
                  </div>
                </Link>

                {/* Body */}
                <div className="flex flex-col flex-1 p-5 sm:p-6">
                  {/* Address */}
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
                    <span>{t(b.address.ar, b.address.en)}</span>
                  </div>

                  {/* Phone — pushed to bottom */}
                  <div className="mt-auto pt-5 flex items-center justify-between gap-3 border-t border-[var(--gold-border)]/30 mt-5">
                    <a
                      href={`tel:${b.phone}`}
                      dir="ltr"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300"
                    >
                      <Phone className="w-4 h-4" />
                      {b.phone}
                    </a>
                    <Link
                      href={getLocalizedHref(`/branches/${b.id}`, language)}
                      className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--gold-end)] transition-colors duration-300"
                    >
                      {t("التفاصيل", "Details")} ←
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 07 — Blog */}
      <Section id="blogs" className="bg-[var(--bg-primary)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="07"
            title={{ ar: "من مدونة شامه", en: "From the Shamah blog" }}
            lead={{
              ar: "مقالات طبية مبسطة تصحح المفاهيم الشائعة وتشرح روتين العناية.",
              en: "Clear medical articles correcting common myths and explaining care routines.",
            }}
          />
          <GoldLink href="/blogs" withArrow className="mb-1">
            {t("كل المدونات", "All blogs")}
          </GoldLink>
        </div>
        <div className="mt-6 lg:mt-10 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
          {[leadArticle, ...restArticles.slice(0, 2)]
            .filter(Boolean)
            .map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
        </div>
      </Section>
    </>
  );
};
