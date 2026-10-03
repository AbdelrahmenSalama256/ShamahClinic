"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  MotionConfig,
} from "framer-motion";
import { LanguageProvider } from "@/context/LanguageContext";
import { BookingProvider } from "@/context/BookingContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FloatingActions } from "@/components/ui/FloatingActions";
import { CtaBand } from "@/components/ui/CtaBand";

/**
 * Application shell: providers, persistent chrome (navbar / footer / floating
 * actions / booking modal) and a smooth cross-fade between routes.
 */
export const SiteShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <BookingProvider>
          <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <Navbar />

            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={pathname}
                id="main"
                className="flex-1 pt-22 lg:pt-25"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.main>
            </AnimatePresence>

            <CtaBand />
            <div className="h-px bg-gold-gradient" />

            <div className="h-0.5 bg-gold-gradient" />
            <Footer />
            <FloatingActions />
          </div>
        </BookingProvider>
      </LanguageProvider>
    </MotionConfig>
  );
};
