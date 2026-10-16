import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd } from '@/lib/jsonld';
import { TreatmentsClient } from '@/components/pages/TreatmentsClient';
import { getMergedTreatments } from '@/lib/wp/treatments';
import { getPageTitle } from '@/lib/wp';
import { SDSection } from '@/sitedash/runtime';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: '/services',
    title: {
      ar: 'الخدمات التجميلية والليزر',
      en: 'Aesthetic & Laser Services',
    },
    description: {
      ar: 'تعرفي على خدمات عيادات شامه: إزالة الشعر بالليزر، الفيلر والبوتوكس، الهيدرافيشل، التقشير الكيميائي، البلازما PRP، والعناية بالبشرة. تفاصيل كل جلسة وأسعارها وعدد الجلسات.',
      en: 'Explore Shamah Clinics services: laser hair removal, fillers and Botox, HydraFacial, chemical peels, PRP and skincare. Details, prices and session counts.',
    },
    image: '/images/treatment-laser.jpg',
  });
}

export default async function TreatmentsPage() {
  const [treatments, title] = await Promise.all([
    getMergedTreatments(),
    getPageTitle('our-services', {
      ar: 'خدمات عيادات شامه التجميلية',
      en: 'Shamah Clinics aesthetic treatments',
    }),
  ]);
  return (
    <>
      <SDSection id="treatments.json-ld">
        <JsonLd
          data={await breadcrumbJsonLd([
            { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
            { name: { ar: 'الخدمات', en: 'Services' }, path: '/services' },
          ])}
        />
      </SDSection>
      <SDSection id="treatments.treatments-client">
        <TreatmentsClient treatments={treatments} title={title} />
      </SDSection>
    </>
  );
}
