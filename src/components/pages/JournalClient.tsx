"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { journalData } from "@/data/journal";
import { images } from "@/lib/images";

export const JournalClient: React.FC = () => {
  const { t } = useLanguage();

  return (
    <>
      <PageHero
        title={{ ar: "مدونة شامه", en: "Shamah Blog" }}
        lead={{
          ar: "مقالات طبية مبسطة تكتبها طبيباتنا: تصحيح للمفاهيم الشائعة، شرح للجلسات، وروتينات عناية واقعية تناسب مناخ مصر.",
          en: "Clear medical articles written by our doctors: correcting common myths, explaining treatments, and realistic care routines for Egypt's climate.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/blogs", label: { ar: "المدونة", en: "Blogs" } },
        ]}
        photo={images.journal.routine}
      />

      <section className="py-5 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{t("أحدث المدونات", "Latest blog posts")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
            {journalData.map((a, i) => (
              <Reveal className="h-full" key={a.slug} delay={i * 0.08}>
                <ArticleCard article={a} />
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-[var(--text-secondary)]">
            {t(
              "محتوى المدونة للتوعية العامة ولا يغني عن الاستشارة الطبية. لحالتكِ الخاصة، احجزي استشارة مع إحدى طبيباتنا.",
              "Blog content is for general awareness and does not replace medical advice. For your specific case, book a consultation with one of our doctors.",
            )}
          </p>
        </div>
      </section>
    </>
  );
};
