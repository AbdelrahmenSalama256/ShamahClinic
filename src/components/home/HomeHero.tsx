"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Counter } from "@/components/ui/Counter";
import { BookButton, WhatsAppButton } from "@/components/shared/Actions";
import { images, type PhotoSlot } from "@/lib/images";
import { getLocalizedHref, type Locale } from "@/lib/locale";
import type { HeroSettings, HeroSlide } from "@/lib/hero/types";

/**
 * One frame the hero can draw, whatever wrote it.
 *
 * A slide from the console and a photograph scraped from the imported page are the same
 * thing to this component: a picture, alt text, and optional copy. That is what lets the
 * table stay empty on a fresh database without the homepage changing at all.
 */
interface Frame {
  key: string;
  image: string;
  imageMobile: string | null;
  alt: { ar: string; en: string };
  heading: { ar: string; en: string } | null;
  sub: { ar: string; en: string } | null;
  cta: { label: { ar: string; en: string }; href: { ar: string; en: string } } | null;
}

function frameOfPhoto(photo: PhotoSlot): Frame {
  return {
    key: photo.src,
    image: photo.src,
    imageMobile: null,
    alt: photo.alt,
    heading: null,
    sub: null,
    cta: null,
  };
}

function frameOfSlide(slide: HeroSlide): Frame {
  return {
    key: slide.id,
    image: slide.image,
    imageMobile: slide.imageMobile,
    alt: slide.alt,
    heading: slide.heading,
    sub: slide.sub,
    cta: slide.cta,
  };
}

