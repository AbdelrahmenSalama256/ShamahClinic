"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { Photo } from "@/components/ui/Photo";
import { Swiper } from "@/components/ui/Swiper";
import { GoldLink, useWhatsappHref } from "@/components/shared/Actions";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import {
  ResultCompareSection,
  type HomeCompareCase,
} from "./ResultCompareSection";
import { ProofsSection } from "@/components/proofs/ProofsSection";
import type { Testimonial } from "@/lib/content/site";
import {
  HOME_LAYOUT_DEFAULTS,
  type HomeBand,
  type HomeBandState,
} from "@/lib/content/home-layout-shape";
import { getLocalizedHref } from "@/lib/locale";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import type { Offer as UIOffer } from "@/data/offers";
import type { Article as UIArticle } from "@/data/journal";
import type { Treatment } from "@/data/treatments";
import { MapPin, Phone } from "lucide-react";

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
  /** The published reasons edited in the About page of the console. */
  whyChooseUs: { title: Localized; lead: Localized; reasons: Localized[] };
  /** The three services picked by the rule in docs/HOME-PRIORITY.md. */
  services: Treatment[];
  /** How many services exist in total — the link appears only past the three shown. */
  servicesTotal: number;
  /** Page 696's own title, used as this section's heading. */
  servicesTitle: Localized;
  /** The cases the owner asked to compare on Home, already narrowed to those with both pictures. */
  cases: HomeCompareCase[];
  /** Published patient testimonials (WhatsApp chats and videos); empty hides the proofs band. */
  testimonials?: Testimonial[];
  offers: UIOffer[];
  articles: UIArticle[];
  branches: HomeBranch[];
  /** The band order and visibility Settings saved; the shipped order when absent. */
  layout?: HomeBandState[];
}

/**
 * One vertical step for every Home band. `py-4` on a phone is what keeps Home's
 * 390 px document no taller than the version this section replaced (docs/
 * HOME-PRIORITY.md §4); `lg:py-12` is the desktop rhythm and does not move.
 */
