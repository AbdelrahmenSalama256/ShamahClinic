"use client";

/**
 * A service page, drawn from the document its author typed.
 *
 * The design is the one the original site shipped — the split hero with its photograph, the
 * two columns with the sticky booking card, the labelled fact chips, the numbered steps, the
 * gold-ruled care list, the related strip under them all — with the rows behind it swapped:
 * what it draws now comes from every group the console edits, not the fourteen fields the
 * first port had room for.
 *
 * Four rules this file keeps:
 *
 * **The author's order is the page's order.** `page.sections` is already filtered to the
 * sections that hold something and sorted the way the owner arranged them; this draws them in
 * that sequence and never adds one of its own.
 *
 * **A heading never stands over a gap.** A section reaches here only when its content resolved
 * (`../content/service-page.ts`), and every block inside is still drawn conditionally, so a
 * service with no questions, no price and no team shows none of those headings — not an empty
 * box where they would have been.
 *
 * **The words come from the console.** A section is named by its own switch and a list by the
 * label printed beside the box that wrote it, both read from the schema, so the page and the
 * editor cannot drift into calling the same thing two things. The two headings the original
 * page published for itself — «عن هذه الجلسة» and the browse link — keep their own wording.
 *
 * **Nothing is invented.** No price is formatted that the row does not carry, no disclaimer is
 * written because a switch was ticked, and a photograph with no description is named by the
 * service rather than by a sentence about it.
 */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { Reveal } from "@/components/ui/Reveal";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
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
  CalendarDays,
  Check,
  Clock,
  Cpu,
  Droplet,
  Heart,
  Moon,
  Repeat,
  Shield,
  Hourglass,
  BadgeCheck,
  Sun,
} from "lucide-react";

/** The column's section heading — the size the original detail page gave its blocks. */
const SECTION_HEADING =
  "text-xl sm:text-2xl font-black text-[var(--text-primary)]";
/** A list inside a section: under its heading, still a heading. */
const PART_HEADING =
  "text-base sm:text-lg font-black text-[var(--text-primary)]";

/** The prose the console writes as markup, styled the way the original article body was. */
const PROSE =
  "text-base leading-relaxed text-[var(--text-secondary)] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-[var(--text-primary)] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[var(--text-primary)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:space-y-1.5 [&_li]:text-[var(--text-secondary)] [&_a]:text-[var(--gold-end)] [&_a]:underline [&_strong]:text-[var(--text-primary)]";

/** The seven numbers a session is described by, each with the mark the chip carries. */
const FACT_FIELDS: { stem: keyof ServiceFacts; icon: typeof Clock }[] = [
  { stem: "duration", icon: Clock },
  { stem: "sessions", icon: Repeat },
  { stem: "frequency", icon: CalendarDays },
  { stem: "timeline", icon: Hourglass },
  { stem: "downtime", icon: Moon },
  { stem: "anesthesia", icon: Shield },
  { stem: "technology", icon: Cpu },
];

/** The mark a benefit row asks for; a name the console has never offered draws the plain tick. */
const BENEFIT_ICONS: Record<string, typeof Check> = {
  "badge-check": BadgeCheck,
  sparkles: BadgeCheck,
  shield: Shield,
  droplet: Droplet,
  sun: Sun,
  heart: Heart,
  clock: Clock,
};

/** A section title with the gold accent the redesigned page carries. */
const SectionTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "mb-5" }) => (
  <h2
    className={`${SECTION_HEADING} ${className} flex items-center gap-3`}
    dir="auto"
  >
    <span
      className="w-1.5 h-6 rounded-full bg-gradient-to-b from-[var(--text-gold)] to-[var(--gold-end)] shrink-0"
      aria-hidden
    />
    <span>{children}</span>
  </h2>
);

type Breadcrumb = Crumb;
type FactChip = {
  key: string;
  label: string;
  value: string;
  icon: typeof Clock;
};