/** `photos` is the WordPress slider or the authored photo, used only when the table is empty. */
export const HomeHero: React.FC<{
  photos: PhotoSlot[];
  slides: HeroSlide[];
  settings: HeroSettings;
  branchCount: number;
  treatmentCount: number;
}> = ({ photos, slides, settings, branchCount, treatmentCount }) => {
  const { t, language, direction, formatNumber } = useLanguage();
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

  const frames: Frame[] = (slides.length > 0
    ? slides.map(frameOfSlide)
    : photos.length > 0
      ? photos.map(frameOfPhoto)
      : [frameOfPhoto(images.hero)]
  ).filter((frame) => frame.image.trim() !== "");

  // `images.hero` is the last resort above, so this is non-empty in practice; the guard
  // keeps a database row with a cleared address from producing a frame with no picture.
  const safe = frames.length > 0 ? frames : [];

  const multiple = safe.length > 1 && !reduce;
  const count = safe.length;
  const [index, setIndex] = useState(0);
  // A new length is a new list: React's own "adjust state when props change" pattern,
  // which costs no extra render compared with resetting from an effect.
  const [seenCount, setSeenCount] = useState(count);
  if (count !== seenCount) {
    setSeenCount(count);
    setIndex(0);
  }
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Frames after the first are mounted only once the browser has painted, so the LCP
  // image is the only one competing for the first render. The layers are absolutely
  // stacked, so nothing below the first slide ever shifts layout.
  const [painted, setPainted] = useState(false);

  const active = safe[Math.min(index, Math.max(count - 1, 0))];
  const paused = !settings.autoplay || userPaused || (settings.pauseOnHover && hovered) || hidden;

  useEffect(() => {
    const id = requestAnimationFrame(() => setPainted(true));
    return () => cancelAnimationFrame(id);
  }, [multiple]);

  useEffect(() => {
    if (!multiple || count < 2 || paused) return;
    const id = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next < count) return next;
        return settings.loop ? 0 : current;
      });
    }, settings.intervalMs);
    return () => window.clearInterval(id);
  }, [count, multiple, paused, settings.intervalMs, settings.loop]);

  // A tab in the background is not looking at the photographs, and a timer that keeps
  // ticking there means the hero is somewhere else when the person comes back.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((current) => {
        const next = current + delta;
        if (settings.loop) return (next + count) % count;
        return Math.min(count - 1, Math.max(0, next));
      });
    },
    [count, settings.loop],
  );

  const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (count < 2) return;
    if (event.key === nextKey) {
      event.preventDefault();
      go(1);
    } else if (event.key === previousKey) {
      event.preventDefault();
      go(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setIndex(count - 1);
    }
  }

  const touch = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>): void {
    const point = event.touches[0];
    if (point) touch.current = { x: point.clientX, y: point.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>): void {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    // A rightward swipe moves forward in RTL, matching the arrows.
    const forward = direction === "rtl" ? dx > 0 : dx < 0;
    go(forward ? 1 : -1);
  }

  const pick = (value: { ar: string; en: string } | null): string =>
    value ? (language === "ar" ? value.ar || value.en : value.en || value.ar) : "";

  const heading = pick(active?.heading ?? null);
  const sub = pick(active?.sub ?? null);
  const ctaLabel = pick(active?.cta?.label ?? null);
  const ctaRaw = pick(active?.cta?.href ?? null);
  const ctaHref =
    ctaRaw === ""
      ? ""
      : ctaRaw.startsWith("/")
        ? getLocalizedHref(ctaRaw, language as Locale)
        : ctaRaw;
  const ctaExternal = ctaHref.startsWith("http");

  const altFor = (frame: Frame): string => (language === "ar" ? frame.alt.ar || frame.alt.en : frame.alt.en || frame.alt.ar);

  const fadeMs = reduce ? 0 : settings.fadeMs;

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* Full-bleed background image */}
      <div className="relative w-full min-h-[85vh] max-h-[880px] overflow-hidden flex">
        <motion.div style={{ y }} className="absolute inset-0">
          <div
            className="absolute inset-0 overflow-hidden"
            role="region"
            aria-roledescription="carousel"
            aria-label={t("صور العيادة", "Clinic photographs")}
            tabIndex={count > 1 ? 0 : undefined}
            onKeyDown={onKeyDown}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {safe.map((frame, i) => {
              const isFirst = i === 0;
              const visible = i === index;
              const alt = altFor(frame);
              if (!isFirst && !painted) return null;
              return (
                <div
                  key={frame.key}
                  aria-hidden={!visible}
                  className="absolute inset-0"
                  style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeMs}ms ease-in-out` }}
                >
                  {frame.imageMobile ? (
                    <>
                      <Image
                        src={frame.imageMobile}
                        alt={alt}
                        fill
                        priority={isFirst}
                        loading={isFirst ? "eager" : "lazy"}
                        sizes="(max-width: 639px) 100vw, 1px"
                        className="object-cover sm:hidden"
                      />
                      <Image
                        src={frame.image}
                        alt=""
                        aria-hidden
                        fill
                        priority={isFirst}
                        loading={isFirst ? "eager" : "lazy"}
                        sizes="(min-width: 640px) 100vw, 1px"
                        className="hidden object-cover sm:block"
                      />
                    </>
                  ) : (
                    <Image
                      src={frame.image}
                      alt={alt}
                      fill
                      priority={isFirst}
                      loading={isFirst ? "eager" : "lazy"}
                      sizes="100vw"
                      className="object-cover"
                    />
                  )}
                </div>
              );
            })}

            {/* Gradient overlay: dark at bottom for text legibility, lighter at top to show the photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" aria-hidden />

            {count > 1 && (
              <div className="absolute z-20 bottom-5 end-4 sm:bottom-6 sm:end-6 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserPaused((value) => !value)}
                  aria-label={userPaused ? t("تشغيل العرض", "Play slideshow") : t("إيقاف العرض", "Pause slideshow")}
                  aria-pressed={userPaused}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-start)]"
                >
                  {userPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                </button>

                {settings.arrows && (
                  <>
                    <button
                      type="button"
                      onClick={() => go(-1)}
                      aria-label={t("الصورة السابقة", "Previous slide")}
                      className="grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-start)]"
                    >
                      {direction === "rtl" ? <ArrowRight className="h-4 w-4" aria-hidden /> : <ArrowLeft className="h-4 w-4" aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => go(1)}
                      aria-label={t("الصورة التالية", "Next slide")}
                      className="grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold-start)]"
                    >
                      {direction === "rtl" ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                    </button>
                  </>
                )}

                {settings.dots && (
                  <div className="flex items-center gap-1.5">
                    {safe.map((frame, i) => (
                      <button
                        key={frame.key}
                        type="button"
                        onClick={() => setIndex(i)}
                        aria-label={t("الصورة {0}", "Slide {0}", i + 1)}
                        aria-current={i === index ? "true" : undefined}
                        className="grid h-11 w-6 place-items-center focus-visible:outline-none"
                      >
                        <span
                          className="block h-2 rounded-full transition-all duration-300"
                          style={{
                            width: i === index ? 22 : 8,
                            background: i === index ? "var(--gold-start)" : "rgba(255,255,255,.55)",
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Spoken only when the slideshow is not moving by itself: an automatic change
                announced on every tick is noise, a change the person asked for is not. */}
            <p className="sr-only" aria-live={settings.autoplay ? "off" : "polite"}>
              {count > 1 ? t("الصورة {0} من {1}", "Slide {0} of {1}", index + 1, count) : ""}
            </p>
          </div>
        </motion.div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-start pt-32 pb-0 sm:pt-40 sm:pb-24 lg:pt-44 lg:pb-28">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-[11px] sm:text-xs font-bold uppercase tracking-eyebrow text-[var(--gold-start)]"
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
            className="mt-4 text-[28px] sm:text-5xl lg:text-[64px] font-black leading-[1.05] tracking-tight text-[var(--text-on-dark)] max-w-3xl"
          >
            {heading !== "" ? (
              heading
            ) : (
              <>
                {t("بشرةٌ تستحق ", "Skin that deserves ")}
                <span className="text-[var(--gold-start)]">
                  {t("عنايةً صادقة", "honest care")}
                </span>
                {t("، بأيدي نسائية خبيرة", ", in expert female hands")}
              </>
            )}
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-5 text-sm sm:text-base lg:text-lg leading-relaxed text-[var(--text-on-dark-muted)] max-w-2xl"
          >
            {sub !== ""
              ? sub
              : t(
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
            {ctaHref !== "" && ctaLabel !== "" && (
              <a
                href={ctaHref}
                {...(ctaExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient px-4 py-2 text-base font-bold shadow-md transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:shadow-lg"
              >
                {ctaLabel}
              </a>
            )}
            <BookButton size="lg" />
            <WhatsAppButton size="lg" variant="onDark" className="backdrop-blur-sm" />
          </motion.div>

          {/* Verified figures */}
          <motion.dl
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="mt-12 grid grid-cols-3 gap-4 sm:gap-8 border-t border-[var(--border-on-dark)] pt-6 max-w-2xl w-full sm:w-auto"
          >
            <div>
              <dt className="text-[10px] sm:text-xs text-[var(--text-on-dark-muted)] uppercase tracking-wider">
                {t("فروع", "Branches")}
              </dt>
              <dd className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-start)]">
                <Counter value={branchCount} format={formatNumber} />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] sm:text-xs text-[var(--text-on-dark-muted)] uppercase tracking-wider">
                {t("خدمة تجميلية", "Treatments")}
              </dt>
              <dd className="mt-1 text-2xl sm:text-3xl font-black text-[var(--gold-start)]">
                <Counter value={treatmentCount} format={formatNumber} />
              </dd>
            </div>
            <div>
              <dt className="text-[10px] sm:text-xs text-[var(--text-on-dark-muted)] uppercase tracking-wider">
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
