"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useBooking } from "@/context/BookingContext";
import { PageHero } from "@/components/shared/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { Photo } from "@/components/ui/Photo";
import { whatsappHref } from "@/components/shared/Actions";
import { clinicData } from "@/data/clinic";
import { branchesData } from "@/data/branches";
import { treatmentsData } from "@/data/treatments";
import { images } from "@/lib/images";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Phone,
  Mail,
  Clock,
  Check,
  Calendar,
  MapPin,
  ChevronDown,
} from "lucide-react";

export const ContactClient: React.FC = () => {
  const { t, language } = useLanguage();
  const { openBooking } = useBooking();

  const [form, setForm] = useState<{
    name: string;
    phone: string;
    services: string[];
    message: string;
  }>({
    name: "",
    phone: "",
    services: [],
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const servicesDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isServicesOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !servicesDropdownRef.current?.contains(event.target)
      ) {
        setIsServicesOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsServicesOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isServicesOpen]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 3) {
      errs.name =
        language === "ar"
          ? "يرجى كتابة الاسم (٣ أحرف على الأقل)"
          : "Please enter your name (3+ characters)";
    }
    const clean = form.phone.replace(/\s+/g, "");
    if (!/^(01[0125][0-9]{8}|\+201[0125][0-9]{8})$/.test(clean)) {
      errs.phone =
        language === "ar"
          ? "رقم هاتف مصري غير صحيح (مثال: 010xxxxxxxx)"
          : "Enter a valid Egyptian mobile number";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSent(true);
  };

  const selectedServices = treatmentsData.filter((treatment) =>
    form.services.includes(treatment.id),
  );
  const serviceNames = selectedServices
    .map((treatment) => treatment.name[language])
    .join(language === "ar" ? "، " : ", ");
  const waMessage =
    language === "ar"
      ? `مرحباً عيادات شامه، اسمي ${form.name || "..."}. أرغب في الاستفسار عن ${
          serviceNames || "خدماتكم"
        }.`
      : `Hello Shamah Clinics, my name is ${form.name || "..."}. I would like to ask about ${
          serviceNames || "your services"
        }.`;

  return (
    <>
      <PageHero
        title={{
          ar: "تواصلي معنا واحجزي موعدكِ",
          en: "Contact us & book your visit",
        }}
        lead={{
          ar: "أسرع طريقة للحجز هي واتساب أو الاتصال المباشر بالفرع. يمكنكِ أيضاً تعبئة النموذج وسنعاود التواصل معكِ لتأكيد الموعد.",
          en: "The fastest way to book is WhatsApp or a direct call to a branch. You can also fill the form and we will contact you to confirm.",
        }}
        breadcrumbs={[
          { href: "/", label: { ar: "الرئيسية", en: "Home" } },
          { href: "/contact", label: { ar: "تواصلي", en: "Contact" } },
        ]}
        photo={images.interiors.reception}
      />

      <section className="py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Direct channels */}
          <div className="lg:col-span-5 space-y-4">
            <a
              href={whatsappHref(language)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50/60 hover:bg-emerald-50 hover:-translate-y-0.5 transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
            >
              <span className="w-11 h-11 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </span>
              <span>
                <span className="block font-black text-[var(--text-primary)]">
                  {t("واتساب (الأسرع)", "WhatsApp (fastest)")}
                </span>
                <span
                  className="block text-sm text-[var(--text-secondary)]"
                  // dir="ltr"
                >
                  +20 112 188 0908
                </span>
              </span>
            </a>

            <a
              href={`tel:${clinicData.phone.replace(/\s/g, "")}`}
              // dir="ltr"
              className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)] hover:-translate-y-0.5 hover:shadow-md transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
            >
              <span className="w-11 h-11 rounded-full bg-gold-gradient text-white flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </span>
              <span className="text-start">
                <span className="block font-black text-[var(--text-primary)]">
                  {t("الخط الرئيسي", "Main line")}
                </span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {clinicData.phone}
                </span>
              </span>
            </a>

            <div className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)]">
              <span className="w-11 h-11 rounded-full bg-[var(--bg-secondary)] text-[var(--gold-end)] flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </span>
              <span>
                <span className="block font-black text-[var(--text-primary)]">
                  {t("البريد الإلكتروني", "Email")}
                </span>
                <a
                  href={`mailto:${clinicData.email}`}
                  className="block text-sm text-[var(--gold-end)] hover:underline"
                >
                  {clinicData.email}
                </a>
              </span>
            </div>

            <div className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)]">
              <span className="w-11 h-11 rounded-full bg-[var(--bg-secondary)] text-[var(--gold-end)] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </span>
              <span>
                <span className="block font-black text-[var(--text-primary)]">
                  {t("مواعيد العمل", "Opening hours")}
                </span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {clinicData.workingHours[language]}
                </span>
              </span>
            </div>

            {/* Branch quick call list */}
            <div className="pt-2">
              <h2 className="font-black text-[var(--text-primary)] mb-3">
                {t("اتصلي بفرع محدد", "Call a specific branch")}
              </h2>
              <ul className="space-y-2">
                {branchesData.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--gold-border)]/40"
                  >
                    <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <MapPin className="w-4 h-4 text-[var(--gold-mid)] shrink-0" />
                      {t(b.name.ar, b.name.en)}
                    </span>
                    <a
                      href={`tel:${b.phone}`}
                      dir="ltr"
                      className="text-sm font-bold text-[var(--gold-end)] hover:text-[var(--gold-mid)] transition-colors duration-300 shrink-0"
                    >
                      {b.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Form (visual only) */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-[var(--gold-border)]/50 bg-[var(--bg-card)] p-6 sm:p-8">
              {sent ? (
                <Reveal className="text-center py-8">
                  <span className="inline-flex w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-400 text-emerald-600 items-center justify-center mb-4">
                    <Check className="w-8 h-8" />
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mb-2">
                    {t("شكراً لتواصلكِ معنا", "Thank you for reaching out")}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
                    {t(
                      "استلمنا رسالتكِ وسيتواصل معكِ فريقنا خلال دقائق في مواعيد العمل. للاستجابة الفورية اضغطي زر واتساب أدناه.",
                      "We received your message and our team will contact you within minutes during working hours. For an instant reply, tap WhatsApp below.",
                    )}
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <a
                      href={whatsappHref(language, waMessage)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-700 text-white font-bold text-sm px-6 py-3 hover:bg-emerald-800 hover:-translate-y-0.5 transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {t("أكملي عبر واتساب", "Continue on WhatsApp")}
                    </a>
                    <button
                      onClick={() => {
                        setSent(false);
                        setIsServicesOpen(false);
                        setForm({
                          name: "",
                          phone: "",
                          services: [],
                          message: "",
                        });
                      }}
                      className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors duration-300 cursor-pointer"
                    >
                      {t("إرسال رسالة أخرى", "Send another message")}
                    </button>
                  </div>
                </Reveal>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div>
                    <h2 className="text-xl font-black text-[var(--text-primary)] mb-1">
                      {t("أرسلي استفساركِ", "Send your enquiry")}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {t(
                        "الحقول بعلامة * مطلوبة. بياناتكِ تُستخدم فقط للرد على استفساركِ.",
                        "Fields marked * are required. Your details are used only to reply to your enquiry.",
                      )}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="c-name"
                      className="block text-sm font-bold text-[var(--text-primary)] mb-1.5"
                    >
                      {t("الاسم *", "Name *")}
                    </label>
                    <input
                      id="c-name"
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder={t("مثال: سارة أحمد", "e.g. Sarah Ahmed")}
                      className={`w-full p-3 rounded-xl border text-sm outline-none transition-colors duration-300 ${
                        errors.name
                          ? "border-red-500 bg-red-50/50"
                          : "border-gray-300 focus:border-[var(--gold-mid)]"
                      }`}
                    />
                    {errors.name && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="c-phone"
                      className="block text-sm font-bold text-[var(--text-primary)] mb-1.5"
                    >
                      {t("رقم الهاتف (واتساب) *", "Phone (WhatsApp) *")}
                    </label>
                    <input
                      id="c-phone"
                      type="tel"
                      dir="ltr"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="010xxxxxxxx"
                      className={`w-full p-3 rounded-xl border text-sm outline-none transition-colors duration-300 ${
                        errors.phone
                          ? "border-red-500 bg-red-50/50"
                          : "border-gray-300 focus:border-[var(--gold-mid)]"
                      }`}
                    />
                    {errors.phone && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  <div className="relative" ref={servicesDropdownRef}>
                    {/* Trigger */}
                    <button
                      id="c-service"
                      type="button"
                      aria-expanded={isServicesOpen}
                      aria-controls="c-service-options"
                      onClick={() => setIsServicesOpen((isOpen) => !isOpen)}
                      className={`group w-full px-4 py-3 rounded-2xl border bg-white flex items-center justify-between gap-3 text-start text-sm outline-none transition-[border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer ${
                        isServicesOpen
                          ? "border-[var(--gold-mid)] shadow-[0_0_0_3px_var(--gold-glow)]"
                          : "border-[var(--gold-border)]/50 hover:border-[var(--gold-mid)]/70"
                      }`}
                    >
                      <span
                        className={`min-w-0 truncate ${
                          selectedServices.length
                            ? "text-[var(--text-primary)] font-medium"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {serviceNames ||
                          t(
                            "اختاري خدمة (اختياري)",
                            "Select services (optional)",
                          )}
                      </span>

                      <span className="flex items-center gap-2 shrink-0">
                        {selectedServices.length > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--gold-end)] text-white text-[11px] font-bold tabular-nums">
                            {selectedServices.length}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 text-[var(--gold-end)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
                            isServicesOpen ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                    </button>

                    {/* Dropdown panel — Framer Motion */}
                    <AnimatePresence>
                      {isServicesOpen && (
                        <motion.div
                          id="c-service-options"
                          role="listbox"
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{
                            duration: 0.24,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          style={{ transformOrigin: "top center" }}
                          className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl border border-[var(--gold-border)]/50 bg-white shadow-2xl p-1.5"
                        >
                          {treatmentsData.map((treatment) => {
                            const isChecked = form.services.includes(
                              treatment.id,
                            );
                            return (
                              <label
                                key={treatment.id}
                                className={`group/item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors duration-200 ${
                                  isChecked
                                    ? "bg-[var(--blush-light)]/70"
                                    : "hover:bg-[var(--bg-secondary)]"
                                }`}
                              >
                                <span
                                  className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-[background-color,border-color,transform] duration-200 ${
                                    isChecked
                                      ? "bg-gold-gradient border-transparent scale-105"
                                      : "bg-white border-[var(--gold-border)] group-hover/item:border-[var(--gold-mid)]"
                                  }`}
                                >
                                  {isChecked && (
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="w-3 h-3 text-white"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </span>

                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() =>
                                    setForm((previous) => ({
                                      ...previous,
                                      services: previous.services.includes(
                                        treatment.id,
                                      )
                                        ? previous.services.filter(
                                            (serviceId) =>
                                              serviceId !== treatment.id,
                                          )
                                        : [...previous.services, treatment.id],
                                    }))
                                  }
                                  className="sr-only"
                                />

                                <span
                                  className={`flex-1 transition-colors duration-200 ${
                                    isChecked
                                      ? "text-[var(--gold-end)] font-semibold"
                                      : "text-[var(--text-primary)] group-hover/item:text-[var(--gold-end)]"
                                  }`}
                                >
                                  {t(treatment.name.ar, treatment.name.en)}
                                </span>
                              </label>
                            );
                          })}

                          <div className="sticky bottom-0 mt-1 pt-2 border-t border-[var(--gold-border)]/30 bg-white flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({ ...prev, services: [] }))
                              }
                              disabled={selectedServices.length === 0}
                              className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-2 transition-colors duration-200 cursor-pointer"
                            >
                              {t("مسح الكل", "Clear all")}
                            </button>

                            <button
                              type="button"
                              onClick={() => setIsServicesOpen(false)}
                              className="rounded-full bg-gold-gradient text-white text-xs font-bold px-4 py-2 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer"
                            >
                              {t("تم", "Done")}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <label
                      htmlFor="c-msg"
                      className="block text-sm font-bold text-[var(--text-primary)] mb-1.5"
                    >
                      {t("رسالتكِ", "Your message")}
                    </label>
                    <textarea
                      id="c-msg"
                      rows={4}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      placeholder={t(
                        "اكتبي استفساركِ أو الوقت المفضل للزيارة...",
                        "Write your question or preferred visit time...",
                      )}
                      className="w-full p-3 rounded-xl border border-gray-300 focus:border-[var(--gold-mid)] text-sm outline-none resize-none transition-colors duration-300"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button
                      type="submit"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient text-white font-bold text-sm py-3.5 hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {t("إرسال الاستفسار", "Send enquiry")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBooking()}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--gold-mid)] text-[var(--gold-end)] font-bold text-sm py-3.5 hover:bg-[var(--blush-light)] transition-[background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      {t("أو احجزي مباشرة", "Or book directly")}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {t(
                      "هذا النموذج للعرض داخل الموقع؛ الإرسال الفعلي يتم عبر واتساب أو الهاتف لضمان رد سريع.",
                      "This form is on-site only; actual sending happens via WhatsApp or phone to ensure a fast reply.",
                    )}
                  </p>
                </form>
              )}
            </div>

            <Reveal className="mt-6 rounded-2xl overflow-hidden">
              <Photo
                slot={images.interiors.consultation}
                ratio="wide"
                curtain
                sizes="(max-width:1024px) 100vw, 55vw"
              />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
};
