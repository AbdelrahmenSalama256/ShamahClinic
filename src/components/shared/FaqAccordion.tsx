"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { Plus, Minus } from "lucide-react";
import { track } from "@/lib/tracking/first-party";
import { motionTransition } from "@/lib/motion";

/**
 * One row of the accordion: a question, its answer, and the id that keeps it open.
 *
 * The questions page hands over `FaqItem`s from the questions list; a service page hands over
 * the questions written on its own row, which belong to no list and have no category to claim.
 * Both are drawn here, so the shape is the words and nothing else.
 */
export interface FaqEntry {
  id: string;
  question: { ar: string; en: string };
  answer: { ar: string; en: string };
}

export const FaqAccordion: React.FC<{ items: readonly FaqEntry[] }> = ({ items }) => {
  const { t, language, formatNumber } = useLanguage();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="border-t border-[var(--border-control)]">
      {items.map((item, i) => {
        const isOpen = open === item.id;
        return (
          <div
            key={item.id}
            className="border-b border-[var(--border-control)]"
          >
            <button
              onClick={() => {
                const next = isOpen ? null : item.id;
                setOpen(next);
                if (next) track("faq_open", { question: t(item.question.ar, item.question.en) });
              }}
              aria-expanded={isOpen}
              className="group w-full flex items-start gap-4 sm:gap-6 py-6 sm:py-7 text-start cursor-pointer"
            >
              {/* Number */}
              <span
                className={`text-2xl sm:text-3xl font-black num [--num-digits:2] leading-none pt-0.5 shrink-0 transition-colors duration-hover ${
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
                  className={`text-base sm:text-lg lg:text-xl font-bold leading-snug transition-colors duration-hover ${
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
                      transition={motionTransition("settle")}
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
                className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-[background-color,border-color,color,transform] duration-hover ease-brand ${
                  isOpen
                    ? "bg-gold-gradient border border-transparent"
                    : "bg-transparent border border-[var(--border-control)] text-[var(--text-gold)] group-hover:border-[var(--border-control)] group-hover:text-[var(--gold-end)]"
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
