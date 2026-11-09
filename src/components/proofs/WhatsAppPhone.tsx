"use client";

import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, BatteryFull, Camera, CheckCheck, Mic, Paperclip, Phone, Signal, Smile, Video, Wifi } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { ChatTestimonial } from "@/lib/content/site";
import { VoiceNote } from "./VoiceNote";
import styles from "./proofs.module.css";

export const Avatar: React.FC<{ src: string | null; name: string; className?: string }> = ({ src, name, className = "" }) => (
  <span className={`${styles.avatar} ${className}`}>
    {/* An uploaded `/uploads/…` file or an imported `/wp/…` one; neither is a `next/image` host. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} alt="" loading="lazy" /> : [...name.trim()][0] ?? "•"}
  </span>
);

/** One step of the conversation as the phone plays it: a bubble, or the voice note last. */
type Step = { kind: "text"; index: number } | { kind: "voice" };

/**
 * A phone showing one patient's WhatsApp conversation with the clinic.
 *
 * It plays the chat once, the first time it scrolls into view: the patient "types", her
 * message lands, the clinic answers — the pace of a real exchange, not a slideshow. Reduced
 * motion, or a second look, shows the whole conversation at once. The composer at the bottom
 * is part of the picture and is hidden from assistive technology; the bubbles and the voice
 * note are the content.
 */
export const WhatsAppPhone: React.FC<{ chat: ChatTestimonial }> = ({ chat }) => {
  const { t, language } = useLanguage();
  const reduce = useReducedMotion();
  const name = t(chat.name.ar, chat.name.en);
  const steps: Step[] = [
    ...chat.messages.map((_, index): Step => ({ kind: "text", index })),
    ...(chat.voice ? [{ kind: "voice" } as Step] : []),
  ];

  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // A new chat from the switcher remounts this component (`key`), so it plays from the start.
  const [played, setPlayed] = useState(0);
  const [started, setStarted] = useState(false);
  const shown = reduce ? steps.length : played;
  const next = started && shown < steps.length ? steps[shown] : null;
  // The patient "types" before each of her messages lands; the clinic's replies just arrive.
  const typing = next !== null && shown > 0 && (next.kind === "voice" || chat.messages[next.index]?.from === "patient");

  useEffect(() => {
    const el = root.current;
    if (!el || started || reduce) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          seen.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [started, reduce]);

  useEffect(() => {
    if (next === null) return;
    const timer = window.setTimeout(() => setPlayed((n) => n + 1), shown === 0 ? 400 : typing ? 1100 : 650);
    return () => window.clearTimeout(timer);
  }, [next, shown, typing]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown, typing, reduce]);

  const Back = language === "ar" ? ArrowRight : ArrowLeft;
  const lastTime = chat.messages.length ? t(chat.messages[chat.messages.length - 1].time.ar, chat.messages[chat.messages.length - 1].time.en) : "";

  return (
    <div className={styles.phone} ref={root}>
      <div className={styles.screen}>
        <span className={styles.island} aria-hidden />
        <div className={styles.status} aria-hidden>
          <span>9:41</span>
          <span className={styles.statusIcons}>
            <Signal size={12} strokeWidth={2.6} />
            <Wifi size={12} strokeWidth={2.6} />
            <BatteryFull size={15} strokeWidth={2.2} />
          </span>
        </div>
        <div className={styles.header}>
          <Back size={20} aria-hidden />
          <Avatar src={chat.avatar} name={name} />
          <div className={styles.headerName}>
            <strong>{name}</strong>
            <span>{typing ? t("يكتب الآن…", "typing…") : t("متصل الآن", "online")}</span>
          </div>
          <span className={styles.headerIcons} aria-hidden>
            <Video size={19} />
            <Phone size={17} />
          </span>
        </div>

        <div className={styles.chat} ref={scroller} aria-live="polite">
          {(chat.day.ar || chat.day.en) && <span className={styles.day}>{t(chat.day.ar, chat.day.en)}</span>}
          {steps.slice(0, shown).map((step, i) => {
            const prev = i > 0 ? steps[i - 1] : null;
            if (step.kind === "voice") {
              const prevFrom = prev?.kind === "text" ? chat.messages[prev.index].from : null;
              return (
                <div key="voice" className={`${styles.bubble} ${reduce ? "" : styles.enter}`} data-from="patient" data-tail={prevFrom !== "patient" || undefined}>
                  <VoiceNote src={chat.voice!} time={lastTime} avatar={<Avatar src={chat.avatar} name={name} />} />
                </div>
              );
            }
            const message = chat.messages[step.index];
            const prevFrom = prev?.kind === "text" ? chat.messages[prev.index].from : prev ? "patient" : null;
            const time = t(message.time.ar, message.time.en);
            return (
              <div
                key={step.index}
                className={`${styles.bubble} ${reduce ? "" : styles.enter}`}
                data-from={message.from}
                data-tail={prevFrom !== message.from || undefined}
              >
                {t(message.text.ar, message.text.en)}
                <span className={styles.meta}>
                  {time}
                  {message.from === "clinic" && <CheckCheck size={14} className={styles.ticks} aria-label={t("تمت القراءة", "Read")} />}
                </span>
              </div>
            );
          })}
          {typing && (
            <span className={styles.typing} aria-label={t("يكتب الآن", "typing")}>
              <i />
              <i />
              <i />
            </span>
          )}
        </div>

        <div className={styles.composer} aria-hidden>
          <span className={styles.composerField}>
            <Smile size={18} />
            <span>{t("رسالة", "Message")}</span>
            <Paperclip size={17} />
            <Camera size={17} />
          </span>
          <span className={styles.composerMic}>
            <Mic size={18} />
          </span>
        </div>
      </div>
    </div>
  );
};
