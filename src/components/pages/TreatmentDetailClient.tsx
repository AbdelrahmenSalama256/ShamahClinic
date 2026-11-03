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
import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Photo } from "@/components/ui/Photo";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { DoctorCard } from "@/components/cards/DoctorCard";
import { BranchCard } from "@/components/cards/BranchCard";
import { ResultCaseCard, type ResultCaseData } from "@/components/cards/ResultCaseCard";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { BookButton, CallButton, WhatsAppButton } from "@/components/shared/Actions";
import { useClinic } from "@/context/ClinicContext";
import { getLocalizedHref } from "@/lib/locale";
import { fieldLabelOf } from "@/lib/content/list-schema";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import type { Bi, ServiceSectionKey } from "@/lib/content/list-schema";
import type { ServiceCta, ServiceFacts } from "@/lib/content/service-doc";
import type { ServicePage } from "@/lib/content/service-page";
import { CalendarDays, Check, Clock, Cpu, Droplet, Heart, Moon, Repeat, Shield, Sparkles, Sun } from "lucide-react";

/** The column's section heading — the size the original detail page gave its blocks. */
const SECTION_HEADING = "text-xl sm:text-2xl font-black text-[var(--text-primary)]";
/** A list inside a section: under its heading, still a heading. */
const PART_HEADING = "text-base sm:text-lg font-black text-[var(--text-primary)]";

/** The prose the console writes as markup, styled the way the original article body was. */
const PROSE =
  "text-base leading-relaxed text-[var(--text-secondary)] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-[var(--text-primary)] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[var(--text-primary)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:space-y-1.5 [&_li]:text-[var(--text-secondary)] [&_a]:text-[var(--gold-end)] [&_a]:underline [&_strong]:text-[var(--text-primary)]";

/** The seven numbers a session is described by, each with the mark the chip carries. */
const FACT_FIELDS: { stem: keyof ServiceFacts; icon: typeof Clock }[] = [
  { stem: "duration", icon: Clock },
  { stem: "sessions", icon: Repeat },
  { stem: "frequency", icon: CalendarDays },
  { stem: "timeline", icon: Sparkles },
  { stem: "downtime", icon: Moon },
  { stem: "anesthesia", icon: Shield },
  { stem: "technology", icon: Cpu },
];

/** The mark a benefit row asks for; a name the console has never offered draws the plain tick. */
const BENEFIT_ICONS: Record<string, typeof Check> = {
  sparkles: Sparkles,
  shield: Shield,
  droplet: Droplet,
  sun: Sun,
  heart: Heart,
  clock: Clock,
};

