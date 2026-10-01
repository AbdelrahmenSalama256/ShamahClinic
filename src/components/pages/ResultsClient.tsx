"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ResultCaseCard } from "@/components/cards/ResultCaseCard";
import { GoldLink } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import { resultsData } from "@/data/results";
import { treatmentsData } from "@/data/treatments";
import { images } from "@/lib/images";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const ResultsClient: React.FC = () => {
  const { t, language, formatNumber } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  return (
    <>
      <PageHero
        title={{ ar: "النتائج وما يمكن توقعه", en: "Results & what to expect" }}
        lead={{
          ar: "نفضّل أن تكوني على بيّنة: إليك مثالاً تمثيلياً لنتيجة، وجدولاً واقعياً لبداية ظهور النتيجة ومدتها لكل خدمة.",
          en: "We prefer you to be informed: here is a representative result and a realistic table of onset and duration for each treatment.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/results", label: { ar: "النتائج", en: "Results" } },
        ]}
        photo={images.skin.after}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Honest disclosure
          <Reveal className="mb-12 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--blush-light)]/60 p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {t(
                "ملاحظة شفافة: الصور المعروضة تمثيلية لطبيعة النتائج، وسنستبدلها بصور حقيقية لعميلاتنا فور الحصول على موافقتهن الموثّقة على النشر. النتائج الفعلية تختلف من حالة لأخرى حسب نوع البشرة وعمق المشكلة والالتزام بالخطة.",
                "Transparency note: the images shown are representative of the kind of result achieved, and will be replaced with real client photos once we have documented consent to publish. Actual results vary by skin type, concern depth and adherence to the plan.",
              )}
            </p>
          </Reveal> */}

          {/* 1 col mobile → 2 cols tablet → 3 cols desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {resultsData.map((r, i) => (
              <Reveal key={r.id} delay={i * 0.08} className="h-full">
                <ResultCaseCard result={r} />
              </Reveal>
            ))}
          </div>

          {/* Realistic expectations table */}
          <div className="mt-20">
            <SectionHeading
              title={{
                ar: "متى تظهر النتيجة وكم تدوم؟",
                en: "When do results appear and how long do they last?",
              }}
              lead={{
                ar: "قيَم واقعية لكل خدمة، تُحدَّد تفاصيلها لحالتكِ في الاستشارة.",
                en: "Realistic figures per service, tailored to your case at consultation.",
              }}
            />
            <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--gold-border)]/50">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-primary)]">
                  <tr>
                    <th className="text-start font-black px-5 py-4">
                      {t("الخدمة", "Service")}
                    </th>
                    <th className="text-start font-bold px-5 py-4">
                      {t("مدة الجلسة", "Session")}
                    </th>
                    <th className="text-start font-bold px-5 py-4">
                      {t("الجلسات / المدة", "Sessions / duration")}
                    </th>
                    <th className="text-start font-bold px-5 py-4">
                      {t("تبدأ من", "From")}
                    </th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gold-border)]/30 bg-[var(--bg-card)]">
                  {treatmentsData.map((x) => (
                    <tr
                      key={x.id}
                      className="hover:bg-[var(--bg-secondary)]/40 transition-colors duration-300"
                    >
                      <td className="px-5 py-4 font-bold text-[var(--text-primary)]">
                        {t(x.name.ar, x.name.en)}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {t(x.duration.ar, x.duration.en)}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {t(x.sessionsRecommended.ar, x.sessionsRecommended.en)}
                      </td>
                      <td className="px-5 py-4 text-[var(--gold-end)] font-bold tabular-nums">
                        {formatNumber(x.priceStartingAt)} {t("ج.م", "EGP")}
                      </td>
                      <td className="px-5 py-4 text-end">
                        <Link
                          href={getLocalizedHref(
                            `/treatments/${x.id}`,
                            language,
                          )}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300"
                        >
                          {t("التفاصيل", "Details")}
                          <Arrow className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-10 text-center">
            <GoldLink href="/services" withArrow>
              {t("تصفحي الخدمات", "Browse treatments")}
            </GoldLink>
          </div>
        </div>
      </section>
    </>
  );
};
