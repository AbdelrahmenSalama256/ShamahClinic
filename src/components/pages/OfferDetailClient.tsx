"use client";

import React, { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { OfferCard } from "@/components/cards/OfferCard";
import { WhatsAppButton } from "@/components/shared/Actions";
import type { Offer as UIOffer } from "@/data/offers";

interface OfferDetailClientProps {
  offer: UIOffer;
  slug: string;
  html: { ar: string; en: string };
}

export const OfferDetailClient: React.FC<OfferDetailClientProps> = ({
  offer,
  slug,
  html,
}) => {
  const { t, language } = useLanguage();
  const gallery = offer.images;
  const [shown, setShown] = useState(0);
  // A store row can lose its images between syncs, so the index is clamped to
  // what is actually here rather than trusting it.
  const active = gallery.length ? Math.min(shown, gallery.length - 1) : 0;

  const body = language === "ar" ? html.ar : html.en;

  return (
    <>
      <PageHero
        title={offer.title}
        lead={offer.subtitle}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/offers", label: { ar: "العروض", en: "Offers" } },
          { href: `/offers/${slug}`, label: offer.title },
        ]}
        photo={offer.image}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-8 lg:gap-14">
          {/* Detail body */}
          <div className="lg:col-span-7 min-w-0">
            {/* Every image this product's own store row carries. One image is just
                the photo: no thumbnails strip, no controls, no empty slot. */}
            {gallery.length > 0 && (
              <Reveal className="rounded-2xl overflow-hidden border border-[var(--border-control)] bg-[var(--bg-card)]">
                <Photo
                  slot={gallery[active]}
                  ratio="landscape"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                {gallery.length > 1 && (
                  <div className="flex flex-wrap gap-2.5 p-3">
                    {gallery.map((slot, i) => (
                      <button
                        key={`${slot.src}-${i}`}
                        type="button"
                        onClick={() => setShown(i)}
                        aria-label={language === "ar" ? slot.alt.ar : slot.alt.en}
                        aria-current={i === active || undefined}
                        className={`w-20 rounded-xl overflow-hidden border transition-[border-color,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${
                          i === active
                            ? "border-[var(--gold-end)]"
                            : "border-[var(--border-control)] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <Photo slot={slot} ratio="square" sizes="80px" />
                      </button>
                    ))}
                  </div>
                )}
              </Reveal>
            )}

            {offer.includes[language].length > 0 && (
              <Reveal
                className={`${gallery.length ? "mt-6" : ""} rounded-2xl border border-[var(--border-control)] bg-[var(--bg-card)] p-6`}
              >
                <h2 className="text-lg font-black text-[var(--text-primary)] mb-3">
                  {t("ماذا تتضمن الباقة", "What the package includes")}
                </h2>
                <ul className="grid sm:grid-cols-2 gap-2.5 text-sm text-[var(--text-secondary)]">
                  {offer.includes[language].map((inc) => (
                    <li key={inc} className="flex gap-2">
                      <span className="text-[var(--gold-end)] shrink-0" aria-hidden="true">
                        •
                      </span>
                      {inc}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {body ? (
              <Reveal className="mt-6">
                <h2 className="text-lg font-black text-[var(--text-primary)] mb-3">
                  {t("تفاصيل العرض", "Offer details")}
                </h2>
                <div
                  className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-[var(--text-primary)] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[var(--text-primary)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:space-y-1.5 [&_li]:text-[var(--text-secondary)] [&_a]:text-[var(--gold-end)] [&_a]:underline [&_strong]:text-[var(--text-primary)]"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              </Reveal>
            ) : null}

            <Reveal className="mt-8 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--border-control)] p-6">
              <h2 className="text-lg font-black text-[var(--text-primary)] mb-3">
                {t("شروط الباقات", "Package terms")}
              </h2>
              <ul className="grid sm:grid-cols-2 gap-2.5 text-sm text-[var(--text-secondary)]">
                {[
                  {
                    ar: "الأسعار بالجنيه المصري وتشمل الجلسة والاستشارة.",
                    en: "Prices are in EGP and include the session and consultation.",
                  },
                  {
                    ar: "الباقات سارية في الفروع الثلاثة حسب التوافر.",
                    en: "Packages are valid across all three branches subject to availability.",
                  },
                  {
                    ar: "يمكن ترقية أو تعديل الباقة بعد الاستشارة.",
                    en: "Packages can be upgraded or adjusted after consultation.",
                  },
                  {
                    ar: "يُفضّل الحجز المسبق خاصة للعروض الموسمية.",
                    en: "Advance booking is advised, especially for seasonal offers.",
                  },
                ].map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--gold-end)] shrink-0" aria-hidden="true">
                      •
                    </span>
                    {t(s.ar, s.en)}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex justify-center sm:justify-start">
                <WhatsAppButton />
              </div>
            </Reveal>
          </div>

          {/* Sticky purchase card */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <Reveal className="h-full min-w-0">
                <OfferCard offer={offer} />
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
