import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { OfferCard } from "@/components/cards/OfferCard";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { HomeBody } from "@/components/home/HomeBody";
import { images, type PhotoSlot } from "@/lib/images";
import { routeLang } from "@/lib/route-lang";
import type { Treatment } from "@/data/treatments";
import type { Offer } from "@/data/offers";
import type { Article } from "@/data/journal";

/**
 * Development-only fixture page for `scripts/test-missing-fields.mjs`: it renders the
 * real card and section components against records with fields missing, empty, very
 * long or in the wrong language, so the guards that keep those states from breaking
 * the layout are covered by an assertion instead of by reading the JSX.
 *
 * It is never built into production output (`notFound()` when NODE_ENV is production)
 * and is noindex while it exists.
 */

export const metadata: Metadata = { robots: "noindex,nofollow" };
export const dynamic = "force-dynamic";

const LONG_AR =
  "جلسة تقشير كيميائي متدرجة تُطبَّق بحساب دقيق للمدة والتركيز، تُتابعة بالجلسات وتُقيَّم بعد كل جلسة، مع تعليمات cares منزلية واضحة للالتزام بها";
const LONG_EN =
  "A progressive chemical peeling session calculated precisely by duration and concentration, followed up session by session and assessed after every visit, with clear home-care instructions to follow";

const slot: PhotoSlot = { ...images.interiors.reception };
const noPhoto: PhotoSlot = { ...slot, src: "", alt: { ar: "", en: "" } };

function treatment(over: Partial<Treatment>): Treatment {
  return {
    id: "fixture-service",
    category: "skincare",
    categoryName: { ar: "عناية بالبشرة", en: "Skincare" },
    name: { ar: "خدمة تجريبية", en: "Fixture service" },
    tagline: { ar: "وصف قصير.", en: "A short intro." },
    description: { ar: "", en: "" },
    benefits: { ar: [], en: [] },
    steps: { ar: [], en: [] },
    aftercare: { ar: [], en: [] },
    idealFor: { ar: "", en: "" },
    duration: { ar: "", en: "" },
    sessionsRecommended: { ar: "", en: "" },
    priceStartingAt: 900,
    image: slot,
    ...over,
  };
}

function offer(over: Partial<Offer>): Offer {
  return {
    id: "fixture-offer",
    slug: "fixture-offer",
    services: null,
    image: slot,
    images: [slot],
    badge: { ar: "الأكثر طلباً", en: "Most booked" },
    title: { ar: "باقة تجريبية", en: "Fixture package" },
    subtitle: { ar: "وصف.", en: "Subtitle." },
    includes: { ar: ["جلسة عناية"], en: ["one session"] },
    originalPrice: 1200,
    discountedPrice: 900,
    savingsPercentage: 25,
    currency: "ج.م",
    validUntil: { ar: "حتى نهاية الشهر", en: "Until the end of the month" },
    href: { ar: "/offers/fixture", en: "/en/offers/fixture" },
    popular: false,
    ...over,
  };
}

function article(over: Partial<Article>): Article {
  return {
    slug: "fixture-article",
    title: { ar: "مقال تجريبي", en: "Fixture article" },
    excerpt: { ar: "مقتطف.", en: "An excerpt." },
    authorId: "nourhan-el-masry",
    date: { ar: "١٢ أكتوبر ٢٠٢٦", en: "12 Oct 2026" },
    isoDate: "2026-10-12",
    readMinutes: 4,
    image: slot,
    tags: { ar: [], en: [] },
    sections: [],
    ...over,
  };
}

type Bi = { ar: string; en: string };

/** HomeBody's branch row is its own inline shape: id, names, phone, image path. */
const branch = (over: {
  id: string;
  name: Bi;
  area: Bi;
  address: Bi;
  phone: string;
  image: string | null;
}) => over;