const ServiceHero: React.FC<{
  title: string;
  lead: string;
  photo?: React.ComponentProps<typeof Photo>["slot"];
  priceChip: React.ReactNode;
  breadcrumbs: Breadcrumb[];
  actions: React.ReactNode;
}> = ({ title, lead, photo, priceChip, breadcrumbs, actions }) => {
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
    <header
      className={`border-b border-[var(--border-control)] ${
        showImage
          ? "bg-[var(--bg-card)]"
          : "bg-gradient-to-b from-[var(--bg-secondary)] via-[var(--bg-card)] to-[var(--bg-card)]"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 pb-9 pt-6 sm:px-6 lg:px-8 lg:pb-14 lg:pt-8">
        <Breadcrumbs items={breadcrumbs} />

        <div
          className={
            showImage
              ? "grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
              : "grid items-center gap-8"
          }
        >
          <div className="min-w-0">
            <h1
              dir="auto"
              className="text-3xl font-black leading-tight text-[var(--text-primary)] sm:text-4xl lg:text-5xl"
            >
              {title}
            </h1>
            {lead ? (
              <p
                dir="auto"
                className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg"
              >
                {lead}
              </p>
            ) : null}
            {priceChip ? (
              <p className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--gold-border)] bg-[var(--bg-secondary)] px-4 text-sm font-bold text-[var(--gold-end)]">
                {priceChip}
              </p>
            ) : null}
            <div className="mt-7 flex flex-wrap items-stretch gap-3">{actions}</div>
          </div>

          {photo && showImage ? (
            <div className="order-first w-full lg:order-none">
              <div className="relative aspect-[16/10] min-h-[240px] w-full overflow-hidden rounded-3xl bg-[var(--bg-secondary)] ring-1 ring-[var(--gold-border)] lg:aspect-[4/3]">
                <Photo
                  slot={photo}
                  ratio="landscape"
                  sizes="(max-width: 1024px) 100vw, 44vw"
                  className="h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

const ServiceFactsStrip: React.FC<{ label: string; facts: FactChip[] }> = ({
  label,
  facts,
}) =>
  facts.length ? (
    <section
      aria-label={label}
      className="border-b border-[var(--border-control)] bg-[var(--bg-secondary)]/40"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
          {facts.map((fact) => (
            <li
              key={fact.key}
              className="flex min-h-[44px] items-start gap-2.5 rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] p-3"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)]">
                <fact.icon className="h-4 w-4 text-[var(--text-gold)]" aria-hidden />
              </span>
              <div className="min-w-0">
                {fact.label ? (
                  <p dir="auto" className="text-[11px] font-medium text-[var(--text-muted)]">
                    {fact.label}
                  </p>
                ) : null}
                <p
                  dir="auto"
                  className="mt-0.5 text-sm font-bold leading-snug text-[var(--text-primary)]"
                >
                  {fact.value}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  ) : null;

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
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
  };

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-[64px] z-30 border-b border-[var(--border-control)] bg-[var(--bg-card)]/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <a
              key={item.key}
              href={`#${item.key}`}
              onClick={(event) => go(event, item.key)}
              aria-current={isActive ? "true" : undefined}
              className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2 ${
                isActive
                  ? "border-[var(--gold-end)] bg-[var(--bg-secondary)] text-[var(--gold-end)]"
                  : "border-[var(--border-control)] text-[var(--text-secondary)] hover:border-[var(--gold-border)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
};

const ServiceCtaButtons: React.FC<{
  offered: ServiceCta[];
  treatmentId: string;
  whatsappMessage: string;
  phone: string;
  layout?: "stack" | "row";
}> = ({ offered, treatmentId, whatsappMessage, phone, layout = "stack" }) => {
  if (!offered.length) return null;
  const layoutClass =
    layout === "row"
      ? "flex flex-row items-stretch gap-2 [&>*]:min-w-0 [&>*]:flex-1"
      : "flex flex-col gap-3";

  return (
    <div className={layoutClass}>
      {offered.map((cta) =>
        cta === "booking" ? (
          <BookButton
            key={cta}
            treatmentId={treatmentId}
            size="lg"
            className="w-full"
          />
        ) : cta === "whatsapp" ? (
          <WhatsAppButton
            key={cta}
            size="lg"
            variant="outline"
            className="w-full"
            custom={whatsappMessage}
          />
        ) : (
          <CallButton key={cta} phone={phone} size="lg" className="w-full" />
        ),
      )}
    </div>
  );
};

export const TreatmentDetailClient: React.FC<{ page: ServicePage }> = ({
  page,
}) => {
  const { t, language, formatNumber } = useLanguage();
  // The numbers the site dials come from the provider the layout already renders, the same
  // path the header, the footer and the floating buttons use — not from this page's props.
  const clinic = useClinic();
  const content = page.content;

  const has = (value: Bi) => value.ar !== "" || value.en !== "";
  /** The console's own words for one field, or the heading of the section that holds it. */
  const labelOf = (stem: string, fallback: Bi): Bi =>
    fieldLabelOf("services", stem) ?? fallback;
  const words = (value: Bi) => (language === "ar" ? value.ar : value.en);

  // The hero shows what the owner wrote for it and falls back to the service's own name and
  // short description — the two fields every row already carries.
  const heroTitle = has(content.hero.headline)
    ? content.hero.headline
    : content.name;
  const heroLead = has(content.hero.subheadline)
    ? content.hero.subheadline
    : content.intro;
  // A row with no hero photograph gets no column for one: the title takes the width instead.
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
  // A price with no currency of its own gets the word the offer cards print, so one entry in
  // the Texts screen renames the currency everywhere instead of in two places.
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
  const priceChip: React.ReactNode = pricing.onRequest
    ? priceOnRequest
    : pricing.price !== null
      ? (
          <>
            {formatNumber(pricing.price)}
            <span className="ms-1 font-bold text-[var(--text-secondary)]">
              {currency}
            </span>
          </>
        )
      : pricing.priceMax !== null
        ? (
            <>
              {formatNumber(pricing.priceMax)}
              <span className="ms-1 font-bold text-[var(--text-secondary)]">
                {currency}
              </span>
            </>
          )
        : null;

  // The gallery walks the photographs this row carries; an index past the end (a photo removed
  // between renders) is clamped rather than trusted.
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
          setHeroPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
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
    // The card's service chip would point back at this page, so it is not drawn here.
    service: null,
    article: item.article,
  }));

  const whatsappMessage =
    language === "ar"
      ? `مرحباً عيادات شامه، أرغب في الاستفسار عن جلسة ${content.name.ar}.`
      : `Hello Shamah Clinics, I would like to ask about ${content.name.en}.`;

  // The two buttons the owner chose, in that order, without repeating one. A call with no
  // number saved in Settings is not offered: the switch would open an empty dialler.
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
        return (
          hasPrice ||
          has(pricing.note) ||
          page.offers.length > 0
        );
      case "proof":
        return (!videoFailed && page.video !== null) || cases.length > 0;
      case "gallery":
        return gallery.length > 0;
      case "people":
        return page.specialists.length > 0 || page.branches.length > 0;
      case "faq":
        return page.questions.length > 0;
      case "related":
        return page.relatedServices.length > 0 || page.relatedArticles.length > 0;
    }
  };
  const renderableSections = page.sections.filter((entry) => canRender(entry.key));
  const inlineSections = renderableSections.filter((entry) => entry.key !== "related");
  const showsRelated = renderableSections.some((entry) => entry.key === "related");
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

  const section = (key: ServiceSectionKey, children: React.ReactNode) => (
    <section key={key} id={key} className="scroll-mt-32 lg:scroll-mt-36">
      <Reveal>{children}</Reveal>
    </section>
  );

  /** One of the console's point-lists, drawn the way the original drew its aftercare. */
  const pointList = (items: string[], keyOf: (item: string) => string) => (
    <ul className="space-y-3 border-s-2 border-[var(--gold-border)] ps-5">
      {items.map((item) => (
        <li
          key={keyOf(item)}
          className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]"
          dir="auto"
        >
          {item}
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
          <>
            {/* The heading the original page published for this block, kept word for word. */}
            <SectionTitle className="mb-5">
              {t("عن هذه الجلسة", "About this treatment")}
            </SectionTitle>
            {has(content.description) ? (
              <div
                className={PROSE}
                dir="auto"
                dangerouslySetInnerHTML={{ __html: words(content.description) }}
              />
            ) : null}
            {has(content.body) ? (
              <div className="mt-6">
                <h3 className={`${PART_HEADING} mb-3`}>
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
              <div className="mt-6 rounded-xl border border-[var(--gold-border)] bg-[var(--bg-secondary)]/50 px-5 py-4">
                <p
                  className="text-xs font-bold text-[var(--text-gold)] mb-1"
                  dir="auto"
                >
                  {words(labelOf("ideal", sectionLabel))}
                </p>
                <p
                  className="text-base leading-relaxed text-[var(--text-secondary)]"
                  dir="auto"
                >
                  {words(ideal)}
                </p>
              </div>
            ) : null}
            {benefits.length ? (
              <div className="mt-8">
                <h3 className={`${PART_HEADING} mb-4`}>
                  {words(labelOf("benefits", sectionLabel))}
                </h3>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {benefits.map((benefit) => {
                    const Icon =
                      (benefit.icon && BENEFIT_ICONS[benefit.icon]) || Check;
                    return (
                      <li
                        key={`${benefit.text.ar}-${benefit.text.en}`}
                        className="flex items-start gap-3 text-sm text-[var(--text-primary)]"
                      >
                        <span className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5 text-[var(--text-gold)]" />
                        </span>
                        <span className="pt-0.5" dir="auto">
                          {has(benefit.title) ? (
                            <span className="font-bold">
                              {words(benefit.title)}:{" "}
                            </span>
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
              <div className="mt-8">
                <h3 className={`${PART_HEADING} mb-4`}>
                  {words(labelOf("notFor", sectionLabel))}
                </h3>
                {pointList(notFor, (item) => item)}
              </div>
            ) : null}
          </>,
        );

      case "how":
        return section(
          "how",
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {steps.length ? (
              <ol>
                {steps.map((step, index) => {
                  const isLast = index === steps.length - 1;
                  return (
                    <li
                      key={`${index}-${words(step.text)}`}
                      className="flex gap-4"
                    >
                      <div className="flex shrink-0 flex-col items-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--text-gold)] to-[var(--gold-end)] text-sm font-black text-white shadow-sm">
                          {formatNumber(index + 1)}
                        </span>
                        {!isLast ? (
                          <span className="my-2 w-px flex-1 bg-gradient-to-b from-[var(--gold-border)] to-transparent" />
                        ) : null}
                      </div>
                      <div className={`min-w-0 pt-1.5 ${isLast ? "" : "pb-7"}`}>
                        {has(step.title) ? (
                          <p
                            className="text-sm font-bold text-[var(--text-primary)] sm:text-base"
                            dir="auto"
                          >
                            {words(step.title)}
                          </p>
                        ) : null}
                        <p
                          className="text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
                          dir="auto"
                        >
                          {words(step.text)}
                        </p>
                        {step.image ? (
                          <div className="mt-3 max-w-sm overflow-hidden rounded-xl">
                            <Photo
                              slot={toPhotoSlot(
                                step.image,
                                has(step.title) ? step.title : step.text,
                              )}
                              ratio="landscape"
                              sizes="(max-width: 640px) 90vw, 24rem"
                              className="w-full"
                            />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </>,
        );

      case "prep":
        return section(
          "prep",
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {prep.length ? (
              <div className={aftercare.length ? "mb-8" : ""}>
                <h3 className={`${PART_HEADING} mb-4`}>
                  {words(labelOf("prep", sectionLabel))}
                </h3>
                {pointList(prep, (item) => item)}
              </div>
            ) : null}
            {aftercare.length ? (
              <div>
                <h3 className={`${PART_HEADING} mb-4`}>
                  {words(labelOf("aftercare", sectionLabel))}
                </h3>
                {pointList(aftercare, (item) => item)}
              </div>
            ) : null}
          </>,
        );

      case "safety":
        return section(
          "safety",
          <div className="rounded-2xl border border-[var(--border-control)] bg-[var(--bg-secondary)]/50 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-[var(--gold-end)] via-[var(--text-gold)] to-transparent" />
            <div className="p-6">
              <h2 className={`${PART_HEADING} mb-4`}>{words(sectionLabel)}</h2>
              {contraindications.length ? (
                <div className={sideEffects.length ? "mb-6" : ""}>
                  <h3
                    className="text-sm font-bold text-[var(--text-primary)] mb-2.5"
                    dir="auto"
                  >
                    {words(labelOf("contraindications", sectionLabel))}
                  </h3>
                  {pointList(contraindications, (item) => item)}
                </div>
              ) : null}
              {sideEffects.length ? (
                <div>
                  <h3
                    className="text-sm font-bold text-[var(--text-primary)] mb-2.5"
                    dir="auto"
                  >
                    {words(labelOf("sideEffects", sectionLabel))}
                  </h3>
                  {pointList(sideEffects, (item) => item)}
                </div>
              ) : null}
            </div>
          </div>,
        );

      case "pricing":
        return section(
          "pricing",
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {pricing.onRequest ||
            pricing.price !== null ||
            pricing.priceMax !== null ? (
              <div className="rounded-2xl border border-[var(--gold-border)] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-card)] px-6 py-5">
                {pricing.onRequest ? (
                  <p
                    className="text-sm font-bold text-[var(--text-primary)]"
                    dir="auto"
                  >
                    {words(labelOf("priceOnRequest", sectionLabel))}
                  </p>
                ) : pricing.price !== null ? (
                  <>
                    <p
                      className="text-[11px] font-bold text-[var(--text-muted)]"
                      dir="auto"
                    >
                      {words(labelOf("price", sectionLabel))}
                    </p>
                    <p
                      className="mt-1 text-3xl sm:text-4xl font-black text-[var(--gold-end)] tracking-tight"
                      dir="ltr"
                    >
                      {formatNumber(pricing.price)}
                      <span className="text-base font-bold text-[var(--text-secondary)] ms-2">
                        {currency}
                      </span>
                    </p>
                    {pricing.priceMax !== null ? (
                      <p className="mt-3 pt-3 border-t border-[var(--gold-border)]/50 text-sm text-[var(--text-secondary)]">
                        <span dir="auto">
                          {words(labelOf("priceMax", sectionLabel))}:{" "}
                        </span>
                        <span dir="ltr">
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
                    <span dir="ltr">
                      {formatNumber(pricing.priceMax)} {currency}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {has(pricing.note) ? (
              <p
                className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]"
                dir="auto"
              >
                {words(pricing.note)}
              </p>
            ) : null}
            {page.offers.length ? (
              <div className="mt-6 grid sm:grid-cols-2 gap-5">
                {page.offers.map((offer, index) => (
                  <Reveal
                    key={offer.slug}
                    className="h-full"
                    delay={index * 0.08}
                  >
                    <div className="h-full [&_img]:bg-[var(--bg-secondary)] [&_img]:object-contain">
                      <OfferCard offer={offer} />
                    </div>
                  </Reveal>
                ))}
              </div>
            ) : null}
          </>,
        );

      case "proof":
        return section(
          "proof",
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {page.video && !videoFailed ? (
              <video
                src={page.video.url}
                poster={page.video.poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
                className="aspect-video w-full rounded-2xl border border-[var(--border-control)] bg-[var(--bg-dark)]"
              />
            ) : null}
            {cases.length ? (
              <div
                className={`grid gap-5 sm:grid-cols-2 ${
                  page.video && !videoFailed ? "mt-6" : ""
                }`}
              >
                {cases.map((story, index) => (
                  <Reveal
                    key={story.key}
                    className="h-full"
                    delay={Math.min(index, 6) * 0.08}
                  >
                    <ResultCaseCard
                      story={story}
                      gallery={cases}
                      priority={index < 2}
                    />
                  </Reveal>
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
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {/* One photograph is the photograph: no strip, no controls, no empty slot beside it. */}
            <div className="rounded-2xl overflow-hidden border border-[var(--border-control)] bg-[var(--bg-card)]">
              <Photo
                slot={item.slot}
                ratio="landscape"
                sizes="(max-width:1024px) 100vw, 50vw"
              />
              {caption ? (
                <p
                  className="px-4 py-3 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed"
                  dir="auto"
                >
                  {caption}
                </p>
              ) : null}
              {gallery.length > 1 ? (
                <div className="flex flex-wrap gap-2.5 p-3 border-t border-[var(--border-control)]">
                  {gallery.map((thumb, index) => (
                    <button
                      key={`${thumb.slot.src}-${index}`}
                      type="button"
                      onClick={() => setShown(index)}
                      aria-label={
                        language === "ar"
                          ? thumb.slot.alt.ar
                          : thumb.slot.alt.en
                      }
                      aria-current={index === active || undefined}
                      className={`min-h-[44px] w-20 cursor-pointer overflow-hidden rounded-xl border-2 transition-[border-color,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2 ${
                        index === active
                          ? "border-[var(--gold-end)]"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <Photo slot={thumb.slot} ratio="square" sizes="80px" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>,
        );
      }

      case "people": {
        const both = page.specialists.length > 0 && page.branches.length > 0;
        return section(
          "people",
          <>
            <SectionTitle>{words(sectionLabel)}</SectionTitle>
            {page.specialists.length ? (
              <div className={both ? "mb-8" : ""}>
                {both ? (
                  <h3 className={`${PART_HEADING} mb-4`}>
                    {words(labelOf("specialists", sectionLabel))}
                  </h3>
                ) : null}
                {page.specialists.length > 3 ? (
                  <div
                    role="region"
                    aria-label={t("الأطباء المتاحون", "Available doctors")}
                    tabIndex={0}
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2 [scrollbar-width:thin]"
                  >
                    {page.specialists.map((doctor, index) => (
                      <div
                        key={doctor.id}
                        className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-[calc((100%-2rem)/2)]"
                      >
                        <Reveal
                          className="h-full"
                          delay={Math.min(index, 6) * 0.06}
                        >
                          <DoctorCard
                            doctor={doctor}
                            branches={page.allBranches}
                          />
                        </Reveal>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {page.specialists.map((doctor, index) => (
                      <Reveal
                        key={doctor.id}
                        className="h-full"
                        delay={index * 0.08}
                      >
                        <DoctorCard
                          doctor={doctor}
                          branches={page.allBranches}
                        />
                      </Reveal>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {page.branches.length ? (
              <div>
                {both ? (
                  <h3 className={`${PART_HEADING} mb-4`}>
                    {words(labelOf("branches", sectionLabel))}
                  </h3>
                ) : null}
                <div className="grid sm:grid-cols-2 gap-5">
                  {page.branches.map((branch, index) => (
                    <Reveal
                      key={branch.id}
                      className="h-full"
                      delay={index * 0.08}
                    >
                      <BranchCard branch={branch} />
                    </Reveal>
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
          <>
            <SectionTitle className="mb-2">{words(sectionLabel)}</SectionTitle>
            <FaqAccordion items={page.questions} />
          </>,
        );

      case "related":
        // Drawn as the full-width strip below both columns, which is where the original put it.
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
    <div className={hasAside ? "pb-28 lg:pb-0" : "pb-8 lg:pb-0"}>
      <ServiceHero
        title={words(heroTitle)}
        lead={has(heroLead) ? words(heroLead) : ""}
        photo={heroPhoto}
        priceChip={hasPrice ? priceChip : null}
        breadcrumbs={[
          {
            href: "/",
            label: { ar: "الرئيسية", en: "Home" },
          },
          {
            href: "/services",
            label: { ar: "الخدمات", en: "Treatments" },
          },
          {
            href: `/services/${content.key}`,
            label: content.name,
          },
        ]}
        actions={stackActions}
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

      <div className="mx-auto max-w-7xl px-4 py-11 sm:px-6 lg:px-8 lg:py-[72px]">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div
            className={`min-w-0 space-y-11 lg:space-y-[72px] ${
              hasAside ? "lg:col-span-8" : "lg:col-span-12"
            }`}
          >
            {inlineSections.map((entry) => (
              <React.Fragment key={entry.key}>{renderSection(entry)}</React.Fragment>
            ))}
          </div>

          {hasAside ? (
            <aside className="min-w-0 lg:col-span-4">
              <div className="overflow-hidden rounded-2xl border border-[var(--border-control)] bg-[var(--bg-card)] shadow-lg shadow-black/[0.04] lg:sticky lg:top-32">
                <div className="h-1 bg-gradient-to-r from-[var(--text-gold)] via-[var(--gold-end)] to-[var(--text-gold)]" />
                <div className="p-6 sm:p-7">
                  <p
                    dir="auto"
                    className="text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base"
                  >
                    {invitation}
                  </p>
                  {hasPrice ? (
                    <p className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-[var(--gold-border)] bg-[var(--bg-secondary)] px-4 text-sm font-bold text-[var(--gold-end)]">
                      {priceChip}
                    </p>
                  ) : null}
                  <div className="mt-6">{stackActions}</div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        {showsRelated ? (
          <section
            id="related"
            aria-labelledby="related-title"
            className="mt-16 scroll-mt-32 lg:mt-24 lg:scroll-mt-36"
          >
            <div id="related-title">
              <SectionHeading title={relatedTitle} />
            </div>
            {page.relatedServices.length ? (
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {page.relatedServices.map((service, index) => (
                  <Reveal
                    key={service.id}
                    className="h-full"
                    delay={index * 0.08}
                  >
                    <TreatmentCard treatment={service} />
                  </Reveal>
                ))}
              </div>
            ) : null}
            {page.relatedArticles.length ? (
              <div
                className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8 ${
                  page.relatedServices.length ? "mt-6" : "mt-10"
                }`}
              >
                {page.relatedArticles.map((article, index) => (
                  <Reveal
                    key={article.slug}
                    className="h-full"
                    delay={index * 0.08}
                  >
                    <ArticleCard article={article} />
                  </Reveal>
                ))}
              </div>
            ) : null}
            <div className="mt-10 text-center">
              <Link
                href={getLocalizedHref("/services", language)}
                className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--border-control)] px-6 text-sm font-bold text-[var(--text-primary)] transition-colors duration-300 hover:border-[var(--gold-end)] hover:text-[var(--gold-end)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-end)] focus-visible:ring-offset-2"
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
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-control)] bg-[var(--bg-card)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto max-w-md">{rowActions}</div>
        </div>
      ) : null}
    </div>
  );
};
