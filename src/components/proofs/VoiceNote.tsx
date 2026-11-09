"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import styles from "./proofs.module.css";

const BARS = 34;
const SPEEDS = [1, 1.5, 2] as const;

/** The voice note playing now, so starting another one stops it — as the app does. */
let playing: HTMLAudioElement | null = null;

/**
 * A waveform that looks like speech and is the same on every visit for the same file.
 *
 * The real envelope would need the whole file decoded before the bubble can draw, which is a
 * download a visitor did not ask for; a seeded shape costs nothing and is honest about being
 * a picture of a voice, not a measurement of this one.
 */
function waveOf(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const noise = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 1)) / (BARS + 1));
    out.push(Math.max(0.18, Math.min(1, envelope * (0.35 + noise * 0.75))));
  }
  return out;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export const VoiceNote: React.FC<{
  src: string;
  avatar: React.ReactNode;
  time?: string;
}> = ({ src, avatar, time }) => {
  const { t } = useLanguage();
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const wave = useMemo(() => waveOf(src), [src]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const sync = () => {
      setCurrent(el.currentTime);
      // `Infinity` is what Chrome reports for a webm/opus file until it has read it through.
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const stop = () => setOn(false);
    const start = () => setOn(true);
    const end = () => {
      setOn(false);
      setCurrent(0);
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("durationchange", sync);
    el.addEventListener("pause", stop);
    el.addEventListener("play", start);
    el.addEventListener("ended", end);
    return () => {
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("durationchange", sync);
      el.removeEventListener("pause", stop);
      el.removeEventListener("play", start);
      el.removeEventListener("ended", end);
      if (playing === el) playing = null;
      el.pause();
    };
  }, [src]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      void el.play();
    } else {
      el.pause();
    }
  };

  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  };

  const progress = duration ? current / duration : 0;

  return (
    <div className={styles.voice}>
      <audio ref={audio} src={src} preload="metadata" />
      <div className={styles.voiceAvatar} aria-hidden>
        {avatar}
        <span className={styles.mic}>
          <Mic size={11} strokeWidth={2.6} />
        </span>
      </div>
      <button
        type="button"
        className={styles.play}
        onClick={toggle}
        aria-label={on ? t("إيقاف التسجيل", "Pause voice note") : t("تشغيل التسجيل", "Play voice note")}
      >
        {on ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <div className={styles.wave}>
        <div
          className={styles.bars}
          role="slider"
          tabIndex={0}
          aria-label={t("موضع التشغيل", "Playback position")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${clock(current)} / ${clock(duration)}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seek(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons) seek(event);
          }}
          onKeyDown={(event) => {
            const el = audio.current;
            if (!el || !duration) return;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              el.currentTime = Math.min(duration, Math.max(0, el.currentTime + (event.key === "ArrowRight" ? 5 : -5)));
            }
          }}
        >
          {wave.map((height, i) => (
            <span key={i} style={{ height: `${Math.round(height * 100)}%` }} data-played={i / BARS < progress || undefined} />
          ))}
        </div>
        <div className={styles.voiceFoot}>
          <span>{clock(on || current > 0 ? current : duration)}</span>
          {on ? (
            <button
              type="button"
              className={styles.speed}
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                setSpeed(next);
                if (audio.current) audio.current.playbackRate = next;
              }}
              aria-label={t("سرعة التشغيل", "Playback speed")}
            >
              {speed}×
            </button>
          ) : (
            <span>{time}</span>
          )}
        </div>
      </div>
    </div>
  );
};
