"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { BookingModal } from "@/components/booking/BookingModal";

interface BookingOptions {
  treatmentId?: string;
  specialistId?: string;
}

interface BookingContextType {
  openBooking: (opts?: BookingOptions) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<BookingOptions>({});

  const openBooking = useCallback((opts?: BookingOptions) => {
    setOptions(opts ?? {});
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ openBooking }), [openBooking]);

  return (
    <BookingContext.Provider value={value}>
      {children}
      <BookingModal
        isOpen={isOpen}
        onClose={close}
        preSelectedTreatmentId={options.treatmentId}
        preSelectedSpecialistId={options.specialistId}
      />
    </BookingContext.Provider>
  );
};

export const useBooking = (): BookingContextType => {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
};
