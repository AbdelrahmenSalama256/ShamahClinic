"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TreatmentCard } from "@/components/cards/TreatmentCard";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { Treatment } from "@/data/treatments";
import { Clock, Repeat, Wallet, Check } from "lucide-react";

export const TreatmentDetailClient: React.FC<{
  treatment: Treatment;
  /** Cards WordPress names for the "related services" strip. */
  related: Treatment[];
}> = ({ treatment, related }) => {
  const { t, language, formatNumber } = useLanguage();

  const body = language === "ar" ? treatment.body?.ar : treatment.body?.en;

  // A service whose only source is a WordPress section (page 696) publishes no
  // session length, count or price, so those facts are not shown rather than
  // shown empty.
  const facts = [
    treatment.duration.ar && {
      icon: Clock,
      label: { ar: "مدة الجلسة", en: "Session length" },
      value: treatment.duration,
    },
    treatment.sessionsRecommended.ar && {
      icon: Repeat,
      label: { ar: "الجلسات الموصى بها", en: "Recommended sessions" },
      value: treatment.sessionsRecommended,
    },
    treatment.priceStartingAt !== null && {
      icon: Wallet,
      label: { ar: "السعر يبدأ من", en: "Price from" },
      value: {
        ar: `${formatNumber(treatment.priceStartingAt)} ج.م`,
        en: `EGP ${treatment.priceStartingAt}`,
      },
    },
  ].filter(Boolean) as {
    icon: typeof Clock;
    label: { ar: string; en: string };
    value: { ar: string; en: string };
  }[];

  const idealFor =
    treatment.idealFor.ar || treatment.idealFor.en ? treatment.idealFor : null;
  const lists = {
    benefits: treatment.benefits[language].length > 0,
    steps: treatment.steps[language].length > 0,
    aftercare: treatment.aftercare[language].length > 0,
  };

  return (
    <>
      <PageHero
        title={treatment.name}
        lead={treatment.tagline}
        photo={treatment.image}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/services", label: { ar: "الخدمات", en: "Treatments" } },
          { href: `/treatments/${treatment.id}`, label: treatment.name },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Key facts */}
          {facts.length > 0 && (
            <Reveal className="grid sm:grid-cols-3 gap-4 mb-10">
              {facts.map((f) => (
                <div
                  key={f.label.en}
                  className="flex items-start gap-3 p-5 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--gold-border)]/40"
                >
                  <f.icon className="w-5 h-5 text-[var(--gold-mid)] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {t(f.label.ar, f.label.en)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-primary)] leading-snug">
                      {t(f.value.ar, f.value.en)}
                    </p>
                  </div>
                </div>
              ))}
            </Reveal>
          )}

          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
            {/* Main content */}
            <div className="lg:col-span-7 space-y-12">
              <Reveal>
                <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-4">
                  {t("عن هذه الجلسة", "About this treatment")}
                </h2>
                {body ? (
                  <div
                    className="text-base leading-relaxed text-[var(--text-secondary)] [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-[var(--text-primary)] [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[var(--text-primary)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:space-y-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:space-y-1.5 [&_li]:text-[var(--text-secondary)] [&_a]:text-[var(--gold-end)] [&_a]:underline [&_strong]:text-[var(--text-primary)]"
                    dangerouslySetInnerHTML={{ __html: body }}
                  />
                ) : (
                  <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                    {t(treatment.description.ar, treatment.description.en)}
                  </p>
                )}
                {idealFor && (
                  <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
                    <span className="font-bold text-[var(--text-primary)]">
                      {t("مناسبة لـ: ", "Ideal for: ")}
                    </span>
                    {t(idealFor.ar, idealFor.en)}
                  </p>
                )}
              </Reveal>

              {lists.benefits && (
                <Reveal>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                    {t("الفوائد", "Benefits")}
                  </h2>
                  <ul className="grid sm:grid-cols-2 gap-3">
                    {treatment.benefits[language].map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 text-sm text-[var(--text-primary)]"
                      >
                        <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {lists.steps && (
                <Reveal>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                    {t("خطوات الجلسة", "How the session works")}
                  </h2>
                  <ol className="space-y-4">
                    {treatment.steps[language].map((s, i) => (
                      <li key={i} className="flex gap-4">
                        <span className="w-8 h-8 shrink-0 rounded-full bg-[var(--bg-card)] border border-[var(--gold-border)]/50 text-[var(--gold-end)] font-black text-sm flex items-center justify-center tabular-nums">
                          {formatNumber(i + 1)}
                        </span>
                        <p className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)] pt-1">
                          {s}
                        </p>
                      </li>
                    ))}
                  </ol>
                </Reveal>
              )}

              {lists.aftercare && (
                <Reveal>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                    {t("العناية بعد الجلسة", "Aftercare")}
                  </h2>
                  <ul className="space-y-2.5 border-s-2 border-[var(--gold-border)] ps-5">
                    {treatment.aftercare[language].map((a) => (
                      <li
                        key={a}
                        className="text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}
            </div>

            {/* Sticky booking aside */}
            <aside className="lg:col-span-5">
              <div className="lg:sticky lg:top-32 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)] p-6 shadow-sm">
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t(
                    "احجزي استشارتكِ لهذه الجلسة، أو أرسلي استفساركِ مباشرة على واتساب وسنرد خلال دقائق.",
                    "Book your consultation for this treatment, or send your question on WhatsApp and we reply within minutes.",
                  )}
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <BookButton
                    treatmentId={treatment.id}
                    size="lg"
                    className="w-full"
                  />
                  <WhatsAppButton
                    size="lg"
                    variant="outline"
                    className="w-full !text-[var(--text-primary)] !border-[var(--gold-border)] !bg-white hover:!bg-[var(--blush-light)]"
                    custom={
                      language === "ar"
                        ? `مرحباً عيادات شامه، أرغب في الاستفسار عن جلسة ${treatment.name.ar}.`
                        : `Hello Shamah Clinics, I would like to ask about ${treatment.name.en}.`
                    }
                  />
                </div>
                <p className="mt-5 text-xs text-[var(--text-muted)] leading-relaxed">
                  {t(
                    "الأسعار استرشادية وتُحدد نهائياً بعد الاستشارة حسب الحالة والمنطقة.",
                    "Prices are indicative and finalised after consultation based on your case and area.",
                  )}
                </p>
              </div>
            </aside>
          </div>

          {/* Related treatments */}
          {related.length > 0 && (
            <div className="mt-20">
              <SectionHeading
                title={{ ar: "خدمات ذات صلة", en: "Related treatments" }}
              />
              <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {related.map((r, i) => (
                  <Reveal className="h-full" key={r.id} delay={i * 0.08}>
                    <TreatmentCard treatment={r} />
                  </Reveal>
                ))}
              </div>
              <div className="mt-8 text-center">
                <Link
                  href={getLocalizedHref("/services", language)}
                  className="text-sm font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300 inline-flex items-center gap-1"
                >
                  {t("تصفحي كل الخدمات", "Browse all treatments")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
};
