import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeBody } from '@/components/home/HomeBody';
import { getHome, getHeroPhotos, getHomeIntro, getPageTitle } from '@/lib/wp';
import { getMergedTreatments, getFeaturedServices } from '@/lib/wp/treatments';
import { routeLang } from '@/lib/route-lang';
import { offerToUI, cardToUIArticle } from '@/lib/wp/ui';
import { SDSection } from '@/sitedash/runtime';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: '',
    title: {
      ar: 'التجميل والليزر والعناية بالبشرة في القاهرة والجيزة',
      en: 'Home — Shamah Clinics',
    },
    description: {
      ar: 'عيادات شامه لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة. ثلاثة فروع بمدينة نصر والتجمع الخامس والشيخ زايد، بإشراف طبي نسائي كامل وأجهزة حديثة. احجزي استشارتكِ الآن.',
      en: 'Shamah Clinics for aesthetic medicine, laser and skincare in Cairo and Giza. Three branches with an all-female medical team and modern devices.',
    },
  });
}

export default async function HomePage() {
  const lang = await routeLang();
  const [home, treatments, hero, intro, services, servicesTitle] = await Promise.all([
    getHome({ offers: 4, articles: 4, lang }),
    getMergedTreatments(),
    getHeroPhotos(),
    getHomeIntro(),
    getFeaturedServices(3),
    getPageTitle('our-services', {
      ar: 'خدمات عيادات شامه التجميلية',
      en: 'Shamah Clinics aesthetic treatments',
    }),
  ]);

  return (
    <>
      <SDSection id="home.home-hero">
        <HomeHero photos={hero} branchCount={home.settings.branches} treatmentCount={treatments.length} />
      </SDSection>
      <SDSection id="home.home-body">
        <HomeBody
          intro={intro}
          services={services}
          servicesTotal={treatments.length}
          servicesTitle={servicesTitle}
          offers={home.offers.map(offerToUI)}
          articles={home.articles.map(cardToUIArticle)}
          branches={home.branches}
        />
      </SDSection>
    </>
  );
}
