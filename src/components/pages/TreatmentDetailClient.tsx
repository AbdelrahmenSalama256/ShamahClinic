"use client";

/**
 * A service page, drawn from the document its author typed.
 *
 * Same contract as before, new look:
 *  - the author's order is the page's order (`page.sections` is already filtered and sorted);
 *  - a heading never stands over a gap (every block is conditional);
 *  - the words come from the console (labels via `fieldLabelOf`);
 *  - nothing is invented.
 *
 * Responsive rules this file keeps (these fixed the sideways scrolling):
 *  - every grid declares `grid-cols-1` first, so one wide child can't widen the column;
 *  - every flex/grid child that holds text or media has `min-w-0`;
 *  - the root clips horizontal overflow with `overflow-x-clip` (keeps `sticky` working);
 *  - photos are sized by aspect-ratio only (no min-height), prose media is capped at 100%;
 *  - breadcrumbs wrap and the last crumb truncates instead of pushing the page wide.
 */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { DoctorCard } from "@/components/cards/DoctorCard";
import { BranchCard } from "@/components/cards/BranchCard";
import {
  ResultCaseCard,
  type ResultCaseData,
} from "@/components/cards/ResultCaseCard";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import {
  BookButton,
  CallButton,
  WhatsAppButton,
} from "@/components/shared/Actions";
import { useClinic } from "@/context/ClinicContext";
import { getLocalizedHref } from "@/lib/locale";
import { fieldLabelOf } from "@/lib/content/list-schema";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import type { Bi, ServiceSectionKey } from "@/lib/content/list-schema";
import type { ServiceCta, ServiceFacts } from "@/lib/content/service-doc";
import type { ServicePage } from "@/lib/content/service-page";
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Check,
  Clock,
  Cpu,
  Droplet,
  Heart,
  Hourglass,
  Moon,
  Repeat,
  Shield,
  Sun,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const H2 =
  "break-words text-2xl font-black leading-snug text-[var(--text-primary)] sm:text-3xl";
const H3 =
  "break-words text-base font-black text-[var(--text-primary)] sm:text-lg";

/** Console markup, with every kind of embedded media capped to the column. */
const PROSE =
  "min-w-0 max-w-full break-words text-base leading-[1.85] text-[var(--text-secondary)] " +
  "[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_iframe]:max-w-full [&_video]:max-w-full " +
  "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto " +
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-[var(--text-primary)] " +
  "[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[var(--text-primary)] " +
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 " +
  "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:space-y-1.5 [&_li]:text-[var(--text-secondary)] " +
  "[&_a]:text-[var(--gold-end)] [&_a]:underline [&_strong]:text-[var(--text-primary)]";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2";

const FACT_FIELDS: { stem: keyof ServiceFacts; icon: typeof Clock }[] = [
  { stem: "duration", icon: Clock },
  { stem: "sessions", icon: Repeat },
  { stem: "frequency", icon: CalendarDays },
  { stem: "timeline", icon: Hourglass },
  { stem: "downtime", icon: Moon },
  { stem: "anesthesia", icon: Shield },
  { stem: "technology", icon: Cpu },
];

const BENEFIT_ICONS: Record<string, typeof Check> = {
  "badge-check": BadgeCheck,
  sparkles: BadgeCheck,
  shield: Shield,
  droplet: Droplet,
  sun: Sun,
  heart: Heart,
  clock: Clock,
};

type Crumb = { href: string; label: Bi };
type FactChip = {
  key: string;
  label: string;
  value: string;
  icon: typeof Clock;
};

/* ------------------------------------------------------------------ */
/* Breadcrumbs — local, wraps, last crumb truncates                    */
/* ------------------------------------------------------------------ */

