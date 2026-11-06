"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useClinic } from "@/context/ClinicContext";
import { BookButton, CallButton, WhatsAppButton } from "@/components/shared/Actions";
import type { CtaVariant } from "@/lib/content/block-contract";

/**
 * The call-to-action block an author inserts from the console.
 *
 * Every number and link in here is the clinic's own, read from the settings the site
 * already ships: the WhatsApp control takes the saved `whatsapp` value, the phone line
 * the saved `phone`. A block that carried a hardcoded number is the bug this page is
 * meant to stop — an author choosing "WhatsApp" gets the clinic's WhatsApp, not the
 * string that was in the template the day the template was written.
 *
 * The three variants differ in what they ask for, not in how they look:
 *   - `consult` offers a conversation and lets the reader pick the door;
 *   - `book` goes straight to the appointment form;
 *   - `whatsapp` is the messaging handoff, with the number printed for anyone who
 *     would rather dial it.
 */
export const ArticleCtaBox: React.FC<{ variant: CtaVariant }> = ({ variant }) => {
  const { t } = useLanguage();
  const clinic = useClinic();

  if (variant === "book") {
    return (
      <aside className="article-cta on-gold" aria-label={t("احجزي موعدك", "Book an appointment")}>
        <h3 className="article-cta-title">{t("احجزي موعدكِ الآن", "Book your appointment now")}</h3>
        <p className="article-cta-text">
          {t(
            "اختاري الطبيبة والوقت الذي يناسبكِ، ويصلكِ تأكيد الموعد.",
            "Choose the doctor and the time that suits you, and we confirm the appointment.",
          )}
        </p>
        <div className="article-cta-actions">
          <BookButton size="lg" />
        </div>
      </aside>
    );
  }

  if (variant === "whatsapp") {
    return (
      <aside className="article-cta" aria-label={t("تواصلي واتساب", "Contact us on WhatsApp")}>
        <h3 className="article-cta-title">
          {t("أسئلتكِ على واتساب", "Ask us on WhatsApp")}
        </h3>
        <p className="article-cta-text">
          {t(
            "أرسلي لنا صورتكِ وسؤالكِ، ويرد عليكِ فريقنا في ساعات العمل.",
            "Send us your photo and your question, and our team replies during working hours.",
          )}
        </p>
        <div className="article-cta-actions">
          <WhatsAppButton size="lg" variant="outline" />
          <CallButton size="lg" />
        </div>
        <p className="article-cta-note" dir="ltr">
          {clinic.phone}
        </p>
      </aside>
    );
  }

  return (
    <aside className="article-cta on-gold" aria-label={t("استشارة شخصية", "Personal consultation")}>
      <h3 className="article-cta-title">
        {t("محتاجة استشارة شخصية لحالتكِ؟", "Need a personal consultation for your case?")}
      </h3>
      <p className="article-cta-text">
        {t(
          "احجزي موعدكِ مع إحدى طبيباتنا واستلمي خطة مخصصة لبشرتكِ.",
          "Book your appointment with one of our doctors and get a plan tailored to your skin.",
        )}
      </p>
      <div className="article-cta-actions">
        <BookButton size="lg" />
        <WhatsAppButton size="lg" />
      </div>
    </aside>
  );
};
