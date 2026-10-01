"use client";

import React, { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { Photo } from "@/components/ui/Photo";
import { Counter } from "@/components/ui/Counter";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { images } from "@/lib/images";
import { treatmentsData } from "@/data/treatments";
import { verifiedFacts } from "@/data/placeholders";

export const HomeHero: React.FC = () => {
  const { t, language, formatNumber } = useLanguage();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    ["0%", reduce ? "0%" : "12%"],
  );

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* Full-bleed background image */}
      <div className="relative w-full min-h-[85vh] max-h-[880px] overflow-hidden flex">
        <motion.div style={{ y }} className="absolute inset-0">
          <Photo
            slot={images.hero}
            ratio="hero"
            priority
            className="!aspect-auto !h-full w-full"
            imgClassName="object-cover w-full h-full"
            curtain
            sizes="100vw"
          />
        </motion.div>

        {/* Gradient overlay: dark at bottom for text legibility, lighter at top to show the photo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />

        {/* Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-start pt-32 pb-0 sm:pt-40 sm:pb-24 lg:pt-44 lg:pb-28">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.28em] text-[var(--gold-start)]"
          >
            {t(
              "عيادات شامه · القاهرة والجيزة",
              "Shamah Clinics · Cairo & Giza",
            )}
          </motion.p>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.05,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-4 text-[28px] sm:text-5xl lg:text-[64px] font-black leading-[1.05] tracking-tight text-white max-w-3xl"
          >
            {t("بشرةٌ تستحق ", "Skin that deserves ")}
            <span className="text-[var(--gold-start)]">
              {t("عنايةً صادقة", "honest care")}
            </span>
            {t("، بأيدي نسائية خبيرة", ", in expert female hands")}
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-5 text-sm sm:text-base lg:text-lg leading-relaxed text-white/75 max-w-2xl"
          >
            {t(
              "نبدأ كل حالة باستشارة وتحليل واضح، ونستخدم أجهزة حديثة ومنتجات أصلية، مع طاقم طبي نسائي بالكامل وخصوصية تامة في ثلاثة فروع.",
              "Every case starts with a clear consultation and analysis, using modern devices and authentic products, with an all-female medical team and full privacy across three branches.",
            )}
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-8 flex flex-row sm:flex-row gap-3 sm:gap-4"
          >
            <BookButton size="lg" />
            <WhatsAppButton
              size="lg"
              variant="outline"
              className="!text-white !border-white/40 !bg-white/5 hover:!bg-white/15 backdrop-blur-sm"
            />
          </motion.div>

          {/* Verified figures */}
          <motion.dl
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="mt-12 grid grid-cols-3 gap-4 sm:gap-8 border-t border-white/15 pt-6 max-w-2xl w-full sm:w-auto"
          >
            <div>
              <dt className="text-[10px] sm:text-xs text-white/55 uppercase tracking-wider">
                {t("فروع", "Branches")}
              </dt>
              <dd className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-start)]">
                <Counter
                  value={verifiedFacts.branchCount}
                  format={formatNumber}
                />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] sm:text-xs text-white/55 uppercase tracking-wider">
                {t("خدمة تجميلية", "Treatments")}
              </dt>
              <dd className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-start)]">
                <Counter value={treatmentsData.length} format={formatNumber} />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] sm:text-xs text-white/55 uppercase tracking-wider">
                {t("طاقم نسائي", "Female staff")}
              </dt>
              <dd className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-start)]">
                <Counter value={100} suffix="٪" format={formatNumber} />
              </dd>
            </div>
          </motion.dl>
        </div>
      </div>
    </section>
  );
};
