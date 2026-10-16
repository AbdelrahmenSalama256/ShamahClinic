import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd } from '@/lib/jsonld';
import { ContactClient } from '@/components/pages/ContactClient';
import { getBranchList } from '@/lib/wp';
import { getMergedTreatments } from '@/lib/wp/treatments';
import { SDSection } from '@/sitedash/runtime';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: '/contact',
    title: { ar: 'تواصلي معنا — حجز موعد واستفسار', en: 'Contact & Booking' },
    description: {
      ar: 'تواصلي مع عيادات شامه عبر واتساب أو الهاتف، أو احجزي موعدكِ مباشرة. أرقام الفروع الثلاثة في مدينة نصر والتجمع الخامس والشيخ زايد.',
      en: 'Contact Shamah Clinics on WhatsApp or by phone, or book your visit directly. Phone numbers for all three branches.',
    },
    image: '/images/clinic-reception.jpg',
  });
}

export default async function ContactPage() {
  const [branches, treatments] = await Promise.all([getBranchList(), getMergedTreatments()]);
  return (
    <>
      <SDSection id="contact.json-ld">
        <JsonLd
          data={await breadcrumbJsonLd([
            { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
            { name: { ar: 'تواصلي', en: 'Contact' }, path: '/contact' },
          ])}
        />
      </SDSection>
      <SDSection id="contact.contact-client">
        <ContactClient branches={branches} services={treatments} />
      </SDSection>
    </>
  );
}
