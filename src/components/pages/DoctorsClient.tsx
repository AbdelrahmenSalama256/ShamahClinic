"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { DoctorCard } from "@/components/cards/DoctorCard";
import { specialistsData } from "@/data/specialists";
import { images } from "@/lib/images";

export const DoctorsClient: React.FC = () => {
  const { t, formatNumber } = useLanguage();

  return (
    <>
      <PageHero
        title={{ ar: "الفريق الطبي في شامه", en: "Shamah's medical team" }}
        lead={{
          ar: "طبيبات وأخصائيات يقُدن كل قسم بأنفسهن، ويشرفن على كل حالة من الاستشارة حتى المتابعة. طاقم نسائي بالكامل في الفروع الثلاثة.",
          en: "Female doctors and specialists who personally lead each department and oversee every case from consultation to follow-up, across all three branches.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/doctors", label: { ar: "الأطباء", en: "Doctors" } },
        ]}
        photo={images.interiors.consultation}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="sr-only">{t("فريق الطبيبات", "Our doctors")}</h2>
          <div className="grid sm:grid-cols-3 gap-4 lg:gap-8">
            {specialistsData.map((doc, i) => (
              <Reveal className="h-full" key={doc.id} delay={i * 0.1}>
                <DoctorCard doctor={doc} />
              </Reveal>
            ))}
          </div>

          {/* Consultation process — editorial numbered band */}
          <div className="mt-12 lg:mt-16 grid lg:grid-cols-12 gap-10 items-center rounded-3xl bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/40 p-8 lg:p-12">
            <div className="lg:col-span-5">
              <Reveal>
                <Photo slot={images.interiors.treatmentRoom} ratio="landscape" curtain sizes="(max-width:1024px) 100vw, 40vw" />
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              <Reveal>
                <h2 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
                  {t("كيف تسير زيارتكِ الأولى؟", "How your first visit works")}
                </h2>
              </Reveal>
              <ol className="mt-6 space-y-5">
                {[
                  { ar: "استقبال وتحليل بشرة مكتوب يوضح نوعها ومشاكلها.", en: "Welcome and a written skin analysis defining type and concerns." },
                  { ar: "مناقشة الأهداف والخيارات الواقعية مع الطبيبة دون أي ضغط للحجز.", en: "Discussing realistic goals and options with the doctor, with no pressure to book." },
                  { ar: "خطة جلسات واضحة بالتكلفة وعدد الجلسات والنتيجة المتوقعة.", en: "A clear session plan with cost, number of visits and expected outcome." },
                  { ar: "متابعة بعد الجلسة لضبط النتيجة والاطمئنان على استجابة بشرتكِ.", en: "Post-session follow-up to refine results and check your skin's response." },
                ].map((s, i) => (
                  <Reveal as="li" key={i} delay={i * 0.06} className="flex gap-4">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-white border border-[var(--gold-border)]/60 text-[var(--gold-end)] font-black text-sm flex items-center justify-center tabular-nums">
                      {formatNumber(i + 1)}
                    </span>
                    <p className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)] pt-1">{t(s.ar, s.en)}</p>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
