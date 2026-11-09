"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { getLocalizedHref } from "@/lib/locale";
import type { ChatTestimonial, Testimonial, VideoTestimonial } from "@/lib/content/site";
import { Avatar, WhatsAppPhone } from "./WhatsAppPhone";
import { Stars, VideoReels } from "./VideoReels";
import styles from "./proofs.module.css";

/**
 * "Proofs": what patients said, in their own voice.
 *
 * Two halves, each drawn only when the console holds rows for it — a phone with the WhatsApp
 * conversations (switch between patients under it) and a row of video reels. With neither,
 * the band renders nothing: no heading over an empty phone. The before/after comparison is
 * its own band right after this one and keeps its own rules.
 */
export const ProofsSection: React.FC<{ testimonials: Testimonial[]; index?: string; id?: string }> = ({ testimonials, index, id = "proofs" }) => {
  const { t, language } = useLanguage();
  const chats = testimonials.filter((item): item is ChatTestimonial => item.format === "chat");
  const videos = testimonials.filter((item): item is VideoTestimonial => item.format === "video");
  const [active, setActive] = useState(0);

  if (chats.length === 0 && videos.length === 0) return null;
  const chat = chats[Math.min(active, chats.length - 1)];
  const quote = chat ? t(chat.quote.ar, chat.quote.en) : "";

  return (
    <section id={id} className={`py-8 lg:py-16 bg-[var(--bg-secondary)]/60 ${styles.band}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          index={index}
          title={{ ar: "بكلامهم، مش بكلامنا", en: "In their words, not ours" }}
          lead={{
            ar: "رسائل وتسجيلات وفيديوهات حقيقية من مريضات العيادة بعد جلساتهم، تُنشر بموافقتهم.",
            en: "Real messages, voice notes and videos from our patients after their sessions, shared with their consent.",
          }}
        />

        <div className={styles.grid} data-both={(chats.length > 0 && videos.length > 0) || undefined}>
          {chat && (
            <Reveal className={styles.phoneColumn}>
              <WhatsAppPhone key={chat.key} chat={chat} />
              {chats.length > 1 && (
                <div className={styles.switcher} role="group" aria-label={t("اختاري محادثة", "Choose a conversation")}>
                  {chats.map((item, i) => {
                    const name = t(item.name.ar, item.name.en);
                    return (
                      <button key={item.key} type="button" className={styles.switch} aria-pressed={i === active} onClick={() => setActive(i)}>
                        <Avatar src={item.avatar} name={name} />
                        <bdi>{name}</bdi>
                      </button>
                    );
                  })}
                </div>
              )}
              {(quote || chat.rating || chat.service) && (
                <div className="grid justify-items-center gap-2">
                  <Stars value={chat.rating} />
                  {quote && <p className={styles.caption}>“{quote}”</p>}
                  {chat.service && (
                    <Link className={styles.tag} href={getLocalizedHref(chat.service.href[language] || chat.service.href.ar, language)}>
                      {t(chat.service.name.ar, chat.service.name.en)}
                    </Link>
                  )}
                </div>
              )}
            </Reveal>
          )}

          {videos.length > 0 && (
            <Reveal delay={0.1} className="min-w-0">
              <VideoReels videos={videos} />
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
};
