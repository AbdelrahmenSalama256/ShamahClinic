"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { Swiper } from "@/components/ui/Swiper";
import { GoldLink, whatsappHref } from "@/components/shared/Actions";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { getLocalizedHref } from "@/lib/locale";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import { images } from "@/lib/images";
import type { Offer as UIOffer } from "@/data/offers";
import type { Article as UIArticle } from "@/data/journal";
import { MapPin, Phone, MessageCircle } from "lucide-react";

interface HomeBranch {
  id: string;
  name: { ar: string; en: string };
  area: { ar: string; en: string };
  address: { ar: string; en: string };
  phone: string;
  image: string | null;
}

interface HomeBodyProps {
  offers: UIOffer[];
  articles: UIArticle[];
  branches: HomeBranch[];
}

const Section: React.FC<{
  id?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, children, className = "" }) => (
  <section id={id} className={`py-5 lg:py-16 ${className}`}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

/** Every card list on Home shows the first three; the rest live on their page. */
const HOME_CARDS = 3;

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

export const HomeBody: React.FC<HomeBodyProps> = ({ offers, articles, branches }) => {
  const { t, language, formatNumber } = useLanguage();

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
      {/* 01 — Short about: why clients choose Shamah */}
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
                desktopPerView={2}
                loop
                gap={24}
                autoPlayMs={5000}
                showArrows
                showDots
                slides={differentiators.slice(0, HOME_CARDS).map((d, i) => (
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
            {differentiators.length > HOME_CARDS && (
              <GoldLink href="/about" withArrow size="sm" className="mt-5">
                {t("كل الأسباب", "All reasons")}
              </GoldLink>
            )}
          </div>
        </div>
      </Section>

      {/* 02 — Seasonal offers (live WordPress/WooCommerce, max 3) */}
      <Section id="offers" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="02"
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
          {offers.slice(0, HOME_CARDS).map((o, i) => (
            <Reveal className="h-full min-w-0" key={o.id} delay={i * 0.08}>
              <OfferCard offer={o} />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 03 — Compact branches strip (call / WhatsApp) */}
      <Section id="branches" className="bg-[var(--bg-primary)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="03"
            title={{ ar: "فروعنا الثلاثة", en: "Our three branches" }}
            lead={{
              ar: "اختاري الفرع الأقرب واتصلي مباشرة أو راسلينا على واتساب.",
              en: "Pick the nearest branch, call directly, or message us on WhatsApp.",
            }}
          />
          <GoldLink href="/branches" withArrow className="mb-1">
            {t("تفاصيل الفروع", "Branch details")}
          </GoldLink>
        </div>

        <div className="mt-6 lg:mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {branches.slice(0, HOME_CARDS).map((b, i) => (
            <Reveal key={b.id} delay={i * 0.08} className="h-full min-w-0">
              <div className="group h-full flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-card)] border border-[var(--gold-border)]/50 hover:border-[var(--gold-mid)]/60 shadow-sm hover:shadow-lg transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)]">
                <Link
                  href={getLocalizedHref(`/branches/${b.id}`, language)}
                  className="relative block overflow-hidden aspect-[16/10]"
                >
                  {b.image && (
                    <Photo
                      slot={toPhotoSlot(b.image, b.name)}
                      ratio="landscape"
                      className="!aspect-auto !h-full w-full"
                      imgClassName="group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
                      sizes="(max-width:768px) 100vw, (max-width:1024px) 50vw, 33vw"
                    />
                  )}
                  {/* Dark gradient for legibility */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                  />
                  <span className="absolute top-3 start-3 text-[10px] font-bold tracking-[0.2em] uppercase text-white bg-black/40 backdrop-blur-sm border border-white/20 rounded-full px-2.5 py-1">
                    {t("فرع", "Branch")} {formatNumber(i + 1)}
                  </span>
                  <div className="absolute bottom-0 start-0 end-0 p-4">
                    <h3 className="text-lg sm:text-xl font-black text-white leading-tight drop-shadow-md">
                      {t(b.name.ar, b.name.en)}
                    </h3>
                  </div>
                </Link>

                <div className="flex flex-col flex-1 p-4 sm:p-5">
                  <p className="text-xs text-[var(--text-muted)]">{t(b.area.ar, b.area.en)}</p>
                  <div className="mt-2 flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
                    <span>{t(b.address.ar, b.address.en)}</span>
                  </div>

                  <div className="mt-auto pt-4 flex items-center gap-2">
                    <a
                      href={`tel:${b.phone}`}
                      dir="ltr"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-gold-gradient text-white text-xs font-bold px-3 py-2.5 hover:-translate-y-0.5 hover:shadow transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {b.phone}
                    </a>
                    <a
                      href={whatsappHref(
                        language,
                        language === "ar"
                          ? `مرحباً عيادات شامه، أرغب في الحجز في فرع ${b.name.ar}.`
                          : `Hello Shamah Clinics, I would like to book at the ${b.name.en} branch.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-600/40 text-emerald-700 text-xs font-bold px-3 py-2.5 hover:bg-emerald-50 transition-[background-color] duration-300"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {t("واتساب", "WhatsApp")}
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 04 — Latest journal (live WordPress, max 3) */}
      <Section id="blogs" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index="04"
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
          {articles.slice(0, HOME_CARDS).map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      </Section>

    </>
  );
};
