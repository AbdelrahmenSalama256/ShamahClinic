"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { useReducedMotion } from "framer-motion";
import type { PhotoSlot } from "@/lib/images";
import { blurFor } from "@/lib/blurs";
import { useLanguage } from "@/context/LanguageContext";

export type PhotoRatio = "square" | "portrait" | "landscape" | "wide" | "hero";

const ratioClass: Record<PhotoRatio, string> = {
  square: "aspect-[4/3] sm:aspect-square",
  portrait: "aspect-[3/2] sm:aspect-[3/4] lg:aspect-[4/5]",
  landscape: "aspect-[3/2]",
  wide: "aspect-[16/9] lg:aspect-[21/9]",
  hero: "aspect-[4/3] sm:aspect-[3/4] lg:aspect-[4/5]",
};

interface PhotoProps {
  slot: PhotoSlot;
  ratio?: PhotoRatio;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  /** Curtain/mask reveal on scroll. */
  curtain?: boolean;
}

export const Photo: React.FC<PhotoProps> = ({
  slot,
  ratio = "landscape",
  priority = false,
  className = "",
  imgClassName = "",
  sizes = "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw",
  curtain = false,
}) => {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // `idle` = no curtain (server HTML, priority images, reduced motion, and anything
  // already on screen when the client starts). `armed` is the masked, hidden state —
  // applied only once the client knows the frame is off screen, so a photo is never
  // withheld from the first paint the way a CSS-hidden one was.
  const [mode, setMode] = useState<"idle" | "armed" | "shown">("idle");
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!curtain || priority || reduce || !element) return;

    const rect = element.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) return;

    setMode("armed");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMode("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [curtain, priority, reduce]);

  const blurDataURL = blurFor(slot.src);
  const curtainClass =
    mode === "armed" ? "photo-curtain" : mode === "shown" ? "photo-curtain is-revealed" : "";
  const masked = mode === "armed" || (curtain && !loaded);

  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden bg-[var(--bg-secondary)] ${ratioClass[ratio]} ${curtainClass} ${className}`}
    >
      {/* WordPress returns posts with no featured image (featured_media 0): the frame
          keeps its aspect ratio and no <img> is emitted, so nothing renders broken. */}
      {slot.src ? (
        <Image
          src={slot.src}
          alt={language === "ar" ? slot.alt.ar : slot.alt.en}
          fill
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          {...(blurDataURL ? { placeholder: "blur" as const, blurDataURL } : {})}
          sizes={sizes}
          // The LCP image ships with no filter or opacity at all: a `blur(0)`
          // transition still puts it on a filtered layer and costs it ~0.8 s of
          // render delay. next/image's blur placeholder gives the same crossfade.
          className={
            priority
              ? `object-cover ${imgClassName}`
              : `object-cover ${imgClassName} transition-[filter,opacity,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${
                  masked ? "blur-md opacity-0" : "blur-0 opacity-100"
                }`
          }
          style={{ objectPosition: slot.focal }}
          onLoad={() => {
            setLoaded(true);
          }}
        />
      ) : null}
    </div>
  );
};