export default async function PreviewMissingFieldsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const lang = await routeLang();

  const cases: Array<{
    id: string;
    note: string;
    /** The case whose correct output is nothing at all. */
    expectEmpty?: boolean;
    body: ReactNode;
  }> = [
    {
      id: "heading-no-title",
      note: "a heading whose title is empty renders nothing at all",
      body: (
        <>
          <SectionHeading index="01" title={{ ar: "", en: "" }} lead={{ ar: "x", en: "x" }} />
          <SectionHeading
            index="02"
            title={{ ar: "عنوان", en: "A title" }}
            lead={{ ar: "", en: "" }}
          />
          <SectionHeading index="03" title={{ ar: "عنوان", en: "A title" }} />
        </>
      ),
    },
    {
      id: "card-no-photo",
      note: "a service WordPress gives no featured image for",
      body: <TreatmentCard treatment={treatment({ id: "f-no-photo", image: noPhoto })} />,
    },
    {
      id: "card-no-tagline-no-price",
      note: "a service with no intro, no price and no category",
      body: (
        <TreatmentCard
          treatment={treatment({
            id: "f-bare",
            tagline: { ar: "", en: "" },
            priceStartingAt: null,
            categoryName: { ar: "", en: "" },
            category: null,
          })}
        />
      ),
    },
    {
      id: "card-long-text",
      note: "titles and intros far longer than the card was designed for",
      body: (
        <TreatmentCard
          treatment={treatment({
            id: "f-long",
            name: { ar: LONG_AR, en: LONG_EN },
            tagline: { ar: LONG_AR, en: LONG_EN },
          })}
        />
      ),
    },
    {
      id: "card-wrong-language",
      note: "the Arabic field holds English text, the English field holds Arabic",
      body: (
        <TreatmentCard
          treatment={treatment({
            id: "f-lang",
            name: { ar: "Laser Hair Removal", en: "إزالة الشعر بالليزر" },
          })}
        />
      ),
    },
    {
      id: "offer-empty",
      note: "an offer row with no badge, subtitle, list, validity, price or image",
      body: (
        <OfferCard
          offer={offer({
            id: "f-offer-empty",
            image: noPhoto,
            images: [],
            badge: { ar: "", en: "" },
            subtitle: { ar: "", en: "" },
            includes: { ar: [], en: [] },
            originalPrice: 0,
            discountedPrice: 0,
            savingsPercentage: 0,
            validUntil: { ar: "", en: "" },
            currency: undefined,
          })}
        />
      ),
    },
    {
      id: "offer-popular-no-badge",
      note: "flagged popular but the dashboard left the badge empty",
      body: (
        <OfferCard
          offer={offer({ id: "f-offer-badge", badge: { ar: "", en: "" }, popular: true })}
        />
      ),
    },
    {
      id: "offer-long-text",
      note: "very long title, subtitle and package list",
      body: (
        <OfferCard
          offer={offer({
            id: "f-offer-long",
            title: { ar: LONG_AR, en: LONG_EN },
            subtitle: { ar: LONG_AR, en: LONG_EN },
            includes: {
              ar: Array.from({ length: 7 }, (_, i) => `${LONG_AR.slice(0, 40)} ${i + 1}`),
              en: Array.from({ length: 7 }, (_, i) => `Included session ${i + 1} with follow up and review`),
            },
          })}
        />
      ),
    },
    {
      id: "article-empty",
      note: "a post with no image, no excerpt, no reading time and an unknown author",
      body: (
        <ArticleCard
          article={article({
            slug: "f-empty",
            image: noPhoto,
            excerpt: { ar: "", en: "" },
            readMinutes: 0,
            authorId: "not-a-doctor",
          })}
        />
      ),
    },
    {
      id: "article-long-text",
      note: "a post whose title and excerpt run long",
      body: (
        <ArticleCard
          article={article({
            slug: "f-long",
            title: { ar: LONG_AR, en: LONG_EN },
            excerpt: { ar: LONG_AR, en: LONG_EN },
          })}
        />
      ),
    },
    {
      id: "home-empty-lists",
      note: "Home with every WordPress list empty: no band, no heading, no View-all",
      expectEmpty: true,
      body: (
        <HomeBody
          intro={{ title: { ar: "", en: "" }, lead: { ar: "", en: "" } }}
          services={[]}
          servicesTotal={0}
          servicesTitle={{ ar: "", en: "" }}
          cases={[]}
          offers={[]}
          articles={[]}
          branches={[]}
        />
      ),
    },
    {
      id: "home-four-cards",
      note: "Home asked for four cards everywhere: three render, one View-all each",
      body: (
        <HomeBody
          intro={{ title: { ar: "عنوان", en: "Intro title" }, lead: { ar: "مقدمة", en: "Lead" } }}
          services={[1, 2, 3, 4].map((n) => treatment({ id: `f-h-${n}`, name: { ar: `خدمة ${n}`, en: `Service ${n}` } }))}
          servicesTotal={12}
          servicesTitle={{ ar: "خدماتنا", en: "Our services" }}
          cases={[]}
          offers={[1, 2, 3, 4].map((n) => offer({ id: `f-ho-${n}`, title: { ar: `باقة ${n}`, en: `Package ${n}` } }))}
          articles={[1, 2, 3, 4].map((n) => article({ slug: `f-ha-${n}`, title: { ar: `مقال ${n}`, en: `Article ${n}` } }))}
          branches={[1, 2, 3, 4].map((n) =>
            branch({
              id: `f-hb-${n}`,
              name: { ar: `فرع ${n}`, en: `Branch ${n}` },
              area: { ar: `القاهرة ${n}`, en: `Cairo ${n}` },
              address: { ar: `عنوان ${n}`, en: `Address ${n}` },
              phone: "01121880908",
              image: "/images/interiors/reception.jpg",
            }),
          )}
        />
      ),
    },
    {
      id: "home-branch-without-photo",
      note: "a branch card whose WordPress image is missing",
      body: (
        <HomeBody
          intro={{ title: { ar: "عنوان", en: "Intro title" }, lead: { ar: "مقدمة", en: "Lead" } }}
          services={[treatment({ id: "f-hb-svc" })]}
          servicesTotal={1}
          servicesTitle={{ ar: "خدماتنا", en: "Our services" }}
          cases={[]}
          offers={[]}
          articles={[]}
          branches={[
            branch({
              id: "f-hb-1",
              name: { ar: "فرع بلا صورة", en: "Branch without a photo" },
              area: { ar: "", en: "" },
              address: { ar: "", en: "" },
              phone: "",
              image: null,
            }),
          ]}
        />
      ),
    },
  ];

  return (
    <div data-preview-lang={lang}>
      {cases.map((c) => (
        <section
          key={c.id}
          data-case={c.id}
          data-note={c.note}
          {...(c.expectEmpty ? { "data-expect-empty": "true" } : {})}
        >
          {c.body}
        </section>
      ))}
    </div>
  );
}
