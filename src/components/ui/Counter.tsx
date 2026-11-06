"use client";

import React, { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { milliseconds } from "@/lib/motion";

interface CounterProps {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  format?: (n: number) => string;
  className?: string;
}

/** Animated count-up for real, verified figures only. */
export const Counter: React.FC<CounterProps> = ({
  value,
  duration = milliseconds("count"),
  suffix = "",
  prefix = "",
  format,
  className = "",
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      // The reference's own cubic-out, kept verbatim: the house curve would front-load
      // the count, and this is the one animation whose pacing reads as a number.
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  // Reduced motion shows the final number without the count-up.
  const display = reduce ? (inView ? value : 0) : animated;
  const shown = format ? format(display) : String(display);
  return (
    <span ref={ref} className={className}>
      {/* The count-up is decorative and only reaches the real figure once it is on
          screen, so the verified value itself is always in the markup. */}
      <span aria-hidden="true">
        {prefix}
        {shown}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {format ? format(value) : value}
        {suffix}
      </span>
    </span>
  );
};
