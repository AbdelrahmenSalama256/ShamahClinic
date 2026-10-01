"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger delay in seconds. */
  delay?: number;
  direction?: "up" | "down" | "start" | "end" | "none";
  className?: string;
  as?: "div" | "section" | "li" | "span" | "article" | "header";
}

const offset = {
  up: { y: 28 },
  down: { y: -28 },
  start: { x: -28 },
  end: { x: 28 },
  none: {},
};

/** Scroll-triggered fade + rise reveal. Animates opacity/transform only. */
export const Reveal: React.FC<RevealProps> = ({
  children,
  delay = 0,
  direction = "up",
  className = "",
  as = "div",
}) => {
  const reduce = useReducedMotion();
  const Tag = motion[as];

  if (reduce) {
    const Plain = as as React.ElementType;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Tag
      initial={{ opacity: 0, ...offset[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Tag>
  );
};