export const TreatmentDetailClient: React.FC<{ page: ServicePage }> = ({ page }) => {
  const { t, language, formatNumber } = useLanguage();
  // The numbers the site dials come from the provider the layout already renders, the same
  // path the header, the footer and the floating buttons use — not from this page's props.
  const clinic = useClinic();
  const content = page.content;

  const has = (value: Bi) => value.ar !== "" || value.en !== "";
  /** The console's own words for one field, or the heading of the section that holds it. */
  const labelOf = (stem: string, fallback: Bi): Bi => fieldLabelOf("services", stem) ?? fallback;
  const words = (value: Bi) => (language === "ar" ? value.ar : value.en);

  // The hero shows what the owner wrote for it and falls back to the service's own name and
  // short description — the two fields every row already carries.
  const heroTitle = has(content.hero.headline) ? content.hero.headline : content.name;
  const heroLead = has(content.hero.subheadline) ? content.hero.subheadline : content.intro;
  // A row with no hero photograph gets no column for one: the title takes the width instead.
  const heroPhoto = page.hero.src ? page.hero : undefined;

  const facts = FACT_FIELDS.map((field) => ({ ...field, value: content.facts[field.stem] })).filter((fact) =>
    has(fact.value),
  );
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

  // The gallery walks the photographs this row carries; an index past the end (a photo removed
  // between renders) is clamped rather than trusted.
  const [shown, setShown] = useState(0);
  const gallery = page.gallery;
  const active = gallery.length ? Math.min(shown, gallery.length - 1) : 0;

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
  const chosen: ServiceCta[] = [content.hero.ctaPrimary, content.hero.ctaSecondary].filter(
    (cta, index, all) => cta !== "none" && all.indexOf(cta) === index,
  );
  const offered = chosen.filter((cta) => cta !== "call" || clinic.phone !== "");
  const showsWhatsapp = offered.includes("whatsapp");

  const relatedTitle =
    page.relatedServices.length && page.relatedArticles.length
      ? labelOf("relatedServices", { ar: "خدمات ذات صلة", en: "Related services" })
      : page.relatedArticles.length
        ? labelOf("relatedArticles", { ar: "مقالات ذات صلة", en: "Related articles" })
        : labelOf("relatedServices", { ar: "خدمات ذات صلة", en: "Related services" });

  const section = (key: ServiceSectionKey, children: React.ReactNode) => (
    <section key={key} id={key} className="scroll-mt-32">
      <Reveal>{children}</Reveal>
    </section>
  );

  /** One of the console's point-lists, drawn the way the original drew its aftercare. */
  const pointList = (items: string[], keyOf: (item: string) => string) => (
    <ul className="space-y-2.5 border-s-2 border-[var(--gold-border)] ps-5">
      {items.map((item) => (
        <li key={keyOf(item)} className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]" dir="auto">
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
            <h2 className={`${SECTION_HEADING} mb-4`}>{t("عن هذه الجلسة", "About this treatment")}</h2>
            {has(content.description) ? (
              <div className={PROSE} dir="auto" dangerouslySetInnerHTML={{ __html: words(content.description) }} />
            ) : null}
            {has(content.body) ? (
              <div className="mt-6">
                <h3 className={`${PART_HEADING} mb-3`}>{words(labelOf("body", sectionLabel))}</h3>
                <div className={PROSE} dir="auto" dangerouslySetInnerHTML={{ __html: words(content.body) }} />
              </div>
            ) : null}
            {ideal ? (
              <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]" dir="auto">
                <span className="font-bold text-[var(--text-primary)]">{words(labelOf("ideal", sectionLabel))}: </span>
                {words(ideal)}
              </p>
            ) : null}
            {benefits.length ? (
              <div className="mt-8">
                <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("benefits", sectionLabel))}</h3>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {benefits.map((benefit) => {
                    const Icon = (benefit.icon && BENEFIT_ICONS[benefit.icon]) || Check;
                    return (
                      <li key={`${benefit.text.ar}-${benefit.text.en}`} className="flex items-start gap-2.5 text-sm text-[var(--text-primary)]">
                        <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-gold)]" />
                        <span dir="auto">
                          {has(benefit.title) ? <span className="font-bold">{words(benefit.title)}: </span> : null}
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
                <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("notFor", sectionLabel))}</h3>
                {pointList(notFor, (item) => item)}
              </div>
            ) : null}
          </>,
        );

      case "how":
        return section(
          "how",
          <>
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {/* The numbers are labelled by their own chips, so they need no heading above them. */}
            {facts.length ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {facts.map((fact) => (
                  <div key={fact.stem} className="flex items-start gap-3 p-5 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--border-control)]">
                    <fact.icon className="w-5 h-5 text-[var(--text-gold)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--text-muted)]" dir="auto">
                        {words(labelOf(fact.stem, sectionLabel))}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[var(--text-primary)] leading-snug" dir="auto">
                        {words(fact.value)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {steps.length ? (
              <div className={facts.length ? "mt-8" : ""}>
                <h3 className={`${PART_HEADING} mb-5`}>{words(labelOf("steps", sectionLabel))}</h3>
                <ol className="space-y-4">
                  {steps.map((step, index) => (
                    <li key={`${index}-${words(step.text)}`} className="flex gap-4">
                      <span className="w-8 h-8 shrink-0 rounded-full bg-[var(--bg-card)] border border-[var(--border-control)] text-[var(--gold-end)] font-black text-sm flex items-center justify-center">
                        {formatNumber(index + 1)}
                      </span>
                      <div className="min-w-0 pt-1">
                        {has(step.title) ? (
                          <p className="text-sm sm:text-base font-bold text-[var(--text-primary)]" dir="auto">
                            {words(step.title)}
                          </p>
                        ) : null}
                        <p className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]" dir="auto">
                          {words(step.text)}
                        </p>
                        {step.image ? (
                          <Photo
                            slot={toPhotoSlot(step.image, has(step.title) ? step.title : step.text)}
                            ratio="landscape"
                            className="mt-3 rounded-xl overflow-hidden"
                            sizes="(max-width:640px) 90vw, 40vw"
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>,
        );

      case "prep":
        return section(
          "prep",
          <>
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {prep.length ? (
              <div className={aftercare.length ? "mb-8" : ""}>
                <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("prep", sectionLabel))}</h3>
                {pointList(prep, (item) => item)}
              </div>
            ) : null}
            {aftercare.length ? (
              <div>
                <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("aftercare", sectionLabel))}</h3>
                {pointList(aftercare, (item) => item)}
              </div>
            ) : null}
          </>,
        );

      case "safety":
        return section(
          "safety",
          <div className="rounded-2xl border border-[var(--border-control)] bg-[var(--bg-secondary)]/70 p-6">
            <h2 className={`${PART_HEADING} mb-4`}>{words(sectionLabel)}</h2>
            {contraindications.length ? (
              <div className={sideEffects.length ? "mb-6" : ""}>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2.5" dir="auto">
                  {words(labelOf("contraindications", sectionLabel))}
                </h3>
                {pointList(contraindications, (item) => item)}
              </div>
            ) : null}
            {sideEffects.length ? (
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2.5" dir="auto">
                  {words(labelOf("sideEffects", sectionLabel))}
                </h3>
                {pointList(sideEffects, (item) => item)}
              </div>
            ) : null}
          </div>,
        );

      case "pricing":
        return section(
          "pricing",
          <>
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {pricing.onRequest ? (
              <p className="text-sm font-bold text-[var(--text-primary)]" dir="auto">
                {words(labelOf("priceOnRequest", sectionLabel))}
              </p>
            ) : pricing.price !== null ? (
              <div>
                <p className="text-xs text-[var(--text-muted)]" dir="auto">
                  {words(labelOf("price", sectionLabel))}
                </p>
                <p className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-end)]" dir="ltr">
                  {formatNumber(pricing.price)}
                  <span className="text-base font-bold ms-1">{currency}</span>
                </p>
                {pricing.priceMax !== null ? (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    <span dir="auto">{words(labelOf("priceMax", sectionLabel))}: </span>
                    <span dir="ltr">
                      {formatNumber(pricing.priceMax)} {currency}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : pricing.priceMax !== null ? (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                <span dir="auto">{words(labelOf("priceMax", sectionLabel))}: </span>
                <span dir="ltr">
                  {formatNumber(pricing.priceMax)} {currency}
                </span>
              </p>
            ) : null}
            {has(pricing.note) ? (
              <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]" dir="auto">
                {words(pricing.note)}
              </p>
            ) : null}
            {page.offers.length ? (
              <div className="mt-6 grid sm:grid-cols-2 gap-5">
                {page.offers.map((offer, index) => (
                  <Reveal key={offer.slug} className="h-full" delay={index * 0.08}>
                    <OfferCard offer={offer} />
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
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {page.video ? (
              <video
                src={page.video.url}
                poster={page.video.poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-video rounded-2xl border border-[var(--border-control)] bg-[var(--bg-dark)]"
              />
            ) : null}
            {cases.length ? (
              <div className={`grid sm:grid-cols-2 gap-5 ${page.video ? "mt-6" : ""}`}>
                {cases.map((story, index) => (
                  <Reveal key={story.key} className="h-full" delay={Math.min(index, 6) * 0.08}>
                    <ResultCaseCard story={story} gallery={cases} priority={index < 2} />
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
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {/* One photograph is the photograph: no strip, no controls, no empty slot beside it. */}
            <div className="rounded-2xl overflow-hidden border border-[var(--border-control)] bg-[var(--bg-card)]">
              <Photo slot={item.slot} ratio="landscape" sizes="(max-width:1024px) 100vw, 50vw" />
              {caption ? (
                <p className="px-4 py-3 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed" dir="auto">
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
                      aria-label={language === "ar" ? thumb.slot.alt.ar : thumb.slot.alt.en}
                      aria-current={index === active || undefined}
                      className={`w-20 rounded-xl overflow-hidden border transition-[border-color,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${
                        index === active
                          ? "border-[var(--gold-end)]"
                          : "border-[var(--border-control)] opacity-70 hover:opacity-100"
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
            <h2 className={`${SECTION_HEADING} mb-5`}>{words(sectionLabel)}</h2>
            {page.specialists.length ? (
              <div className={both ? "mb-8" : ""}>
                {both ? (
                  <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("specialists", sectionLabel))}</h3>
                ) : null}
                <div className="grid sm:grid-cols-2 gap-5">
                  {page.specialists.map((doctor, index) => (
                    <Reveal key={doctor.id} className="h-full" delay={index * 0.08}>
                      <DoctorCard doctor={doctor} branches={page.allBranches} />
                    </Reveal>
                  ))}
                </div>
              </div>
            ) : null}
            {page.branches.length ? (
              <div>
                {both ? (
                  <h3 className={`${PART_HEADING} mb-4`}>{words(labelOf("branches", sectionLabel))}</h3>
                ) : null}
                <div className="grid sm:grid-cols-2 gap-5">
                  {page.branches.map((branch, index) => (
                    <Reveal key={branch.id} className="h-full" delay={index * 0.08}>
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
            <h2 className={`${SECTION_HEADING} mb-2`}>{words(sectionLabel)}</h2>
            <FaqAccordion items={page.questions} />
          </>,
        );

      case "related":
        // Drawn as the full-width strip below both columns, which is where the original put it.
        return null;
    }
  };

  return (
    <>
      <PageHero
        title={heroTitle}
        lead={heroLead}
        photo={heroPhoto}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/services", label: { ar: "الخدمات", en: "Treatments" } },
          { href: `/services/${content.key}`, label: content.name },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
            <div className={`lg:col-span-7 space-y-12 min-w-0 ${offered.length ? "" : "lg:col-span-12"}`}>
              {page.sections.map((entry) => renderSection(entry))}
            </div>

            {/* The sticky booking card the original page carried, with the two actions the
                owner chose. With neither chosen there is no card: a paragraph with no button
                under it is a gap, not an invitation. */}
            {offered.length ? (
              <aside className="lg:col-span-5">
                <div className="lg:sticky lg:top-32 rounded-2xl border border-[var(--border-control)] bg-[var(--bg-card)] p-6 shadow-sm">
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {showsWhatsapp
                      ? t(
                          "احجزي استشارتكِ لهذه الجلسة، أو أرسلي استفساركِ مباشرة على واتساب وسنرد خلال دقائق.",
                          "Book your consultation for this treatment, or send your question on WhatsApp and we reply within minutes.",
                        )
                      : t(
                          "احجزي استشارتكِ لهذه الجلسة وسنؤكد معكِ الموعد المناسب.",
                          "Book your consultation for this service and we will confirm a time that suits you.",
                        )}
                  </p>
                  <div className="mt-5 flex flex-col gap-3">
                    {offered.map((cta) =>
                      cta === "booking" ? (
                        <BookButton key={cta} treatmentId={content.key} size="lg" className="w-full" />
                      ) : cta === "whatsapp" ? (
                        <WhatsAppButton key={cta} size="lg" variant="outline" className="w-full" custom={whatsappMessage} />
                      ) : (
                        <CallButton key={cta} phone={clinic.phone} size="lg" className="w-full" />
                      ),
                    )}
                  </div>
                </div>
              </aside>
            ) : null}
          </div>

          {page.sections.some((entry) => entry.key === "related") ? (
            <div className="mt-20">
              <SectionHeading title={relatedTitle} />
              {page.relatedServices.length ? (
                <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {page.relatedServices.map((service, index) => (
                    <Reveal className="h-full" key={service.id} delay={index * 0.08}>
                      <TreatmentCard treatment={service} />
                    </Reveal>
                  ))}
                </div>
              ) : null}
              {page.relatedArticles.length ? (
                <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 ${page.relatedServices.length ? "mt-6" : "mt-10"}`}>
                  {page.relatedArticles.map((article, index) => (
                    <Reveal className="h-full" key={article.slug} delay={index * 0.08}>
                      <ArticleCard article={article} />
                    </Reveal>
                  ))}
                </div>
              ) : null}
              <div className="mt-8 text-center">
                <Link
                  href={getLocalizedHref("/services", language)}
                  className="text-sm font-bold text-[var(--gold-end)] hover:text-[var(--text-gold)] transition-colors duration-300 inline-flex items-center gap-1"
                >
                  {t("تصفحي كل الخدمات", "Browse all treatments")}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
};
