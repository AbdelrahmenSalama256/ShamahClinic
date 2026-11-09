import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeBody } from "@/components/home/HomeBody";
import { getHeroPhotos, getHome, getHomeHero, getHomeIntro, getHomeResultCases, getPageTitle, getTestimonials } from "@/lib/content/site";
import { getHomeWhyChooseUs } from "@/lib/content/about-page";
import { getBannerOverride } from "@/lib/content/banners";
import { getMergedTreatments, getFeaturedServices } from "@/lib/wp/treatments";
import { routeLang } from "@/lib/route-lang";
import { offerToUI, cardToUIArticle } from "@/lib/wp/ui";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "",
    ...SITE_SEO[""],
  });
}

export default async function HomePage() {
  await guardPage('home');
  const lang = await routeLang();
  const [home, treatments, hero, heroSlides, intro, whyChooseUs, services, servicesTitle, banner, storyCases, testimonials] = await Promise.all([
    getHome({ offers: 4, articles: 4, lang }),
    getMergedTreatments(),
    getHeroPhotos(),
    getHomeHero(),
    getHomeIntro(),
    getHomeWhyChooseUs(),
    getFeaturedServices(3),
    getPageTitle("our-services", {
      ar: "خدمات عيادات شامه التجميلية",
      en: "Shamah Clinics aesthetic treatments",
    }),
    getBannerOverride('home'),
    getHomeResultCases(),
    getTestimonials(),
  ]);
  // The comparison draws two pictures or nothing, so the reader hands it only the cases that
  // hold both — the `pair` the site reader already dropped the half of.
  const cases = storyCases.flatMap((story) =>
    story.pair
      ? [
          {
            key: story.key,
            headline: story.headline,
            area: story.area,
            sessions: story.sessions,
            caption: story.caption,
            pair: {
              before: story.pair.before,
              after: story.pair.after,
              beforeAlt: story.pair.beforeAlt,
              afterAlt: story.pair.afterAlt,
            },
          },
        ]
      : [],
  );

  return (
    <>
      <HomeHero
        // A saved banner replaces the slider rather than joining it: the operator who
        // picked one photo asked for that photo, not for it to lead a slideshow of ones
        // they did not choose.
        photos={banner ? [banner] : hero}
        slides={banner ? [] : heroSlides.slides}
        settings={heroSlides.settings}
        branchCount={home.settings.branches}
        treatmentCount={treatments.length}
      />
      <HomeBody
        intro={intro}
        whyChooseUs={whyChooseUs}
        services={services}
        servicesTotal={treatments.length}
        servicesTitle={servicesTitle}
        cases={cases}
        testimonials={testimonials}
        offers={home.offers.map(offerToUI)}
        articles={home.articles.map(cardToUIArticle)}
        branches={home.branches}
      />
    </>
  );
}
