"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { getLocalizedHref } from "@/lib/locale";
import type { BranchDetail } from "@/data/branches";
import { branchesData } from "@/data/branches";
import { clinicData } from "@/data/clinic";
import {
  MapPin,
  Phone,
  Clock,
  Check,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

export const BranchDetailClient: React.FC<{ branch: BranchDetail }> = ({
  branch,
}) => {
  const { t, language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const others = branchesData.filter((b) => b.id !== branch.id);

  return (
    <>
      <PageHero
        title={branch.name}
        lead={branch.intro}
        photo={branch.image}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/branches", label: { ar: "الفروع", en: "Branches" } },
          { href: `/branches/${branch.id}`, label: branch.name },
        ]}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
            {/* Details */}
            <div className="lg:col-span-7 space-y-10">
              <Reveal>
                <div className="rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)] p-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-[var(--gold-mid)] mt-0.5 shrink-0" />
                    <div>
                      <h2 className="font-black text-[var(--text-primary)] mb-1">
                        {t("العنوان", "Address")}
                      </h2>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {t(branch.address.ar, branch.address.en)}
                      </p>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        <span className="font-bold">
                          {t("علامة مميزة: ", "Landmark: ")}
                        </span>
                        {t(branch.landmark.ar, branch.landmark.en)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-[var(--gold-border)]/40 pt-5">
                    <Phone className="w-5 h-5 text-[var(--gold-mid)] mt-0.5 shrink-0" />
                    <div>
                      <h2 className="font-black text-[var(--text-primary)] mb-1">
                        {t("هاتف الفرع", "Branch phone")}
                      </h2>
                      <a
                        href={`tel:${branch.phone}`}
                        dir="ltr"
                        className="text-sm font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300"
                      >
                        {branch.phone}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-[var(--gold-border)]/40 pt-5">
                    <Clock className="w-5 h-5 text-[var(--gold-mid)] mt-0.5 shrink-0" />
                    <div>
                      <h2 className="font-black text-[var(--text-primary)] mb-1">
                        {t("مواعيد العمل", "Opening hours")}
                      </h2>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {clinicData.workingHours[language]}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal>
                <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-5">
                  {t("ما يميز هذا الفرع", "What this branch offers")}
                </h2>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {branch.features[language].map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-[var(--text-primary)]"
                    >
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gold-mid)]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal>
                <div className="rounded-2xl overflow-hidden">
                  <Photo
                    slot={branch.image}
                    ratio="wide"
                    curtain
                    sizes="(max-width:1024px) 100vw, 55vw"
                  />
                </div>
              </Reveal>
            </div>

            {/* Booking aside */}
            <aside className="lg:col-span-5">
              <div className="lg:sticky lg:top-32 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-secondary)]/60 p-6">
                <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">
                  {t("احجزي في فرع", "Book at")}{" "}
                  {t(branch.name.ar, branch.name.en)}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5">
                  {t(
                    "اختاري الخدمة والوقت المناسب، وسيتواصل فريق الفرع معكِ لتأكيد الموعد.",
                    "Choose your treatment and preferred time, and the branch team will contact you to confirm.",
                  )}
                </p>
                <div className="flex flex-col gap-3">
                  <BookButton size="lg" className="w-full" />
                  <WhatsAppButton
                    size="lg"
                    variant="outline"
                    className="w-full !text-[var(--text-primary)] !border-[var(--gold-border)] !bg-white hover:!bg-[var(--blush-light)]"
                    custom={
                      language === "ar"
                        ? `مرحباً عيادات شامه، أرغب في حجز موعد بفرع ${branch.name.ar}.`
                        : `Hello Shamah Clinics, I would like to book at the ${branch.name.en} branch.`
                    }
                  />
                  <a
                    href={`tel:${branch.phone}`}
                    dir="ltr"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[var(--gold-border)] text-[var(--gold-end)] font-bold text-sm py-3 hover:bg-[var(--blush-light)] transition-[background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                  >
                    <Phone className="w-4 h-4" />
                    {branch.phone}
                  </a>
                </div>
              </div>
            </aside>
          </div>

          {/* Other branches */}
          <div className="mt-20">
            <h2 className="text-xl font-black text-[var(--text-primary)] mb-6">
              {t("فروع أخرى", "Other branches")}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {others.map((o) => (
                <Link
                  key={o.id}
                  href={getLocalizedHref(`/branches/${o.id}`, language)}
                  className="group flex items-center gap-4 p-4 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                >
                  <div className="w-20 h-16 rounded-xl overflow-hidden shrink-0">
                    <Photo
                      slot={o.image}
                      ratio="landscape"
                      className="!aspect-auto !h-full"
                      sizes="96px"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-[var(--text-primary)] group-hover:text-[var(--gold-end)] transition-colors duration-300">
                      {t(o.name.ar, o.name.en)}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t(o.area.ar, o.area.en)}
                    </p>
                  </div>
                  <Arrow className="w-5 h-5 text-[var(--gold-mid)] shrink-0 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
