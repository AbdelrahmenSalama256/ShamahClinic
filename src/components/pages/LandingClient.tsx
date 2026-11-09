"use client";

/**
 * One ad landing page: the promise, the proof points, the offer, and the booking form as
 * the way out. Nothing on it links away to browse — a visitor who came from an ad has one
 * decision to make, and every block here is there to make it easier.
 */
import React from "react";
import { Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { OfferCard } from "@/components/cards/OfferCard";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { FaqAccordion, type FaqEntry } from "@/components/shared/FaqAccordion";
import { Photo } from "@/components/ui/Photo";
import { Reveal } from "@/components/ui/Reveal";
import { toPhotoSlot } from "@/lib/wp/ui-helpers";
import type { LandingPage } from "@/lib/content/site";
import type { Offer } from "@/data/offers";
import type { Treatment } from "@/data/treatments";

export const LandingClient: React.FC<{
  page: LandingPage;
  offers: Offer[];
  treatments: Treatment[];
  faq: FaqEntry[];
}> = ({ page, offers, treatments, faq }) => {
  const { t, language } = useLanguage();
  // Owner-typed words are data, not catalog copy: the page language, else the other one.
  const words = (pair: { ar: string; en: string }) => (language === "ar" ? pair.ar || pair.en : pair.en || pair.ar);
  const bullets = language === "ar" ? (page.bullets.ar.length ? page.bullets.ar : page.bullets.en) : page.bullets.en.length ? page.bullets.en : page.bullets.ar;
  const cta = page.cta.ar || page.cta.en ? { ar: page.cta.ar || page.cta.en, en: page.cta.en || page.cta.ar } : undefined;

  return (
    <>
      <section className="py-8 lg:py-14 bg-[var(--bg-primary)]" data-landing={page.key}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 lg:gap-12 items-center ${page.image ? "lg:grid-cols-2" : ""}`}>
          <Reveal className="min-w-0">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-[var(--text-primary)]" dir="auto">
              {words(page.headline)}
            </h1>
            {(page.subhead.ar || page.subhead.en) && (
              <p className="mt-4 text-base sm:text-lg leading-relaxed text-[var(--text-secondary)]" dir="auto">
                {words(page.subhead)}
              </p>
            )}
            {bullets.length > 0 && (
              <ul className="mt-6 space-y-3">
                {bullets.map((point, index) => (
                  <li key={index} className="flex items-start gap-3 text-sm sm:text-base text-[var(--text-primary)]" dir="auto">
                    <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-[var(--text-gold)]" aria-hidden="true" />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <BookButton size="lg" label={cta} />
              <WhatsAppButton size="lg" variant="outline" />
            </div>
          </Reveal>
          {page.image && (
            <Reveal className="min-w-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
                <Photo slot={toPhotoSlot(page.image, page.headline)} sizes="(min-width: 1024px) 50vw, 100vw" priority />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {offers.length > 0 && (
        <section className="py-8 lg:py-12 bg-[var(--bg-secondary)]/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {offers.map((offer) => (
              <Reveal key={offer.slug} className="h-full min-w-0">
                <OfferCard offer={offer} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {treatments.length > 0 && (
        <section className="py-8 lg:py-12 bg-[var(--bg-primary)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {treatments.map((treatment) => (
              <TreatmentCard key={treatment.id} treatment={treatment} />
            ))}
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className="py-8 lg:py-12 bg-[var(--bg-secondary)]/60">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("أسئلة شائعة", "Frequently asked questions")}</h2>
            <div className="mt-4">
              <FaqAccordion items={faq} />
            </div>
          </div>
        </section>
      )}

      <section className="py-10 lg:py-14 bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]" dir="auto">
            {words(page.headline)}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <BookButton size="lg" label={cta} />
            <WhatsAppButton size="lg" variant="outline" />
          </div>
        </div>
      </section>
    </>
  );
};
