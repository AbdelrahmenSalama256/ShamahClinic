"use client";

import React, { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

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
  duration = 1400,
  suffix = "",
  prefix = "",
  format,
  className = "",
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  const shown = format ? format(display) : String(display);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
};
