"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import type { FaqItem } from "@/data/faq";
import { Plus, Minus } from "lucide-react";

export const FaqAccordion: React.FC<{ items: FaqItem[] }> = ({ items }) => {
  const { t, language, formatNumber } = useLanguage();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="border-t border-[var(--gold-border)]/40">
      {items.map((item, i) => {
        const isOpen = open === item.id;
        return (
          <div
            key={item.id}
            className="border-b border-[var(--gold-border)]/40"
          >
            <button
              onClick={() => setOpen(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="group w-full flex items-start gap-4 sm:gap-6 py-6 sm:py-7 text-start cursor-pointer"
            >
              {/* Number */}
              <span
                className={`text-2xl sm:text-3xl font-black tabular-nums leading-none pt-0.5 shrink-0 transition-colors duration-300 ${
                  isOpen
                    ? "text-[var(--gold-end)]"
                    : "text-[var(--text-muted)] group-hover:text-[var(--gold-end)]"
                }`}
              >
                {formatNumber(String(i + 1).padStart(2, "0"))}
              </span>

              {/* Question + Answer */}
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-base sm:text-lg lg:text-xl font-bold leading-snug transition-colors duration-300 ${
                    isOpen
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-primary)]/85 group-hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t(item.question.ar, item.question.en)}
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduce ? undefined : { height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.35,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <p
                        className="pt-4 text-sm sm:text-base leading-relaxed text-[var(--text-secondary)] max-w-2xl"
                        lang={language}
                      >
                        {t(item.answer.ar, item.answer.en)}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Icon */}
              <span
                className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-[background-color,border-color,color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
                  isOpen
                    ? "bg-gold-gradient border border-transparent text-white"
                    : "bg-transparent border border-[var(--gold-border)]/50 text-[var(--gold-mid)] group-hover:border-[var(--gold-mid)] group-hover:text-[var(--gold-end)]"
                }`}
              >
                {isOpen ? (
                  <Minus className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
