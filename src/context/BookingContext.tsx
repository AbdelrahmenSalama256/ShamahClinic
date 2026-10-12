"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BranchLite } from "@/data/branches";
import type { TreatmentOption } from "@/data/treatments";

// Split out of the initial bundle: the wizard is only reached by a click, and its
// framer-motion + form code was otherwise parsed on every page of the site.
const BookingModal = dynamic(
  () => import("@/components/booking/BookingModal").then((m) => m.BookingModal),
  { ssr: false, loading: () => null },
);

interface BookingOptions {
  treatmentId?: string;
  specialistId?: string;
  /** Offer the booking started from, shown prefilled in the summary. */
  offerName?: { ar: string; en: string };
}

interface BookingContextType {
  openBooking: (opts?: BookingOptions) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const BookingProvider: React.FC<{
  children: React.ReactNode;
  branches: BranchLite[];
  treatments: TreatmentOption[];
}> = ({ children, branches, treatments }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [bookingSession, setBookingSession] = useState(0);
  const [options, setOptions] = useState<BookingOptions>({});

  const openBooking = useCallback((opts?: BookingOptions) => {
    setOptions(opts ?? {});
    setBookingSession((session) => session + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ openBooking }), [openBooking]);

  return (
    <BookingContext.Provider value={value}>
      {children}
      {bookingSession > 0 ? (
        <BookingModal
          key={bookingSession}
          isOpen={isOpen}
          onClose={close}
          branches={branches}
          treatments={treatments}
          preSelectedTreatmentId={options.treatmentId}
          preSelectedSpecialistId={options.specialistId}
          preSelectedOffer={options.offerName}
        />
      ) : null}
    </BookingContext.Provider>
  );
};

export const useBooking = (): BookingContextType => {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
};
