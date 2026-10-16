'use client';

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { PageHero } from '@/components/shared/PageHero';
import { Reveal } from '@/components/ui/Reveal';
import { OfferCard } from '@/components/cards/OfferCard';
import { WhatsAppButton } from '@/components/shared/Actions';
import type { Offer } from '@/data/offers';
import { images } from '@/lib/images';
import { sd } from '@/sitedash/runtime';

/** `title` is the WordPress shop page (9) heading, with an authored fallback. */
export const OffersClient: React.FC<{ offers: Offer[]; title: { ar: string; en: string } }> = ({ offers, title }) => {
  const { t } = useLanguage();

  return (
    <>
      <PageHero
        title={title}
        lead={sd('offers.offers-client.lead', {
          ar: 'باقات تجمع أكثر من جلسة بتوفير حقيقي، سارية في الفروع الثلاثة. الأسعار نهائية بدون رسوم خفية، والاستشارة تحدد ملاءمة الباقة لحالتكِ.',
          en: 'Packages combining several sessions at a real saving, valid across all three branches. Prices are final with no hidden fees; a consultation confirms suitability.',
        })}
        breadcrumbs={[
          { href: '/', label: sd('offers.offers-client.text', { ar: 'الرئيسية', en: 'Home' }) },
          { href: '/offers', label: title },
        ]}
        photo={images.interiors.treatmentRoom}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{sd('offers.offers-client.text6', t('العروض والباقات', 'Offers and packages'))}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 md:max-lg:[&>*:last-child]:col-span-2">
            {offers.map((o, i) => (
              <Reveal className="h-full" key={o.id} delay={i * 0.08}>
                <OfferCard offer={o} />
              </Reveal>
            ))}
          </div>

          {/* Terms */}
          <Reveal className="mt-10 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--border-control)] p-6">
            <h2 className="text-lg font-black text-[var(--text-primary)] mb-3">
              {sd('offers.offers-client.text7', t('شروط الباقات', 'Package terms'))}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2.5 text-sm text-[var(--text-secondary)]">
              {[
                sd('offers.offers-client.text2', {
                  ar: 'الأسعار بالجنيه المصري وتشمل الجلسة والاستشارة.',
                  en: 'Prices are in EGP and include the session and consultation.',
                }),
                sd('offers.offers-client.text3', {
                  ar: 'الباقات سارية في الفروع الثلاثة حسب التوافر.',
                  en: 'Packages are valid across all three branches subject to availability.',
                }),
                sd('offers.offers-client.text4', {
                  ar: 'يمكن ترقية أو تعديل الباقة بعد الاستشارة.',
                  en: 'Packages can be upgraded or adjusted after consultation.',
                }),
                sd('offers.offers-client.text5', {
                  ar: 'يُفضّل الحجز المسبق خاصة للعروض الموسمية.',
                  en: 'Advance booking is advised, especially for seasonal offers.',
                }),
              ].map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--gold-end)] shrink-0" aria-hidden="true">
                    {sd('offers.offers-client.text8', '•')}
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
      </section>
    </>
  );
};