const Crumbs: React.FC<{
  items: Crumb[];
  language: "ar" | "en";
}> = ({ items, language }) => (
  <nav
    aria-label={language === "ar" ? "مسار الصفحة" : "Breadcrumb"}
    className="mb-6 min-w-0 max-w-full"
  >
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[var(--text-muted)]">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const text = language === "ar" ? item.label.ar : item.label.en;
        return (
          <li
            key={item.href}
            className="flex min-w-0 max-w-full items-center gap-1.5"
          >
            {last ? (
              <span
                aria-current="page"
                dir="auto"
                className="block min-w-0 max-w-[62vw] truncate font-bold text-[var(--text-primary)] sm:max-w-md"
              >
                {text}
              </span>
            ) : (
              <>
                <Link
                  href={getLocalizedHref(item.href, language)}
                  className={`shrink-0 rounded-md py-1 hover:text-[var(--gold-end)] ${FOCUS}`}
                >
                  {text}
                </Link>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 opacity-60 rtl:rotate-180"
                  aria-hidden
                />
              </>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

/* ------------------------------------------------------------------ */
/* Hero — text left, photo set in a notched frame with an offset plate */
/* ------------------------------------------------------------------ */

const ServiceHero: React.FC<{
  title: string;
  lead: string;
  photo?: React.ComponentProps<typeof Photo>["slot"];
  priceChip: React.ReactNode;
  crumbs: Crumb[];
  language: "ar" | "en";
  actions: React.ReactNode;
}> = ({ title, lead, photo, priceChip, crumbs, language, actions }) => {
  const src = photo?.src ?? "";
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const probe = new window.Image();
    probe.onerror = () => {
      if (!cancelled) setBrokenSrc(src);
    };
    probe.src = src;
    return () => {
      cancelled = true;
      probe.onerror = null;
    };
  }, [src]);

  const showImage = Boolean(photo) && src !== "" && brokenSrc !== src;

  return (
    <header className="bg-[var(--bg-secondary)]">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-24 lg:pt-8">
        <Crumbs items={crumbs} language={language} />

        <div
          className={
            showImage
              ? "grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14"
              : "grid grid-cols-1 gap-10"
          }
        >
          <div
            className={`min-w-0 ${showImage ? "lg:col-span-7" : "max-w-3xl"}`}
          >
            <h1
              dir="auto"
              className="break-words text-[2rem] font-black leading-[1.2] text-[var(--text-primary)] sm:text-5xl lg:text-6xl lg:leading-[1.15]"
            >
              {title}
            </h1>
            {lead ? (
              <p
                dir="auto"
                className="mt-5 max-w-xl break-words text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg"
              >
                {lead}
              </p>
            ) : null}
            {priceChip ? (
              <p className="mt-6 inline-flex min-h-[44px] max-w-full items-center rounded-full bg-[var(--bg-card)] px-5 text-sm font-black text-[var(--gold-end)] ring-1 ring-[var(--gold-border)]">
                {priceChip}
              </p>
            ) : null}
            <div className="mt-8 min-w-0">{actions}</div>
          </div>

          {photo && showImage ? (
            <div className="order-first min-w-0 lg:order-none lg:col-span-5">
              {/* offset plate sits behind the photo, inside the box, so it can never overflow */}
              <div className="relative pb-3 pe-3">
                <div
                  aria-hidden
                  className="absolute inset-0 start-3 top-3 rounded-[2rem] rounded-ss-[5rem] bg-gradient-to-br from-[var(--text-gold)] to-[var(--gold-end)] opacity-25"
                />
                <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-[2rem] rounded-ss-[5rem] bg-[var(--bg-card)] sm:aspect-[16/11] lg:aspect-[4/5]">
                  <Photo
                    slot={photo}
                    ratio="landscape"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:max-w-full [&_img]:object-cover"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

/* ------------------------------------------------------------------ */
/* Facts — one raised panel overlapping the hero, ruled on the start   */
/* ------------------------------------------------------------------ */

const ServiceFactsStrip: React.FC<{ label: string; facts: FactChip[] }> = ({
  label,
  facts,
}) =>
  facts.length ? (
    <section
      aria-label={label}
      className="relative z-10 mx-auto -mt-10 w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <ul className="grid grid-cols-1 gap-x-8 gap-y-5 rounded-[1.75rem] rounded-se-[3rem] bg-[var(--bg-card)] p-6 shadow-xl shadow-black/[0.06] ring-1 ring-[var(--border-control)] min-[420px]:grid-cols-2 lg:grid-cols-4 lg:p-8">
        {facts.map((fact) => (
          <li
            key={fact.key}
            className="flex min-w-0 items-start gap-3 border-s-[3px] border-[var(--text-gold)] ps-3.5"
          >
            <fact.icon
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gold-end)]"
              aria-hidden
            />
            <div className="min-w-0">
              {fact.label ? (
                <p
                  dir="auto"
                  className="break-words text-xs text-[var(--text-muted)]"
                >
                  {fact.label}
                </p>
              ) : null}
              <p
                dir="auto"
                className="mt-0.5 break-words text-sm font-black leading-snug text-[var(--text-primary)] sm:text-base"
              >
                {fact.value}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

/* ------------------------------------------------------------------ */
/* Sub-nav — active tab is solid ink, others are plain text            */
/* ------------------------------------------------------------------ */

const ServiceSubNav: React.FC<{
  items: { key: ServiceSectionKey; label: string }[];
  ariaLabel: string;
}> = ({ items, ariaLabel }) => {
  const [active, setActive] = useState<string>(items[0]?.key ?? "");
  const signature = items.map((item) => item.key).join("|");
  const activeKey = items.some((item) => item.key === active)
    ? active
    : (items[0]?.key ?? "");

  useEffect(() => {
    const ids = signature ? signature.split("|") : [];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (!elements.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const topmost = ids.find((id) => visible.has(id));
        if (topmost) setActive(topmost);
      },
      { rootMargin: "-160px 0px -55% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [signature]);

  if (items.length < 2) return null;

  const go = (event: React.MouseEvent<HTMLAnchorElement>, key: string) => {
    const target = document.getElementById(key);
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
  };

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-[64px] z-30 mt-10 bg-[var(--bg-card)]/90 backdrop-blur-md"
    >
      <div className="mx-auto w-full max-w-7xl min-w-0 px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const isActive = item.key === activeKey;
            return (
              <a
                key={item.key}
                href={`#${item.key}`}
                onClick={(event) => go(event, item.key)}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors duration-300 ${FOCUS} ${
                  isActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-card)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--gold-end)]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

/* ------------------------------------------------------------------ */
/* CTA buttons                                                         */
/* ------------------------------------------------------------------ */

const ServiceCtaButtons: React.FC<{
  offered: ServiceCta[];
  treatmentId: string;
  whatsappMessage: string;
  phone: string;
  layout?: "stack" | "row" | "inline";
}> = ({ offered, treatmentId, whatsappMessage, phone, layout = "stack" }) => {
  if (!offered.length) return null;
  const wrap =
    layout === "row"
      ? "flex flex-row items-stretch gap-2 [&>*]:min-w-0 [&>*]:flex-1"
      : layout === "inline"
        ? "flex flex-col gap-3 sm:flex-row"
        : "flex flex-col gap-3";
  const btn =
    layout === "inline" ? "w-full sm:w-auto sm:min-w-[11rem]" : "w-full";

  return (
    <div className={wrap}>
      {offered.map((cta) =>
        cta === "booking" ? (
          <BookButton
            key={cta}
            treatmentId={treatmentId}
            size="lg"
            className={btn}
          />
        ) : cta === "whatsapp" ? (
          <WhatsAppButton
            key={cta}
            size="lg"
            variant="outline"
            className={btn}
            custom={whatsappMessage}
          />
        ) : (
          <CallButton key={cta} phone={phone} size="lg" className={btn} />
        ),
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const TreatmentDetailClient: React.FC<{ page: ServicePage }> = ({
  page,
}) => {
  const { t, language, formatNumber } = useLanguage();
  const clinic = useClinic();
  const content = page.content;

  const has = (value: Bi) => value.ar !== "" || value.en !== "";
  const labelOf = (stem: string, fallback: Bi): Bi =>
    fieldLabelOf("services", stem) ?? fallback;
  const words = (value: Bi) => (language === "ar" ? value.ar : value.en);

  const heroTitle = has(content.hero.headline)
    ? content.hero.headline
    : content.name;
  const heroLead = has(content.hero.subheadline)
    ? content.hero.subheadline
    : content.intro;
  const heroPhoto = page.hero.src ? page.hero : undefined;

  const facts = FACT_FIELDS.map((field) => ({
    ...field,
    value: content.facts[field.stem],
  })).filter((fact) => has(fact.value));
  const ideal = has(content.ideal) ? content.ideal : null;
  const benefits = content.benefits.filter((benefit) => has(benefit.text));
  const notFor = content.notFor[language].filter((line) => line !== "");
  const steps = content.steps.filter((step) => has(step.text));
  const prep = content.prep[language];
  const aftercare = content.aftercare[language];
  const contraindications = content.contraindications[language];
  const sideEffects = content.sideEffects[language];
  const pricing = content.pricing;
  const currency = pricing.currency || t("ج.م", "EGP");
  const priceOnRequest = pricing.onRequest
    ? words(
        labelOf("priceOnRequest", {
          ar: "السعر عند الطلب",
          en: "Price on request",
        }),
      )
    : "";
  const hasPrice =
    pricing.onRequest || pricing.price !== null || pricing.priceMax !== null;

  const money = (n: number) => (
    <>
      {formatNumber(n)}
      <span className="ms-1 font-bold text-[var(--text-secondary)]">
        {currency}
      </span>
    </>
  );
  const priceChip: React.ReactNode = pricing.onRequest
    ? priceOnRequest
    : pricing.price !== null
      ? money(pricing.price)
      : pricing.priceMax !== null
        ? money(pricing.priceMax)
        : null;

  const [shown, setShown] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [heroPassed, setHeroPassed] = useState(false);
  const heroEndRef = useRef<HTMLDivElement | null>(null);
  const gallery = page.gallery;
  const active = gallery.length ? Math.min(shown, gallery.length - 1) : 0;

  useEffect(() => {
    const sentinel = heroEndRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setHeroPassed(
            !entry.isIntersecting && entry.boundingClientRect.top < 0,
          );
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const cases: ResultCaseData[] = page.cases.map((item) => ({
    key: item.key,
    headline: item.headline,
    pair: item.pair,
    area: item.area,
    sessions: item.sessions,
    caption: item.caption,
    note: item.note,
    service: null,
    article: item.article,
  }));

  const whatsappMessage =
    language === "ar"
      ? `مرحباً عيادات شامه، أرغب في الاستفسار عن جلسة ${content.name.ar}.`
      : `Hello Shamah Clinics, I would like to ask about ${content.name.en}.`;

  const chosen: ServiceCta[] = [
    content.hero.ctaPrimary,
    content.hero.ctaSecondary,
  ].filter((cta, index, all) => cta !== "none" && all.indexOf(cta) === index);
  const offered = chosen.filter((cta) => cta !== "call" || clinic.phone !== "");
  const showsWhatsapp = offered.includes("whatsapp");

  const howSection = page.sections.find((entry) => entry.key === "how");
  const factChips: FactChip[] = howSection
    ? facts.map((fact) => ({
        key: fact.stem,
        label: words(labelOf(fact.stem, howSection.label)),
        value: words(fact.value),
        icon: fact.icon,
      }))
    : [];

  const canRender = (key: ServiceSectionKey): boolean => {
    switch (key) {
      case "overview":
        return (
          has(content.description) ||
          has(content.body) ||
          ideal !== null ||
          benefits.length > 0 ||
          notFor.length > 0
        );
      case "how":
        return steps.length > 0;
      case "prep":
        return prep.length > 0 || aftercare.length > 0;
      case "safety":
        return contraindications.length > 0 || sideEffects.length > 0;
      case "pricing":
        return hasPrice || has(pricing.note) || page.offers.length > 0;
      case "proof":
        return (!videoFailed && page.video !== null) || cases.length > 0;
      case "gallery":
        return gallery.length > 0;
      case "people":
        return page.specialists.length > 0 || page.branches.length > 0;
      case "faq":
        return page.questions.length > 0;
      case "related":
        return (
          page.relatedServices.length > 0 || page.relatedArticles.length > 0
        );
    }
  };
  const renderableSections = page.sections.filter((entry) =>
    canRender(entry.key),
  );
  const inlineSections = renderableSections.filter(
    (entry) => entry.key !== "related",
  );
  const showsRelated = renderableSections.some(
    (entry) => entry.key === "related",
  );
  const navItems = renderableSections.map((entry) => ({
    key: entry.key,
    label: words(entry.label),
  }));
  const hasAside = offered.length > 0;

  const relatedTitle =
    page.relatedServices.length && page.relatedArticles.length
      ? labelOf("relatedServices", {
          ar: "خدمات ذات صلة",
          en: "Related services",
        })
      : page.relatedArticles.length
        ? labelOf("relatedArticles", {
            ar: "مقالات ذات صلة",
            en: "Related articles",
          })
        : labelOf("relatedServices", {
            ar: "خدمات ذات صلة",
            en: "Related services",
          });

  const section = (
    key: ServiceSectionKey,
    title: React.ReactNode,
    children: React.ReactNode,
  ) => (
    <section
      key={key}
      id={key}
      className="min-w-0 scroll-mt-32 lg:scroll-mt-36"
    >
      <h2 dir="auto" className={`${H2} mb-6`}>
        {title}
      </h2>
      {children}
    </section>
  );

  /** A point list: a small gold bead per line instead of a rule. */
  const pointList = (items: string[]) => (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          dir="auto"
          className="flex min-w-0 gap-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
        >
          <span
            aria-hidden
            className="mt-[0.6em] h-2 w-2 shrink-0 rounded-full bg-[var(--gold-end)]"
          />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );

  const renderSection = (entry: { key: ServiceSectionKey; label: Bi }) => {
    const sectionLabel = entry.label;
    switch (entry.key) {
      case "overview":
        return section(
          "overview",
          t("عن هذه الجلسة", "About this treatment"),
          <>
            {has(content.description) ? (
              <div
                className={PROSE}
                dir="auto"
                dangerouslySetInnerHTML={{ __html: words(content.description) }}
              />
            ) : null}
            {has(content.body) ? (
              <div className="mt-8 min-w-0">
                <h3 className={`${H3} mb-3`}>
                  {words(labelOf("body", sectionLabel))}
                </h3>
                <div
                  className={PROSE}
                  dir="auto"
                  dangerouslySetInnerHTML={{ __html: words(content.body) }}
                />
              </div>
            ) : null}
            {ideal ? (
              <div className="mt-8 min-w-0 rounded-[1.5rem] rounded-ss-[3rem] bg-[var(--bg-secondary)] px-6 py-5 sm:px-8">
                <p
                  dir="auto"
                  className="mb-1.5 text-sm font-black text-[var(--gold-end)]"
                >
                  {words(labelOf("ideal", sectionLabel))}
                </p>
                <p
                  dir="auto"
                  className="break-words text-base leading-relaxed text-[var(--text-primary)]"
                >
                  {words(ideal)}
                </p>
              </div>
            ) : null}
            {benefits.length ? (
              <div className="mt-10 min-w-0">
                <h3 className={`${H3} mb-5`}>
                  {words(labelOf("benefits", sectionLabel))}
                </h3>
                <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {benefits.map((benefit, index) => {
                    const Icon =
                      (benefit.icon && BENEFIT_ICONS[benefit.icon]) || Check;
                    return (
                      <li
                        key={`${index}-${benefit.text.ar}-${benefit.text.en}`}
                        className="flex min-w-0 items-start gap-3.5"
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--text-gold)] to-[var(--gold-end)] text-white">
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span
                          dir="auto"
                          className="min-w-0 break-words pt-1 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
                        >
                          {has(benefit.title) ? (
                            <strong className="block font-black text-[var(--text-primary)]">
                              {words(benefit.title)}
                            </strong>
                          ) : null}
                          {words(benefit.text)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {notFor.length ? (
              <div className="mt-10 min-w-0">
                <h3 className={`${H3} mb-4`}>
                  {words(labelOf("notFor", sectionLabel))}
                </h3>
                {pointList(notFor)}
              </div>
            ) : null}
          </>,
        );

      case "how":
        return section(
          "how",
          words(sectionLabel),
          <ol className="min-w-0">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              return (
                <li
                  key={`${index}-${words(step.text)}`}
                  className="flex min-w-0 gap-4 sm:gap-5"
                >
                  <div className="flex shrink-0 flex-col items-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl rounded-ss-md bg-[var(--text-primary)] text-base font-black text-[var(--bg-card)]">
                      {formatNumber(index + 1)}
                    </span>
                    {!isLast ? (
                      <span className="my-2 w-0.5 flex-1 rounded-full bg-[var(--gold-border)]" />
                    ) : null}
                  </div>
                  <div
                    className={`min-w-0 flex-1 pt-1.5 ${isLast ? "" : "pb-8"}`}
                  >
                    {has(step.title) ? (
                      <p
                        dir="auto"
                        className="break-words text-base font-black text-[var(--text-primary)] sm:text-lg"
                      >
                        {words(step.title)}
                      </p>
                    ) : null}
                    <p
                      dir="auto"
                      className="mt-1 break-words text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
                    >
                      {words(step.text)}
                    </p>
                    {step.image ? (
                      <div className="mt-4 w-full max-w-sm overflow-hidden rounded-2xl">
                        <Photo
                          slot={toPhotoSlot(
                            step.image,
                            has(step.title) ? step.title : step.text,
                          )}
                          ratio="landscape"
                          sizes="(max-width: 640px) 90vw, 24rem"
                          className="w-full [&_img]:h-auto [&_img]:max-w-full"
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>,
        );

      case "prep":
        return section(
          "prep",
          words(sectionLabel),
          <div
            className={`grid grid-cols-1 gap-5 ${
              prep.length && aftercare.length ? "md:grid-cols-2" : ""
            }`}
          >
            {prep.length ? (
              <div className="min-w-0 rounded-[1.5rem] rounded-se-[3rem] bg-[var(--bg-secondary)] p-6">
                <h3 className={`${H3} mb-4`}>
                  {words(labelOf("prep", sectionLabel))}
                </h3>
                {pointList(prep)}
              </div>
            ) : null}
            {aftercare.length ? (
              <div className="min-w-0 rounded-[1.5rem] rounded-ss-[3rem] p-6 ring-1 ring-[var(--gold-border)]">
                <h3 className={`${H3} mb-4`}>
                  {words(labelOf("aftercare", sectionLabel))}
                </h3>
                {pointList(aftercare)}
              </div>
            ) : null}
          </div>,
        );

      case "safety":
        return section(
          "safety",
          words(sectionLabel),
          <div className="min-w-0 space-y-6 rounded-2xl border-s-4 border-[var(--gold-end)] bg-[var(--bg-secondary)] p-6">
            {contraindications.length ? (
              <div className="min-w-0">
                <h3 dir="auto" className={`${H3} mb-3`}>
                  {words(labelOf("contraindications", sectionLabel))}
                </h3>
                {pointList(contraindications)}
              </div>
            ) : null}
            {sideEffects.length ? (
              <div className="min-w-0">
                <h3 dir="auto" className={`${H3} mb-3`}>
                  {words(labelOf("sideEffects", sectionLabel))}
                </h3>
                {pointList(sideEffects)}
              </div>
            ) : null}
          </div>,
        );

      case "pricing":
        return section(
          "pricing",
          words(sectionLabel),
          <>
            {hasPrice ? (
              <div className="min-w-0 rounded-[1.75rem] rounded-ss-[3.5rem] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-card)] px-6 py-6 ring-1 ring-[var(--gold-border)] sm:px-8">
                {pricing.onRequest ? (
                  <p
                    dir="auto"
                    className="text-lg font-black text-[var(--text-primary)]"
                  >
                    {words(labelOf("priceOnRequest", sectionLabel))}
                  </p>
                ) : pricing.price !== null ? (
                  <>
                    <p dir="auto" className="text-sm text-[var(--text-muted)]">
                      {words(labelOf("price", sectionLabel))}
                    </p>
                    <p
                      dir="ltr"
                      className="mt-1 break-words text-4xl font-black tracking-tight text-[var(--gold-end)] sm:text-5xl"
                    >
                      {formatNumber(pricing.price)}
                      <span className="ms-2 text-base font-bold text-[var(--text-secondary)]">
                        {currency}
                      </span>
                    </p>
                    {pricing.priceMax !== null ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        <span dir="auto">
                          {words(labelOf("priceMax", sectionLabel))}:{" "}
                        </span>
                        <span dir="ltr" className="font-bold">
                          {formatNumber(pricing.priceMax)} {currency}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : pricing.priceMax !== null ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span dir="auto">
                      {words(labelOf("priceMax", sectionLabel))}:{" "}
                    </span>
                    <span dir="ltr" className="font-bold">
                      {formatNumber(pricing.priceMax)} {currency}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {has(pricing.note) ? (
              <p
                dir="auto"
                className="mt-4 break-words text-sm leading-relaxed text-[var(--text-muted)]"
              >
                {words(pricing.note)}
              </p>
            ) : null}
            {page.offers.length ? (
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {page.offers.map((offer) => (
                  <div
                    key={offer.slug}
                    className="h-full min-w-0 [&_img]:max-w-full [&_img]:bg-[var(--bg-secondary)] [&_img]:object-contain"
                  >
                    <OfferCard offer={offer} />
                  </div>
                ))}
              </div>
            ) : null}
          </>,
        );

      case "proof":
        return section(
          "proof",
          words(sectionLabel),
          <>
            {page.video && !videoFailed ? (
              <video
                src={page.video.url}
                poster={page.video.poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
                className="aspect-video w-full max-w-full rounded-[1.5rem] rounded-se-[3rem] bg-[var(--bg-dark)]"
              />
            ) : null}
            {cases.length ? (
              <div
                className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${
                  page.video && !videoFailed ? "mt-8" : ""
                }`}
              >
                {cases.map((story, index) => (
                  <div key={story.key} className="h-full min-w-0">
                    <ResultCaseCard
                      story={story}
                      gallery={cases}
                      priority={index < 2}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>,
        );

      case "gallery": {
        const item = gallery[active];
        if (!item) return null;
        const caption = has(item.caption) ? words(item.caption) : "";
        return section(
          "gallery",
          words(sectionLabel),
          <div className="min-w-0">
            <div className="overflow-hidden rounded-[1.75rem] rounded-ss-[3.5rem] bg-[var(--bg-secondary)]">
              <Photo
                slot={item.slot}
                ratio="landscape"
                sizes="(max-width:1024px) 100vw, 50vw"
                className="w-full [&_img]:h-auto [&_img]:max-w-full"
              />
            </div>
            {caption ? (
              <p
                dir="auto"
                className="mt-3 break-words text-sm leading-relaxed text-[var(--text-muted)]"
              >
                {caption}
              </p>
            ) : null}
            {gallery.length > 1 ? (
              <div className="mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                {gallery.map((thumb, index) => (
                  <button
                    key={`${thumb.slot.src}-${index}`}
                    type="button"
                    onClick={() => setShown(index)}
                    aria-label={
                      language === "ar" ? thumb.slot.alt.ar : thumb.slot.alt.en
                    }
                    aria-current={index === active || undefined}
                    className={`min-w-0 cursor-pointer overflow-hidden rounded-xl ring-2 transition-[box-shadow,opacity] duration-300 ${FOCUS} ${
                      index === active
                        ? "ring-[var(--gold-end)]"
                        : "opacity-60 ring-transparent hover:opacity-100"
                    }`}
                  >
                    <Photo
                      slot={thumb.slot}
                      ratio="square"
                      sizes="120px"
                      className="w-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>,
        );
      }

      case "people": {
        const both = page.specialists.length > 0 && page.branches.length > 0;
        return section(
          "people",
          words(sectionLabel),
          <>
            {page.specialists.length ? (
              <div className={`min-w-0 ${both ? "mb-10" : ""}`}>
                {both ? (
                  <h3 className={`${H3} mb-4`}>
                    {words(labelOf("specialists", sectionLabel))}
                  </h3>
                ) : null}
                {page.specialists.length > 3 ? (
                  <div
                    role="region"
                    aria-label={t("الأطباء المتاحون", "Available doctors")}
                    tabIndex={0}
                    className={`flex max-w-full snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin] ${FOCUS}`}
                  >
                    {page.specialists.map((doctor) => (
                      <div
                        key={doctor.id}
                        className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-[calc((100%-1rem)/2)]"
                      >
                        <DoctorCard
                          doctor={doctor}
                          branches={page.allBranches}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {page.specialists.map((doctor) => (
                      <div key={doctor.id} className="h-full min-w-0">
                        <DoctorCard
                          doctor={doctor}
                          branches={page.allBranches}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {page.branches.length ? (
              <div className="min-w-0">
                {both ? (
                  <h3 className={`${H3} mb-4`}>
                    {words(labelOf("branches", sectionLabel))}
                  </h3>
                ) : null}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {page.branches.map((branch) => (
                    <div key={branch.id} className="h-full min-w-0">
                      <BranchCard branch={branch} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>,
        );
      }

      case "faq":
        return section(
          "faq",
          words(sectionLabel),
          <div className="min-w-0">
            <FaqAccordion items={page.questions} />
          </div>,
        );

      case "related":
        return null;
    }
  };

  const stackActions = (
    <ServiceCtaButtons
      offered={offered}
      treatmentId={content.key}
      whatsappMessage={whatsappMessage}
      phone={clinic.phone}
    />
  );
  const heroActions = (
    <ServiceCtaButtons
      offered={offered}
      treatmentId={content.key}
      whatsappMessage={whatsappMessage}
      phone={clinic.phone}
      layout="inline"
    />
  );
  const rowActions = (
    <ServiceCtaButtons
      offered={offered}
      treatmentId={content.key}
      whatsappMessage={whatsappMessage}
      phone={clinic.phone}
      layout="row"
    />
  );
  const invitation = showsWhatsapp
    ? t(
        "احجزي استشارتكِ لهذه الجلسة، أو أرسلي استفساركِ مباشرة على واتساب وسنرد خلال دقائق.",
        "Book your consultation for this treatment, or send your question on WhatsApp and we reply within minutes.",
      )
    : t(
        "احجزي استشارتكِ لهذه الجلسة وسنؤكد معكِ الموعد المناسب.",
        "Book your consultation for this service and we will confirm a time that suits you.",
      );

  return (
    <div
      className={`w-full max-w-full overflow-x-clip ${
        hasAside ? "pb-28 lg:pb-0" : "pb-8 lg:pb-0"
      }`}
    >
      <ServiceHero
        title={words(heroTitle)}
        lead={has(heroLead) ? words(heroLead) : ""}
        photo={heroPhoto}
        priceChip={hasPrice ? priceChip : null}
        language={language}
        crumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/services", label: { ar: "الخدمات", en: "Treatments" } },
          { href: `/services/${content.key}`, label: content.name },
        ]}
        actions={heroActions}
      />

      <div ref={heroEndRef} aria-hidden className="h-px w-full" />

      <ServiceFactsStrip
        label={t("نظرة سريعة على الجلسة", "Treatment at a glance")}
        facts={factChips}
      />

      <ServiceSubNav
        items={navItems}
        ariaLabel={t("أقسام الصفحة", "Page sections")}
      />

      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-[72px]">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
          <div
            className={`min-w-0 space-y-14 lg:space-y-20 ${
              hasAside ? "lg:col-span-8" : "lg:col-span-12"
            }`}
          >
            {inlineSections.map((entry) => (
              <React.Fragment key={entry.key}>
                {renderSection(entry)}
              </React.Fragment>
            ))}
          </div>

          {hasAside ? (
            <aside className="min-w-0 lg:col-span-4">
              <div className="overflow-hidden rounded-[1.75rem] rounded-se-[3.5rem] bg-[var(--bg-secondary)] ring-1 ring-[var(--gold-border)] lg:sticky lg:top-32">
                <div className="p-6 sm:p-8">
                  {hasPrice ? (
                    <p
                      dir="auto"
                      className="mb-4 break-words text-2xl font-black text-[var(--gold-end)]"
                    >
                      {priceChip}
                    </p>
                  ) : null}
                  <p
                    dir="auto"
                    className="mb-6 break-words text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
                  >
                    {invitation}
                  </p>
                  {stackActions}
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        {showsRelated ? (
          <section
            id="related"
            aria-labelledby="related-title"
            className="mt-20 min-w-0 scroll-mt-32 lg:mt-28 lg:scroll-mt-36"
          >
            <div id="related-title">
              <SectionHeading title={relatedTitle} />
            </div>
            {page.relatedServices.length ? (
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {page.relatedServices.map((service) => (
                  <div key={service.id} className="h-full min-w-0">
                    <TreatmentCard treatment={service} />
                  </div>
                ))}
              </div>
            ) : null}
            {page.relatedArticles.length ? (
              <div
                className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8 ${
                  page.relatedServices.length ? "mt-6" : "mt-10"
                }`}
              >
                {page.relatedArticles.map((article) => (
                  <div key={article.slug} className="h-full min-w-0">
                    <ArticleCard article={article} />
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-10 text-center">
              <Link
                href={getLocalizedHref("/services", language)}
                className={`inline-flex min-h-[44px] items-center rounded-full bg-[var(--text-primary)] px-7 text-sm font-bold text-[var(--bg-card)] transition-opacity duration-300 hover:opacity-85 ${FOCUS}`}
              >
                {t("تصفحي كل الخدمات", "Browse all treatments")}
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      {hasAside && heroPassed ? (
        <div
          role="region"
          aria-label={t("إجراءات سريعة", "Quick actions")}
          className="fixed inset-x-0 bottom-0 z-40 bg-[var(--bg-card)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto max-w-md">{rowActions}</div>
        </div>
      ) : null}
    </div>
  );
};
