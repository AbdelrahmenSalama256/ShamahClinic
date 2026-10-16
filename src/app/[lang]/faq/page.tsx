import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/jsonld';
import { FaqClient } from '@/components/pages/FaqClient';
import { getPageTitle } from '@/lib/wp';
import { SDSection } from '@/sitedash/runtime';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: '/faq',
    title: { ar: 'الأسئلة الشائعة عن الليزر والتجميل', en: 'Frequently Asked Questions' },
    description: {
      ar: 'إجابات على أسئلتك عن ليزر إزالة الشعر، الفيلر والبوتوكس، الهيدرافيشل والتقشير، والحجز في عيادات شامه: عدد الجلسات، الألم، الأمان، الأسعار وطريقة تحديدها.',
      en: 'Answers to your questions about laser hair removal, fillers and Botox, HydraFacial and peels, and booking at Shamah: sessions, pain, safety and how prices are set.',
    },
    image: '/images/consultation.jpg',
  });
}

export default async function FaqPage() {
  const title = await getPageTitle('faq', {
    ar: 'الأسئلة الشائعة',
    en: 'Frequently asked questions',
  });
  return (
    <>
      <SDSection id="faq.json-ld">
        <JsonLd
          data={[
            await faqJsonLd(),
            await breadcrumbJsonLd([
              { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
              { name: { ar: 'الأسئلة الشائعة', en: 'FAQ' }, path: '/faq' },
            ]),
          ]}
        />
      </SDSection>
      <SDSection id="faq.faq-client">
        <FaqClient title={title} />
      </SDSection>
    </>
  );
}
