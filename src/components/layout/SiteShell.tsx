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
import { ThemeProvider } from "@/context/ThemeContext";
import { BookingProvider } from "@/context/BookingContext";
import { SpecialistsProvider } from "@/context/SpecialistsContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FloatingActions } from "@/components/ui/FloatingActions";
import { CtaBand } from "@/components/ui/CtaBand";
import { PageViewTracker } from "@/components/tracking/PageViewTracker";
import type { BranchLite } from "@/data/branches";
import type { NavItem } from "@/data/nav";
import type { Specialist } from "@/data/specialists";
import type { TreatmentOption } from "@/data/treatments";
import type { CopyBundle } from "@/lib/copy/shared";
import { motionTransition } from "@/lib/motion";

/**
 * Application shell: providers, persistent chrome (navbar / footer / floating
 * actions / booking modal) and a smooth cross-fade between routes.
 *
 * The menu, the team and the branch cards all arrive as props from the console's
 * lists; the snapshot is only the fallback the readers use while nothing is published.
 */
export const SiteShell: React.FC<{
  children: React.ReactNode;
  branches: BranchLite[];
  treatments: TreatmentOption[];
  nav: NavItem[];
  specialists: Specialist[];
  /** Top-level hrefs the owner has hidden; the header and footer stop linking to them. */
  hiddenPaths: string[];
  /** Show the footer's "Cookie settings" control; only when tags are configured to load. */
  cookieSettings?: boolean;
  /** The owner's wording, read for this page's language on the server. */
  copy?: CopyBundle;
}> = ({ children, branches, treatments, nav, specialists, hiddenPaths, cookieSettings = false, copy }) => {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider copy={copy}>
        <ThemeProvider>
          <SpecialistsProvider specialists={specialists}>
            <BookingProvider branches={branches} treatments={treatments} specialists={specialists}>
            <PageViewTracker />
            <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
              <Navbar nav={nav} hiddenPaths={hiddenPaths} />

              <AnimatePresence mode="wait" initial={false}>
                <motion.main
                  key={pathname}
                  id="main"
                  className="flex-1 pt-10 lg:pt-25"
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -8 }}
                  transition={motionTransition("settle")}
                >
                  {children}
                </motion.main>
              </AnimatePresence>

              <CtaBand />
              <div className="h-px bg-gold-gradient" />

              <div className="h-0.5 bg-gold-gradient" />
              <Footer branches={branches} nav={nav} hiddenPaths={hiddenPaths} cookieSettings={cookieSettings} />
              <FloatingActions />
            </div>
          </BookingProvider>
          </SpecialistsProvider>
        </ThemeProvider>
      </LanguageProvider>
    </MotionConfig>
  );
};
