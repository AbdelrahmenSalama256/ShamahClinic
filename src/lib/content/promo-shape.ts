/**
 * Site-wide promotions a marketer switches on and off: the announcement line at the top of
 * the header and the exit-intent prompt. One document in `settings` (group `marketing`,
 * key `promo`), edited in the Marketing screen with the `integration` grant.
 *
 * Both carry an optional date window in Cairo calendar days, so a campaign can be set up
 * ahead and stop by itself.
 */
export const PROMO_GROUP = 'marketing';
export const PROMO_KEY = 'promo';

export type Bi = { ar: string; en: string };

export interface Announcement {
  enabled: boolean;
  text: Bi;
  linkLabel: Bi;
  /** A path on this site or an http(s) address; empty means the line is not a link. */
  href: string;
  /** `YYYY-MM-DD`, inclusive, Cairo time; empty means open-ended. */
  startsOn: string;
  endsOn: string;
}

export type PromptAction = 'booking' | 'whatsapp' | 'link';

export interface ExitPrompt {
  enabled: boolean;
  title: Bi;
  text: Bi;
  button: Bi;
  action: PromptAction;
  href: string;
  /** Seconds a visitor must have spent on the page before the prompt may appear. */
  delaySeconds: number;
  /** Phones have no "leaving" gesture; when false they get the prompt after the delay and a scroll. */
  desktopOnly: boolean;
  startsOn: string;
  endsOn: string;
}

export interface Promo {
  announcement: Announcement;
  exitPrompt: ExitPrompt;
}

const EMPTY: Bi = { ar: '', en: '' };

export const PROMO_DEFAULTS: Promo = {
  announcement: { enabled: false, text: EMPTY, linkLabel: EMPTY, href: '', startsOn: '', endsOn: '' },
  exitPrompt: {
    enabled: false,
    title: { ar: 'قبل ما تمشي…', en: 'Before you go…' },
    text: { ar: 'احجزي استشارتك المجانية الآن واعرفي الأنسب لبشرتك.', en: 'Book your free consultation now and find what suits your skin.' },
    button: { ar: 'احجزي الآن', en: 'Book now' },
    action: 'booking',
    href: '',
    delaySeconds: 8,
    desktopOnly: true,
    startsOn: '',
    endsOn: '',
  },
};

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const bi = (value: unknown, max: number, fallback: Bi = EMPTY): Bi => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { ar: text(raw.ar, max) || fallback.ar, en: text(raw.en, max) || fallback.en };
};
const day = (value: unknown): string => (/^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : '');

/** A link a promotion may open: a rooted path here, or an http(s) address. */
export function promoHref(value: unknown): string {
  const raw = text(value, 500);
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return '';
    }
  }
  return '';
}

export function normalizePromo(value: unknown): Promo {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const a = raw.announcement && typeof raw.announcement === 'object' ? (raw.announcement as Record<string, unknown>) : {};
  const e = raw.exitPrompt && typeof raw.exitPrompt === 'object' ? (raw.exitPrompt as Record<string, unknown>) : {};
  const d = PROMO_DEFAULTS.exitPrompt;
  const delay = Number(e.delaySeconds);
  const action = (['booking', 'whatsapp', 'link'] as const).find((candidate) => candidate === e.action) ?? d.action;
  return {
    announcement: {
      enabled: a.enabled === true,
      text: bi(a.text, 200),
      linkLabel: bi(a.linkLabel, 60),
      href: promoHref(a.href),
      startsOn: day(a.startsOn),
      endsOn: day(a.endsOn),
    },
    exitPrompt: {
      enabled: e.enabled === true,
      title: bi(e.title, 120, d.title),
      text: bi(e.text, 400, d.text),
      button: bi(e.button, 40, d.button),
      action,
      href: promoHref(e.href),
      delaySeconds: Number.isFinite(delay) ? Math.min(120, Math.max(0, Math.round(delay))) : d.delaySeconds,
      desktopOnly: e.desktopOnly !== false,
      startsOn: day(e.startsOn),
      endsOn: day(e.endsOn),
    },
  };
}

/** Today in Cairo as `YYYY-MM-DD`, the calendar the date windows are written in. */
export function cairoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function inWindow(startsOn: string, endsOn: string, today: string): boolean {
  return (!startsOn || today >= startsOn) && (!endsOn || today <= endsOn);
}

/** What the public site may show today: switched on, inside its dates, and with words to show. */
export function livePromo(promo: Promo, today: string = cairoToday()): Promo {
  const a = promo.announcement;
  const e = promo.exitPrompt;
  return {
    announcement: { ...a, enabled: a.enabled && inWindow(a.startsOn, a.endsOn, today) && !!(a.text.ar || a.text.en) },
    exitPrompt: { ...e, enabled: e.enabled && inWindow(e.startsOn, e.endsOn, today) && (e.action !== 'link' || !!e.href) },
  };
}
