'use client';

import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { PageHero } from '@/components/shared/PageHero';
import { Reveal } from '@/components/ui/Reveal';
import { TreatmentCard } from '@/components/cards/TreatmentCard';
import { treatmentCategories, type Treatment, type TreatmentCategory } from '@/data/treatments';
import { images } from '@/lib/images';
import { sd } from '@/sitedash/runtime';

interface Props {
  /** WordPress page 696 heading, with an authored fallback. */
  title: { ar: string; en: string };
  /** WordPress-titled catalog (pages/696). */
  treatments: Treatment[];
}

type FilterCategory = {
  id: TreatmentCategory | 'all' | 'other';
  name: { ar: string; en: string };
};

export const TreatmentsClient: React.FC<Props> = ({ title, treatments }) => {
  const { t } = useLanguage();
  const [active, setActive] = useState<TreatmentCategory | 'all' | 'other'>('all');

  const availableCategories = useMemo(() => {
    const categories: FilterCategory[] = treatmentCategories.filter(
      (category) => category.id === 'all' || treatments.some((treatment) => treatment.category === category.id),
    );
    if (treatments.some((treatment) => treatment.category === null)) {
      categories.push({
        id: 'other',
        name: sd('treatments.treatments-client.text', { ar: 'خدمات أخرى', en: 'Other services' }),
      });
    }
    return categories;
  }, [treatments]);

  const filtered = useMemo(
    () =>
      active === 'all'
        ? treatments
        : active === 'other'
          ? treatments.filter((treatment) => treatment.category === null)
          : treatments.filter((treatment) => treatment.category === active),
    [active, treatments],
  );

  return (
    <>
      <PageHero
        title={title}
        lead={sd('treatments.treatments-client.lead', {
          ar: 'جلسات ليزر، عناية بالبشرة، حقن تجميلي، وبروتوكولات نضارة ومكافحة شيخوخة — كلها بإشراف طبي نسائي، والسعر يُحدَّد بعد الفحص في الاستشارة.',
          en: 'Laser, skincare, injectables and rejuvenation protocols — all under female medical supervision, with the price set at consultation after examination.',
        })}
        breadcrumbs={[
          { href: '/', label: sd('treatments.treatments-client.text2', { ar: 'الرئيسية', en: 'Home' }) },
          { href: '/services', label: title },
        ]}
        photo={images.treatments.laser}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2.5 mb-10">
            {availableCategories.map((c) => {
              const isActive = active === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  aria-pressed={isActive}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-[background-color,color,transform,border-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${
                    isActive
                      ? 'bg-gold-gradient border-transparent shadow-md'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-control)] hover:border-[var(--border-control)] hover:text-[var(--gold-end)]'
                  }`}
                >
                  {t(c.name.ar, c.name.en)}
                </button>
              );
            })}
          </div>

          <h2 className="sr-only">{sd('treatments.treatments-client.text3', t('خدماتنا', 'Our services'))}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8 max-lg:[&>*:last-child]:col-span-2">
            {filtered.map((tr, i) => (
              <Reveal className="h-full" key={tr.id} delay={(i % 3) * 0.08}>
                <TreatmentCard treatment={tr} />
              </Reveal>
            ))}
          </div>

          <p className="mt-12 text-center text-sm text-[var(--text-secondary)]">
            {sd(
              'treatments.treatments-client.text4',
              t(
                'لم تنشر العيادة قائمة أسعار ثابتة: السعر يُحدَّد بدقة بعد الفحص حسب المنطقة وحالة البشرة وعدد الجلسات، لذلك تعرض بطاقات الخدمات زر الحجز بدل رقم معلن. باقات العروض المنشورة في صفحة العروض أسعارها كما في المتجر.',
                'The clinic publishes no fixed price list: the price is set precisely after examination, by area, skin condition and number of sessions, so service cards show the booking action instead of a posted figure. Offer packages on the Offers page carry their store prices.',
              ),
            )}
          </p>
        </div>
      </section>
    </>
  );
};
