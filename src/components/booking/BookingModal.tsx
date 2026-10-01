"use client";

import React, { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { clinicData } from "@/data/clinic";
import { treatmentsData } from "@/data/treatments";
import { specialistsData } from "@/data/specialists";
import {
  X,
  Check,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Download,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DatePicker } from "@/components/ui/DatePicker";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedTreatmentId?: string;
  preSelectedSpecialistId?: string;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preSelectedTreatmentId,
  preSelectedSpecialistId,
}) => {
  const { language, t, formatNumber } = useLanguage();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string>(() => {
    return preSelectedTreatmentId || treatmentsData[0].id;
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    clinicData.branches[0].id,
  );
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string>(
    () => {
      return preSelectedSpecialistId || "any";
    },
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("morning");

  const [fullName, setFullName] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [bookingRef, setBookingRef] = useState<string>("");

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const currentTreatment =
    treatmentsData.find((t) => t.id === selectedTreatmentId) ||
    treatmentsData[0];
  const currentBranch =
    clinicData.branches.find((b) => b.id === selectedBranchId) ||
    clinicData.branches[0];
  const currentSpecialist = specialistsData.find(
    (s) => s.id === selectedSpecialistId,
  );

  const timeSlotLabels = {
    morning: {
      ar: "الفترة الصباحية (١٠:٠٠ ص – ٢:٠٠ ظ)",
      en: "Morning (10:00 AM – 2:00 PM)",
    },
    afternoon: {
      ar: "فترة الظهيرة (٢:٠٠ ظ – ٦:٠٠ م)",
      en: "Afternoon (2:00 PM – 6:00 PM)",
    },
    evening: {
      ar: "الفترة المسائية (٦:٠٠ م – ١٠:٠٠ م)",
      en: "Evening (6:00 PM – 10:00 PM)",
    },
  };

  const validateStep4 = (): boolean => {
    const errs: { [key: string]: string } = {};
    if (!fullName.trim() || fullName.trim().length < 3) {
      errs.fullName =
        language === "ar"
          ? "يرجى كتابة الاسم بالكامل (٣ أحرف على الأقل)"
          : "Full name must be at least 3 characters";
    }

    const cleanPhone = phoneNumber.replace(/\s+/g, "");
    const phoneRegex = /^(01[0125][0-9]{8}|\+201[0125][0-9]{8})$/;
    if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
      errs.phoneNumber =
        language === "ar"
          ? "يرجى إدخال رقم هاتف مصري صحيح (مثال: 010xxxxxxxx)"
          : "Please enter a valid Egyptian mobile number";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 4) {
      if (!validateStep4()) return;
      const ref = "SHM-" + Math.floor(10000 + Math.random() * 90000);
      setBookingRef(ref);
      setCurrentStep(5);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1 && currentStep < 5) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const downloadIcsCalendar = () => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const dateFormatted = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;

    const startTime = `${dateFormatted}T090000Z`;
    const endTime = `${dateFormatted}T100000Z`;

    const summary = `موعد في عيادات شامه: ${currentTreatment.name.ar}`;
    const description = `حجز مؤكد في عيادات شامه (${currentBranch.name.ar}). رقم المرجع: ${bookingRef}. هاتف الفرع: ${currentBranch.phone}`;
    const location = currentBranch.address.ar;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Shamah Clinics//Appointment Booking//AR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${bookingRef}@shamahclinics.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${startTime}`,
      `DTEND:${endTime}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", `shamah-appointment-${bookingRef}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getWhatsAppConfirmationUrl = () => {
    const text = encodeURIComponent(
      `مرحباً عيادات شامه، قمت بطلب حجز عبر الموقع الإلكتروني:\n` +
        `• رقم المرجع: ${bookingRef}\n` +
        `• الاسم: ${fullName}\n` +
        `• الهاتف: ${phoneNumber}\n` +
        `• الخدمة: ${currentTreatment.name.ar}\n` +
        `• الفرع: ${currentBranch.name.ar}\n` +
        `• التاريخ: ${selectedDate}\n` +
        `• الفترة: ${timeSlotLabels[selectedTimeSlot as keyof typeof timeSlotLabels].ar}\n` +
        (currentSpecialist ? `• الطبيبة: ${currentSpecialist.name.ar}\n` : "") +
        `أرجو تأكيد الموعد معي. شكراً لكم!`,
    );
    return `https://wa.me/201020697427?text=${text}`;
  };

  const ArrowPrev = language === "ar" ? ChevronRight : ChevronLeft;
  const ArrowNext = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="booking-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md overflow-y-auto"
        >
          <motion.div
            key="booking-modal-box"
            initial={{ opacity: 0, scale: 0.94, y: 24, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.96, y: 12, filter: "blur(4px)" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-2xl border border-[var(--gold-border)] shadow-2xl overflow-hidden relative my-auto"
          >
            {/* Modal Header */}
            <div className="bg-[var(--bg-secondary)] p-5 sm:p-6 border-b border-[var(--gold-border)]/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold-gradient text-white flex items-center justify-center shadow-sm">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[var(--gold-end)] uppercase tracking-wider block">
                    {t("حجز استشارة تجميلية", "Cosmetic Appointment")}
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)]">
                    {currentStep === 5
                      ? t(
                          "تم تسجيل طلب الحجز بنجاح",
                          "Appointment Request Received",
                        )
                      : t("خطوات الحجز السريع", "Quick Booking Steps")}
                  </h3>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white border border-[var(--gold-border)]/50 text-[var(--text-secondary)] hover:text-red-500 hover:border-red-300 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Step Bar */}
            {currentStep < 5 && (
              <div className="px-6 pt-5 pb-2 bg-white">
                <div className="flex items-center justify-between mb-2">
                  {[1, 2, 3, 4].map((stepNum) => (
                    <div key={stepNum} className="flex items-center">
                      <div
                        className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
                          currentStep === stepNum
                            ? "bg-gold-gradient text-white shadow-sm scale-110"
                            : currentStep > stepNum
                              ? "bg-emerald-700 text-white"
                              : "bg-gray-100 text-[var(--text-muted)]"
                        }`}
                      >
                        {currentStep > stepNum ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          formatNumber(stepNum)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gold-gradient h-full transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                    style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 max-h-[65vh] overflow-y-auto">
              {/* STEP 1 */}
              {currentStep === 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <div className="mb-2">
                    <h4 className="text-base font-bold text-[var(--text-primary)]">
                      {t(
                        "الخطوة ١: اختاري الخدمة المطلوبة",
                        "Step 1: Choose Your Treatment",
                      )}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t(
                        "اختاري من قائمة الجلسات التجميلية المتخصصة لدينا",
                        "Select from our specialized aesthetic treatments",
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {treatmentsData.map((item) => {
                      const isSelected = item.id === selectedTreatmentId;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedTreatmentId(item.id)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "border-[var(--gold-mid)] bg-[var(--blush-light)]/60 shadow-sm"
                              : "border-gray-200 hover:border-[var(--gold-border)] bg-white"
                          }`}
                        >
                          <div className="text-start">
                            <span className="text-xs font-bold text-[var(--text-primary)] block">
                              {t(item.name.ar, item.name.en)}
                            </span>
                            <span className="text-[11px] text-[var(--gold-end)] font-semibold">
                              {t("يبدأ من", "From")}{" "}
                              {formatNumber(item.priceStartingAt)}{" "}
                              {t("ج.م", "EGP")}
                            </span>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "bg-[var(--gold-mid)] border-[var(--gold-mid)] text-white"
                                : "border-gray-300"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* STEP 2 */}
              {currentStep === 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-5"
                >
                  <div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                      {t(
                        "الخطوة ٢: اختاري الفرع والطبيبة",
                        "Step 2: Choose Branch & Specialist",
                      )}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t(
                        "تفضلي باختيار الفرع الأقرب إليكِ",
                        "Select your preferred clinic location in Egypt",
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      {t("الفروع المتاحة:", "Available Branches:")}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {clinicData.branches.map((b) => {
                        const isSelected = b.id === selectedBranchId;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBranchId(b.id)}
                            className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${
                              isSelected
                                ? "border-[var(--gold-mid)] bg-[var(--blush-light)] shadow-sm font-bold text-[var(--gold-end)]"
                                : "border-gray-200 hover:border-[var(--gold-border)] text-[var(--text-secondary)]"
                            }`}
                          >
                            <MapPin
                              className={`w-4 h-4 mx-auto mb-1 ${
                                isSelected
                                  ? "text-[var(--gold-mid)]"
                                  : "text-gray-400"
                              }`}
                            />
                            <span className="text-xs block">
                              {b.name[language]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      {t(
                        "اختيار الطبيبة المعالجة (اختياري):",
                        "Preferred Doctor (Optional):",
                      )}
                    </span>
                    <div className="space-y-2">
                      <div
                        onClick={() => setSelectedSpecialistId("any")}
                        className={`p-3 rounded-2xl border cursor-pointer flex items-center justify-between ${
                          selectedSpecialistId === "any"
                            ? "border-[var(--gold-mid)] bg-[var(--blush-light)] font-bold text-[var(--gold-end)]"
                            : "border-gray-200 text-[var(--text-secondary)]"
                        }`}
                      >
                        <span className="text-xs">
                          {t(
                            "أقرب موعد متاح مع أي استشارية",
                            "Any available specialist (Earliest slot)",
                          )}
                        </span>
                        {selectedSpecialistId === "any" && (
                          <Check className="w-4 h-4 text-[var(--gold-mid)]" />
                        )}
                      </div>

                      {specialistsData.map((doc) => {
                        const isSelected = doc.id === selectedSpecialistId;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedSpecialistId(doc.id)}
                            className={`p-3 rounded-2xl border cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? "border-[var(--gold-mid)] bg-[var(--blush-light)] shadow-xs"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <div className="text-start">
                              <span className="text-xs font-bold text-[var(--text-primary)] block">
                                {doc.name[language]}
                              </span>
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {doc.title[language]}
                              </span>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-[var(--gold-mid)]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 3 */}
              {currentStep === 3 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-5"
                >
                  <div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                      {t(
                        "الخطوة ٣: حددي اليوم والوقت المفضل",
                        "Step 3: Preferred Date & Time Window",
                      )}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t(
                        "عياداتنا مفتوحة يومياً من ١٠ صباحاً حتى ١٠ مساءً",
                        "Open daily 10:00 AM – 10:00 PM across all branches",
                      )}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)] block">
                      {t("تاريخ الزيارة المفضل:", "Preferred Date:")}
                    </label>
                    <DatePicker
                      value={selectedDate}
                      onChange={setSelectedDate}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)] block">
                      {t("الفترة المفضلة للحضور:", "Preferred Time Window:")}
                    </label>
                    <div className="space-y-2.5">
                      {(["morning", "afternoon", "evening"] as const).map(
                        (slotKey) => {
                          const isSelected = selectedTimeSlot === slotKey;
                          return (
                            <div
                              key={slotKey}
                              onClick={() => setSelectedTimeSlot(slotKey)}
                              className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                                isSelected
                                  ? "border-[var(--gold-mid)] bg-[var(--blush-light)] font-bold text-[var(--gold-end)]"
                                  : "border-gray-200 hover:border-gray-300 text-[var(--text-secondary)]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Clock
                                  className={`w-4 h-4 ${
                                    isSelected
                                      ? "text-[var(--gold-mid)]"
                                      : "text-gray-400"
                                  }`}
                                />
                                <span className="text-xs">
                                  {t(
                                    timeSlotLabels[slotKey].ar,
                                    timeSlotLabels[slotKey].en,
                                  )}
                                </span>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-[var(--gold-mid)]" />
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 4 */}
              {currentStep === 4 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <div>
                    <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">
                      {t(
                        "الخطوة ٤: بياناتكِ للتأكيد والمتابعة",
                        "Step 4: Contact Details for Confirmation",
                      )}
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t(
                        "بياناتكِ في أمان تام وتُستخدم فقط لتنسيق الموعد",
                        "Your details remain strictly confidential",
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
                      {t("الاسم الكامل *", "Full Name *")}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t(
                        "مثال: سارة أحمد محمود",
                        "e.g. Sarah Ahmed",
                      )}
                      className={`w-full p-3 rounded-xl border text-sm outline-none ${
                        errors.fullName
                          ? "border-red-500 bg-red-50/50"
                          : "border-gray-300 focus:border-[var(--gold-mid)]"
                      }`}
                    />
                    {errors.fullName && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
                      {t(
                        "رقم الهاتف المحمول (واتساب) *",
                        "Mobile Phone (WhatsApp) *",
                      )}
                    </label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="010xxxxxxxx"
                      className={`w-full p-3 rounded-xl border text-sm outline-none ${
                        errors.phoneNumber
                          ? "border-red-500 bg-red-50/50"
                          : "border-gray-300 focus:border-[var(--gold-mid)]"
                      }`}
                    />
                    {errors.phoneNumber && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {errors.phoneNumber}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
                      {t(
                        "ملاحظات إضافية أو استفسارات (اختياري)",
                        "Special Notes (Optional)",
                      )}
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t(
                        "هل لديكِ حساسية معينة أو أسئلة عن التبريد؟",
                        "Any allergies, previous treatments, or questions?",
                      )}
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-[var(--gold-mid)] text-sm outline-none resize-none"
                    />
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)] bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    {t(
                      "بمجرد إرسال الطلب، سيتواصل معكِ فريق خدمة العملاء خلال دقائق لتأكيد الموعد النهائي.",
                      "Our concierge team will contact you within minutes to finalize the exact appointment hour.",
                    )}
                  </p>
                </motion.div>
              )}

              {/* STEP 5 */}
              {currentStep === 5 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-2 space-y-6"
                >
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-400 text-emerald-600 flex items-center justify-center mx-auto shadow-lg"
                  >
                    <Check className="w-10 h-10 stroke-[2.5]" />
                  </motion.div>

                  <div>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-3.5 py-1 rounded-full border border-emerald-300">
                      {t(
                        "تم تسجيل طلب الحجز بنجاح",
                        "Booking Request Registered",
                      )}
                    </span>
                    <h3 className="text-2xl font-black text-[var(--text-primary)] mt-3">
                      {t(
                        "شكراً لثقتكِ بعيادات شامه",
                        "Thank You for Choosing Shamah",
                      )}
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
                      {t(
                        "رقم مرجع الحجز الخاص بكِ:",
                        "Your Booking Reference Code:",
                      )}
                      <strong className="text-[var(--gold-end)] ms-1 text-base tracking-wider">
                        {bookingRef}
                      </strong>
                    </p>
                  </div>

                  <div className="bg-[var(--bg-secondary)]/70 p-5 rounded-2xl border border-[var(--gold-border)]/50 text-start space-y-2.5 text-xs sm:text-sm">
                    <div className="flex justify-flex-start border-b border-[var(--gold-border)]/30 pb-2">
                      <span className="text-[var(--text-muted)]">
                        {t("الخدمة:", "Treatment:")}
                      </span>
                      <strong className="text-[var(--text-primary)] mx-1">
                        {t(currentTreatment.name.ar, currentTreatment.name.en)}
                      </strong>
                    </div>
                    <div className="flex justify-flex-start border-b border-[var(--gold-border)]/30 pb-2">
                      <span className="text-[var(--text-muted)]">
                        {t("الفرع:", "Branch:")}
                      </span>
                      <strong className="text-[var(--text-primary)] mx-1">
                        {currentBranch.name[language]}
                      </strong>
                    </div>
                    {currentSpecialist && (
                      <div className="flex justify-flex-start border-b border-[var(--gold-border)]/30 pb-2">
                        <span className="text-[var(--text-muted)]">
                          {t("الطبيبة المعالجة:", "Specialist:")}
                        </span>
                        <strong className="text-[var(--text-primary)] mx-1">
                          {currentSpecialist.name[language]}
                        </strong>
                      </div>
                    )}
                    <div className="flex justify-flex-start border-b border-[var(--gold-border)]/30 pb-2">
                      <span className="text-[var(--text-muted)]">
                        {t("التاريخ والفترة:", "Date & Slot:")}
                      </span>
                      <strong className="text-[var(--text-primary)] mx-1">
                        {selectedDate} —{" "}
                        {t(
                          timeSlotLabels[
                            selectedTimeSlot as keyof typeof timeSlotLabels
                          ].ar,
                          timeSlotLabels[
                            selectedTimeSlot as keyof typeof timeSlotLabels
                          ].en,
                        )}
                      </strong>
                    </div>
                    <div className="flex justify-flex-start">
                      <span className="text-[var(--text-muted)]">
                        {t("اسم المريضة:", "Patient:")}
                      </span>
                      <strong className="text-[var(--text-primary)] mx-1">
                        {fullName} ({phoneNumber})
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <a
                      href={getWhatsAppConfirmationUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>
                        {t(
                          "تأكيد فوري عبر واتساب الآن",
                          "Confirm Immediately via WhatsApp",
                        )}
                      </span>
                    </a>

                    <button
                      onClick={downloadIcsCalendar}
                      className="w-full bg-white border border-[var(--gold-border)] text-[var(--gold-end)] hover:bg-[var(--blush-light)] font-bold py-3 px-6 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {t(
                          "تحميل تذكير الموعد للتقويم (.ics)",
                          "Download Calendar Invite (.ics)",
                        )}
                      </span>
                    </button>

                    <button
                      onClick={onClose}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold mt-2 cursor-pointer"
                    >
                      {t("إغلاق والعودة للموقع", "Close and Return to Site")}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Modal Footer */}
            {currentStep < 5 && (
              <div className="p-4 sm:p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                {currentStep > 1 ? (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:bg-gray-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowPrev className="w-4 h-4" />
                    <span>{t("السابق", "Back")}</span>
                  </button>
                ) : (
                  <div />
                )}

                <button
                  onClick={handleNext}
                  className="bg-gold-gradient hover:opacity-95 text-white text-xs sm:text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>
                    {currentStep === 4
                      ? t("تأكيد الحجز", "Confirm Booking")
                      : t("التالي", "Next")}
                  </span>
                  <ArrowNext className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
