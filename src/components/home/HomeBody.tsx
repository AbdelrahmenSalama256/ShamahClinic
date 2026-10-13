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
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { getLocalizedHref } from "@/lib/locale";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import type { Offer as UIOffer } from "@/data/offers";
import type { Article as UIArticle } from "@/data/journal";
import type { Treatment } from "@/data/treatments";
import { MapPin, Phone, MessageCircle } from "lucide-react";

interface HomeBranch {
  id: string;
  name: { ar: string; en: string };
  area: { ar: string; en: string };
  address: { ar: string; en: string };
  phone: string;
  image: string | null;
}

interface Localized {
  ar: string;
  en: string;
}

interface HomeBodyProps {
  /** Home's introduction row, as WordPress publishes it on the homepage. */
  intro: { title: Localized; lead: Localized };
  /** The three services picked by the rule in docs/HOME-PRIORITY.md. */
  services: Treatment[];
  /** How many services exist in total — the link appears only past the three shown. */
  servicesTotal: number;
  /** Page 696's own title, used as this section's heading. */
  servicesTitle: Localized;
  offers: UIOffer[];
  articles: UIArticle[];
  branches: HomeBranch[];
}

const Section: React.FC<{
  id?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, children, className = "" }) => (
  <section id={id} className={`py-5 lg:py-12 ${className}`}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

/** Every card list on Home shows the first three; the rest live on their page. */
const HOME_CARDS = 3;

export const HomeBody: React.FC<HomeBodyProps> = ({
  intro,
  services,
  servicesTotal,
  servicesTitle,
  offers,
  articles,
  branches,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const hasIntro = !!(intro.title.ar || intro.title.en);

  return (
    <>
      {/* 01 + 02 — One band, the shape Home has always had: the WordPress
          introduction row and the three services page 696 leads with. The block the
          authored reasons list occupied is now the services cards (docs/HOME-PRIORITY.md),
          so Home keeps four bands and does not grow. */}
      {(hasIntro || !!services.length) && (
        <Section className="bg-[var(--bg-primary)]">
          <div className="mt-4 grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {hasIntro && (
              <div className="lg:col-span-4 min-w-0">
                <SectionHeading index="01" title={intro.title} lead={intro.lead} />
                <GoldLink href="/about" withArrow size="sm" className="mt-5">
                  {t("لماذا تختار شامه", "Why clients choose Shamah")}
                </GoldLink>
              </div>
            )}

            {!!services.length && (
              <div className={`${hasIntro ? "lg:col-span-8" : "lg:col-span-12"} min-w-0`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <SectionHeading
                    index="02"
                    title={servicesTitle}
                    lead={{
                      ar: "كل خدمة تبدأ بتقييم وخطة مكتوبة، والجلسات تُعرض بوضوح بدل الوعود.",
                      en: "Every service starts with an assessment and a written plan, with sessions laid out rather than promised.",
                    }}
                  />
                  {servicesTotal > services.length && (
                    <GoldLink href="/services" withArrow size="sm" className="mb-1">
                      {t("كل الخدمات", "All services")}
                    </GoldLink>
                  )}
                </div>
                {/* The replaced block used the site's own carousel, so the services row
                    keeps it: 3 cards from `lg` up, 2 on a tablet, 1 on a phone. */}
                <div className="mt-5 w-full min-w-0 overflow-hidden">
                  <Swiper
                    label={{
                      ar: "خدمات عيادات شامه",
                      en: "Shamah Clinics services",
                    }}
                    mobilePerView={1}
                    tabletPerView={2}
                    desktopPerView={3}
                    gap={16}
                    autoPlayMs={0}
                    showArrows
                    showDots
                    slides={services
                      .slice(0, HOME_CARDS)
                      .map((service, i) => (
                        <Reveal key={service.id} delay={i * 0.08} className="h-full min-w-0">
                          <TreatmentCard treatment={service} />
                        </Reveal>
                      ))}
                  />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 03 — Seasonal offers (live WordPress/WooCommerce, max 3) */}
      {!!offers.length && (
        <Section id="offers" className="bg-[var(--bg-secondary)]/60">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              index="03"
              title={{ ar: "باقات الموسم", en: "Seasonal packages" }}
              lead={{
                ar: "باقات تجمع أكثر من جلسة بتوفير حقيقي، سارية في الفروع الثلاثة.",
                en: "Packages combining several sessions at a real saving, valid across all three branches.",
              }}
            />
            {offers.length > HOME_CARDS && (
              <GoldLink href="/offers" withArrow className="mb-1">
                {t("كل العروض", "All offers")}
              </GoldLink>
            )}
          </div>
          <div className="mt-5 lg:mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {offers.slice(0, HOME_CARDS).map((o, i) => (
              <Reveal className="h-full min-w-0" key={o.id} delay={i * 0.08}>
                <OfferCard offer={o} />
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      {/* 04 — Compact branches strip (call / WhatsApp) */}
      {!!branches.length && (
        <Section id="branches" className="bg-[var(--bg-primary)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              index="04"
              title={{ ar: "فروعنا الثلاثة", en: "Our three branches" }}
              lead={{
                ar: "اختاري الفرع الأقرب واتصلي مباشرة أو راسلينا على واتساب.",
                en: "Pick the nearest branch, call directly, or message us on WhatsApp.",
              }}
            />
            {branches.length > HOME_CARDS && (
              <GoldLink href="/branches" withArrow className="mb-1">
                {t("تفاصيل الفروع", "Branch details")}
              </GoldLink>
            )}
          </div>

          <div className="mt-5 lg:mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
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
                      <h3 className="text-lg sm:text-xl font-black text-white leading-tight drop-shadow-md" dir="auto">
                        {t(b.name.ar, b.name.en)}
                      </h3>
                    </div>
                  </Link>

                  <div className="flex flex-col flex-1 p-4 sm:p-5">
                    <p className="text-xs text-[var(--text-muted)]" dir="auto">{t(b.area.ar, b.area.en)}</p>
                    <div className="mt-2 flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
                      <span dir="auto">{t(b.address.ar, b.address.en)}</span>
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
      )}

      {/* 05 — Latest journal (live WordPress, max 3) */}
      {!!articles.length && (
        <Section id="blogs" className="bg-[var(--bg-secondary)]/60">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              index="05"
              title={{ ar: "من مدونة شامه", en: "From the Shamah blog" }}
              lead={{
                ar: "مقالات طبية مبسطة تصحح المفاهيم الشائعة وتشرح روتين العناية.",
                en: "Clear medical articles correcting common myths and explaining care routines.",
              }}
            />
            {articles.length > HOME_CARDS && (
              <GoldLink href="/blogs" withArrow className="mb-1">
                {t("كل المدونات", "All blogs")}
              </GoldLink>
            )}
          </div>
          <div className="mt-5 lg:mt-8 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
            {articles.slice(0, HOME_CARDS).map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </Section>
      )}

    </>
  );
};
