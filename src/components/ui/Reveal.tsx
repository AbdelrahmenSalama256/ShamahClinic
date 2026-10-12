"use client";

import React, { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

type Direction = "up" | "down" | "start" | "end" | "none";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger delay in seconds. */
  delay?: number;
  direction?: Direction;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "article" | "header";
  /**
   * `scroll` (default) waits for the element to enter the viewport. `mount` plays the
   * same fade+rise through a CSS animation at first paint, which is what above-the-fold
   * content needs: the server HTML is already visible and nothing waits on JavaScript.
   */
  trigger?: "scroll" | "mount";
}

/** The shifts live in CSS so the hidden state costs no JavaScript to describe. */
const armedClass: Record<Direction, string> = {
  up: "reveal-arm-up",
  down: "reveal-arm-down",
  start: "reveal-arm-start",
  end: "reveal-arm-end",
  none: "",
};

const mountClass: Record<Direction, string> = {
  up: "reveal-mount-up",
  down: "reveal-mount-down",
  start: "reveal-mount-start",
  end: "reveal-mount-end",
  none: "reveal-mount-none",
};

/**
 * Fade + rise reveal.
 *
 * The server HTML is always *visible*. framer-motion's `initial={{ opacity: 0 }}`
 * shipped below-the-fold photography and article text invisible until hydration
 * finished, and Lighthouse charged that to the LCP as 3–4 s of "render delay". So the
 * hidden state is armed by the client, and only for elements that are not on screen
 * yet — what the user can already see is never taken away from them.
 */
export const Reveal: React.FC<RevealProps> = ({
  children,
  delay = 0,
  direction = "up",
  className = "",
  as = "div",
  trigger = "scroll",
}) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const Plain = as as React.ElementType;

  useLayoutEffect(() => {
    if (trigger !== "scroll" || reduce) return;
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) return;

    el.classList.add("reveal-scroll", "reveal-armed", armedClass[direction]);
    if (delay) el.style.transitionDelay = `${delay}s`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.remove("reveal-armed", armedClass[direction]);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [trigger, reduce, direction, delay]);

  if (trigger === "mount") {
    return (
      <Plain
        className={`${mountClass[direction]} ${className}`}
        style={delay ? { animationDelay: `${delay}s` } : undefined}
      >
        {children}
      </Plain>
    );
  }

  return (
    <Plain className={className} ref={ref as never}>
      {children}
    </Plain>
  );
};
