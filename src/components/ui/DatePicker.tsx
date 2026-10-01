"use client";

import React, { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import "react-day-picker/dist/style.css";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string; // YYYY-MM-DD
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, min }) => {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value) : undefined;
  const minDate = min ? new Date(min) : undefined;

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full p-3 rounded-xl border border-gray-300 focus:border-[var(--gold-mid)] focus:ring-1 focus:ring-[var(--gold-mid)] text-sm font-semibold outline-none bg-white flex items-center justify-between cursor-pointer hover:border-[var(--gold-border)] transition-colors"
      >
        <span className={selected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {selected ? format(selected, "dd/MM/yyyy") : t("اختاري التاريخ", "Pick a date")}
        </span>
        <CalendarIcon className="w-4 h-4 text-[var(--gold-mid)]" />
      </button>

      {/* Popup */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-50 mt-2 p-4 rounded-2xl bg-white border border-[var(--gold-border)]/50 shadow-2xl rdp-shamah"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 end-3 w-6 h-6 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--blush-light)] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close calendar"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(date) => {
                if (date) {
                  onChange(format(date, "yyyy-MM-dd"));
                  setOpen(false);
                }
              }}
              disabled={minDate ? { before: minDate } : undefined}
              dir={language === "ar" ? "rtl" : "ltr"}
              showOutsideDays
            />

            {/* Footer actions */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--gold-border)]/40">
              <button
                type="button"
                onClick={() => {
                  onChange(format(new Date(), "yyyy-MM-dd"));
                  setOpen(false);
                }}
                className="text-xs font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors cursor-pointer"
              >
                {t("اليوم", "Today")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {t("إغلاق", "Close")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};