const Section: React.FC<{
  id?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, children, className = "" }) => (
  <section id={id} className={`py-4 lg:py-12 ${className}`}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

/** Every card list on Home shows the first three; the rest live on their page. */
const HOME_CARDS = 3;

export const HomeBody: React.FC<HomeBodyProps> = ({
  intro,
  whyChooseUs,
  services,
  servicesTotal,
  servicesTitle,
  cases,
  testimonials = [],
  offers,
  articles,
  branches,
  layout = HOME_LAYOUT_DEFAULTS,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const shown = (band: HomeBand) =>
    layout.find((entry) => entry.key === band)?.visible !== false;
  const waHref = useWhatsappHref();
  const hasIntro = !!(intro.title.ar || intro.title.en);
  const hasWhyChooseUs = !!(
    whyChooseUs.title.ar ||
    whyChooseUs.title.en ||
    whyChooseUs.lead.ar ||
    whyChooseUs.lead.en ||
    whyChooseUs.reasons.length
  );
  const introShown = shown("intro");
  const hasIntroPanel = introShown && (hasIntro || hasWhyChooseUs);
  const hasServices = introShown && !!services.length;
  const hasProofs = shown("proofs") && testimonials.length > 0;
  const hasCases = shown("compare") && cases.length > 0;
  const hasOffers = shown("offers") && offers.length > 0;
  const hasBranches = shown("branches") && branches.length > 0;
  const hasArticles = shown("articles") && articles.length > 0;
  const hasHomeContent =
    hasIntroPanel ||
    hasServices ||
    hasProofs ||
    hasCases ||
    hasOffers ||
    hasBranches ||
    hasArticles;
  // The numerals count the bands that actually paint. They used to be written into the page,
  // so a Home with no introduction opened at "02" — and a comparison band, which is there or
  // not there on its own data, would have moved every number after it. This list is the paint
  // order; a band's number is its place in it.
  // Settings decides the order of the bands; the intro band carries two numerals of its own.
  const painting: Record<HomeBand, (string | false)[]> = {
    intro: [hasIntroPanel && hasIntro && "intro", hasServices && "services"],
    proofs: [hasProofs && "proofs"],
    compare: [hasCases && "compare"],
    offers: [hasOffers && "offers"],
    branches: [hasBranches && "branches"],
    articles: [hasArticles && "articles"],
  };
  const paintedBands = layout
    .flatMap((entry) => painting[entry.key])
    .filter(Boolean);
  const numeralOf = (band: string): string =>
    String(paintedBands.indexOf(band) + 1).padStart(2, "0");

  // Every band as a node, so the order Settings saved is the order they paint in.
  const bandNodes: Record<HomeBand, React.ReactNode> = {
    intro: (hasIntroPanel || hasServices) && (
      <Section className="bg-[var(--bg-primary)]">
        <div className="mt-4 grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {hasIntroPanel && (
            <div className="lg:col-span-4 min-w-0">
              <SectionHeading
                index={hasIntro ? numeralOf("intro") : undefined}
                title={hasWhyChooseUs ? whyChooseUs.title : intro.title}
                lead={hasWhyChooseUs ? whyChooseUs.lead : intro.lead}
              />
              {hasWhyChooseUs && whyChooseUs.reasons.length > 0 && (
                <ol className="mt-5 space-y-3">
                  {whyChooseUs.reasons.map((reason, index) => (
                    <Reveal
                      as="li"
                      key={index}
                      delay={index * 0.06}
                      className="flex items-start gap-3"
                    >
                      <span className="shrink-0 text-sm font-bold text-[var(--gold-end)] num">
                        {formatNumber(index + 1)}
                      </span>
                      <span
                        className="text-sm leading-relaxed text-[var(--text-secondary)]"
                        dir="auto"
                      >
                        {t(reason.ar, reason.en)}
                      </span>
                    </Reveal>
                  ))}
                </ol>
              )}
              <GoldLink href="/about" withArrow size="sm" className="mt-5">
                {t("لماذا تختار شامه", "Why clients choose Shamah")}
              </GoldLink>
            </div>
          )}

          {hasServices && (
            <div
              className={`${hasIntroPanel ? "lg:col-span-8" : "lg:col-span-12"} min-w-0`}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionHeading
                  index={numeralOf("services")}
                  title={servicesTitle}
                  lead={{
                    ar: "كل خدمة تبدأ بتقييم وخطة مكتوبة، والجلسات تُعرض بوضوح بدل الوعود.",
                    en: "Every service starts with an assessment and a written plan, with sessions laid out rather than promised.",
                  }}
                />
                {servicesTotal > services.length && (
                  <GoldLink
                    href="/services"
                    withArrow
                    size="sm"
                    className="mb-1"
                  >
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
                  slides={services.slice(0, HOME_CARDS).map((service, i) => (
                    <Reveal
                      key={service.id}
                      delay={i * 0.08}
                      className="h-full min-w-0"
                    >
                      <TreatmentCard treatment={service} />
                    </Reveal>
                  ))}
                />
              </div>
            </div>
          )}
        </div>
      </Section>
    ),
    proofs: hasProofs && (
      <ProofsSection testimonials={testimonials} index={numeralOf("proofs")} />
    ),
    compare: hasCases && (
      <ResultCompareSection cases={cases} index={numeralOf("compare")} />
    ),
    offers: hasOffers && (
      <Section id="offers" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index={numeralOf("offers")}
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
    ),
    branches: hasBranches && (
      <Section id="branches" className="bg-[var(--bg-primary)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index={numeralOf("branches")}
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
              <div className="group h-full flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border-control)] hover:border-[var(--border-control)] shadow-sm hover:shadow-lg transition-[box-shadow,border-color] duration-fade ease-brand">
                <Link
                  href={getLocalizedHref(`/branches/${b.id}`, language)}
                  className="relative block overflow-hidden aspect-[16/10]"
                >
                  {b.image && (
                    <Photo
                      slot={toPhotoSlot(b.image, b.name)}
                      ratio="landscape"
                      className="!aspect-auto !h-full w-full"
                      imgClassName="group-hover:scale-105 transition-transform duration-reveal ease-brand"
                      sizes="(max-width:768px) 100vw, (max-width:1024px) 50vw, 33vw"
                    />
                  )}
                  {/* Dark gradient for legibility */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                  />
                  <span className="absolute top-3 start-3 text-[10px] font-bold tracking-eyebrow uppercase text-[var(--text-on-dark)] bg-black/40 backdrop-blur-sm border border-[var(--border-on-dark)] rounded-full px-2.5 py-1">
                    {t("فرع", "Branch")} {formatNumber(i + 1)}
                  </span>
                  <div className="absolute bottom-0 start-0 end-0 p-4">
                    <h3
                      className="text-lg sm:text-xl font-black text-[var(--text-on-dark)] leading-tight drop-shadow-md"
                      dir="auto"
                    >
                      {t(b.name.ar, b.name.en)}
                    </h3>
                  </div>
                </Link>

                <div className="flex flex-col flex-1 p-4 sm:p-5">
                  <p className="text-xs text-[var(--text-muted)]" dir="auto">
                    {t(b.area.ar, b.area.en)}
                  </p>
                  <div className="mt-2 flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-gold)]" />
                    <span dir="auto">{t(b.address.ar, b.address.en)}</span>
                  </div>

                  <div className="mt-auto pt-4 flex items-center gap-2">
                    <a
                      href={`tel:${b.phone}`}
                      dir="ltr"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-gold-gradient text-xs font-bold px-3 py-2.5 hover:-translate-y-0.5 hover:shadow transition-[transform,box-shadow] duration-hover ease-brand"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {b.phone}
                    </a>
                    <a
                      href={waHref(
                        language,
                        language === "ar"
                          ? `مرحباً عيادات شامه، أرغب في الحجز في فرع ${b.name.ar}.`
                          : `Hello Shamah Clinics, I would like to book at the ${b.name.en} branch.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--border-success)] text-[var(--text-success)] text-xs font-bold px-3 py-2.5 hover:bg-[var(--bg-success-soft)] transition-[background-color] duration-hover"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      {t("واتساب", "WhatsApp")}
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
    ),
    articles: hasArticles && (
      <Section id="blogs" className="bg-[var(--bg-secondary)]/60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            index={numeralOf("articles")}
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
    ),
  };

  return (
    <>
      {!hasHomeContent && (
        <Section>
          <EmptyState
            title={t(
              "لا يوجد محتوى متاح الآن",
              "There’s nothing to show just yet",
            )}
            description={t(
              "تواصلي معنا وسيسعد فريقنا بمساعدتكِ في معرفة خدمات العيادة.",
              "Contact us and our team will be happy to help you learn about our services.",
            )}
          />
        </Section>
      )}
      {layout.map((entry) => (
        <React.Fragment key={entry.key}>{bandNodes[entry.key]}</React.Fragment>
      ))}
    </>
  );
};
