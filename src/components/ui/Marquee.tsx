"use client";

import React from "react";
import { useReducedMotion, motion } from "framer-motion";

interface MarqueeProps {
  items: string[];
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({ items, className = "" }) => {
  const reduce = useReducedMotion();

  return (
    <div className={`relative ${className}`}>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 0.5,
              delay: i * 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex items-center gap-2.5 text-sm font-medium text-[var(--text-secondary)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-mid)] shrink-0" />
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
};