"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
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

  const [revealed, setRevealed] = useState(!curtain || !!reduce);
  const [loaded, setLoaded] = useState(false);

  // Safety net: if animation never fires, force reveal.
  useEffect(() => {
    if (revealed || !curtain || reduce) return;
    const t = window.setTimeout(() => setRevealed(true), 1500);
    return () => window.clearTimeout(t);
  }, [revealed, curtain, reduce]);

  const useMotion = curtain && !reduce;
  const Wrapper = useMotion ? motion.div : "div";

  const blurDataURL = blurFor(slot.src);

  return (
    <Wrapper
      ref={wrapperRef}
      {...(useMotion
        ? {
            initial: { clipPath: "inset(0 0 100% 0)" },
            whileInView: { clipPath: "inset(0 0 0% 0)" },
            viewport: { once: true, margin: "0px 0px -80px 0px" },
            transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
            onAnimationComplete: () => setRevealed(true),
          }
        : {})}
      className={`relative overflow-hidden bg-[var(--bg-secondary)] ${ratioClass[ratio]} ${
        curtain ? `photo-curtain ${revealed ? "is-revealed" : ""}` : ""
      } ${className}`}
    >
      <Image
        src={slot.src}
        alt={language === "ar" ? slot.alt.ar : slot.alt.en}
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(blurDataURL ? { placeholder: "blur" as const, blurDataURL } : {})}
        sizes={sizes}
        // Blur → sharp transition when the image finishes loading
        className={`object-cover ${imgClassName} transition-[filter,opacity,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)] ${
          loaded ? "blur-0 opacity-100" : "blur-md opacity-0"
        }`}
        style={{ objectPosition: slot.focal }}
        onLoad={() => {
          setLoaded(true);
          if (!revealed) setRevealed(true);
        }}
      />
    </Wrapper>
  );
};
