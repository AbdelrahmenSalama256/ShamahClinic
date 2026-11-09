"use client";

import React, { useEffect, useRef, useState } from "react";
import { Play, Star, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { VideoTestimonial } from "@/lib/content/site";
import { Avatar } from "./WhatsAppPhone";
import styles from "./proofs.module.css";

export const Stars: React.FC<{ value: number | null }> = ({ value }) => {
  const { t } = useLanguage();
  if (!value) return null;
  return (
    <span className={styles.stars} role="img" aria-label={t("التقييم {0} من ٥", "Rated {0} out of 5", value)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} fill={i < value ? "currentColor" : "none"} strokeWidth={1.8} aria-hidden />
      ))}
    </span>
  );
};

/**
 * Patients' video testimonials as portrait reels, opened in a native `<dialog>` player.
 *
 * Nothing loads until a reel is opened: the cover is the uploaded poster, YouTube's own
 * thumbnail, or (for an uploaded file with no poster) the browser's first frame from a
 * metadata-only request. The dialog keeps focus and Escape behaviour the browser already
 * gets right, and closing it stops the sound.
 */
export const VideoReels: React.FC<{ videos: VideoTestimonial[] }> = ({ videos }) => {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<VideoTestimonial | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <div className={styles.reels} role="list">
        {videos.map((video) => {
          const name = t(video.name.ar, video.name.en);
          const quote = t(video.quote.ar, video.quote.en);
          const cover = video.poster ?? (video.youtube ? `https://i.ytimg.com/vi/${video.youtube}/hqdefault.jpg` : null);
          return (
            <div role="listitem" key={video.key}>
              <button type="button" className={styles.reel} onClick={() => setOpen(video)} aria-label={t("شاهدي رأي {0}", "Watch {0}'s testimonial", name)}>
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" loading="lazy" />
                ) : video.src ? (
                  <video src={`${video.src}#t=0.1`} preload="metadata" muted playsInline aria-hidden />
                ) : null}
                <span className={styles.reelShade} aria-hidden />
                <span className={styles.reelPlay} aria-hidden>
                  <Play size={24} fill="currentColor" />
                </span>
                <span className={styles.reelBody}>
                  <span className={styles.reelName}>
                    <Avatar src={video.avatar} name={name} />
                    <bdi>{name}</bdi>
                  </span>
                  <Stars value={video.rating} />
                  {quote && <p className={styles.reelQuote}>“{quote}”</p>}
                  {video.service && <span className={styles.tag}>{t(video.service.name.ar, video.service.name.en)}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <dialog
        ref={dialog}
        className={styles.dialog}
        data-wide={open?.youtube && !open.src ? true : undefined}
        onClose={() => setOpen(null)}
        onClick={(event) => {
          // a click on the backdrop lands on the dialog element itself
          if (event.target === event.currentTarget) setOpen(null);
        }}
        aria-label={open ? t(open.name.ar, open.name.en) : undefined}
      >
        <button type="button" className={styles.close} onClick={() => setOpen(null)} aria-label={t("إغلاق", "Close")}>
          <X size={18} />
        </button>
        {open?.src ? (
          <video key={open.key} src={open.src} poster={open.poster ?? undefined} controls autoPlay playsInline />
        ) : open?.youtube ? (
          <iframe
            key={open.key}
            src={`https://www.youtube-nocookie.com/embed/${open.youtube}?autoplay=1&rel=0&playsinline=1`}
            title={t(open.name.ar, open.name.en)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : null}
      </dialog>
    </>
  );
};
