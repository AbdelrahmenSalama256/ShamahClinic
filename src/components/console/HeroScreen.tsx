"use client";

/**
 * The homepage slider, edited as one list.
 *
 * The page passes the saved document; everything below changes a local copy and one save
 * writes it back whole. That is why reordering is a drag or a pair of arrows on the same
 * list rather than a sequence of requests: a half-applied order would be a half-broken
 * homepage.
 *
 * Three choices worth knowing:
 *
 * **A new slide exists only in this browser until save**, so an abandoned edit never
 * reaches the site and a removed slide is only soft-deleted when the person saves.
 *
 * **The preview is drawn here, not in an iframe.** It shows the selected slide's picture,
 * the copy for the console's language and the button, which is exactly the decision the
 * person is making. Alt text is not drawn because it is for screen readers, and an empty
 * heading says the authored sentence survives rather than pretending to know it.
 *
 * **Schedule inputs are filled after mount.** A `datetime-local` value is local-time text,
 * and the server renders this screen in a different timezone; filling it during hydration
 * would make the two renders disagree.
 */
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { consoleCall } from "./client-api";
import { ImagePicker } from "./ImagePicker";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  Field,
  Input,
  Note,
  pairName,
  type Tone,
} from "@/components/console/kit";
import type { MessageKey } from "@/lib/console/messages";
import type { ConsoleLocale } from "@/lib/console/prefs";
import {
  HERO_DEFAULTS,
  HERO_LIMITS,
  normalizeHeroDocument,
  validateHero,
  type Bi,
  type HeroDocument,
  type HeroIssue,
  type HeroSlide,
} from "@/lib/hero/types";

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  text: string;
}

const EMPTY_BI: Bi = { ar: "", en: "" };

/** False on the server and during hydration, true afterwards — no effect, no mismatch. */
const subscribeNever = (): (() => void) => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

function cloneDocument(document: HeroDocument): HeroDocument {
  return normalizeHeroDocument(document);
}

function mintId(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === "function") return api.randomUUID();
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newSlide(): HeroSlide {
  return {
    id: mintId(),
    active: true,
    image: "",
    imageMobile: null,
    alt: { ...EMPTY_BI },
    heading: null,
    sub: null,
    cta: null,
    startsAt: null,
    endsAt: null,
  };
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** ISO -> the local-time text a `datetime-local` input holds. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The input's local-time text -> the ISO string the document stores. */
function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A stable, timezone-proof stamp: the server and the browser must agree on this text. */
function stamp(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "";
}

function pick(value: Bi | null, locale: ConsoleLocale): string {
  if (!value) return "";
  return locale === "ar" ? value.ar || value.en : value.en || value.ar;
}

/** One stable string per document, so "dirty" means a real edit and not a new object. */
function signature(document: HeroDocument): string {
  return JSON.stringify(normalizeHeroDocument(document));
}

function Section({
  index,
  title,
  lede,
  dirty,
  dirtyLabel,
  busy,
  id,
  children,
  footer,
}: Readonly<{
  index: string;
  title: string;
  lede: string;
  dirty?: boolean;
  dirtyLabel: string;
  busy?: boolean;
  id: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  const titleId = `${id}-title`;
  return (
    <Card as="section" className="console-panel settings-section" id={id} aria-labelledby={titleId} aria-busy={busy || undefined}>
      <header className="settings-section-head">
        <div className="settings-section-title">
          <span className="settings-section-index" aria-hidden="true">
            {index}
          </span>
          <h2 className="console-subheading" id={titleId}>
            {title}
          </h2>
          {dirty && (
            <span className="settings-dirty" role="status">
              <span className="settings-dirty-dot" aria-hidden="true" />
              {dirtyLabel}
            </span>
          )}
        </div>
        <p className="console-lede">{lede}</p>
      </header>
      <div className="settings-section-body">{children}</div>
      {footer ? <footer className="settings-section-foot">{footer}</footer> : null}
    </Card>
  );
}

export function HeroScreen({
  hero,
  locale,
  labels,
  canWrite,
}: Readonly<{
  hero: HeroDocument;
  locale: ConsoleLocale;
  labels: Labels;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const uid = useId();
  const saved = useMemo(() => cloneDocument(hero), [hero]);
  const [draft, setDraft] = useState<HeroDocument>(saved);
  const [selectedId, setSelectedId] = useState<string | null>(saved.slides[0]?.id ?? null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [issues, setIssues] = useState<HeroIssue[]>([]);
  const mounted = useMounted();

  const dirty = signature(draft) !== signature(saved);
  const slidesDirty = JSON.stringify(normalizeHeroDocument(draft).slides) !== JSON.stringify(saved.slides);
  const settingsDirty = JSON.stringify(draft.settings) !== JSON.stringify(saved.settings);

  const selectedIndex = draft.slides.findIndex((slide) => slide.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.slides[selectedIndex] : draft.slides[0] ?? null;
  const index = selected ? draft.slides.findIndex((slide) => slide.id === selected.id) : -1;

  const activeCount = draft.slides.filter((slide) => slide.active).length;

  function updateSlide(patch: Partial<HeroSlide>): void {
    if (!selected) return;
    const id = selected.id;
    setDraft((state) => ({
      ...state,
      slides: state.slides.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide)),
    }));
  }

  function setAlt(lang: keyof Bi, value: string): void {
    if (!selected) return;
    updateSlide({ alt: { ...selected.alt, [lang]: value } });
  }

  function setLine(field: "heading" | "sub", lang: keyof Bi, value: string): void {
    if (!selected) return;
    const current = selected[field] ?? { ...EMPTY_BI };
    const next = { ...current, [lang]: value };
    if (field === "heading") updateSlide({ heading: next });
    else updateSlide({ sub: next });
  }

  function setCtaLabel(lang: keyof Bi, value: string): void {
    if (!selected) return;
    const cta = selected.cta ?? { label: { ...EMPTY_BI }, href: { ...EMPTY_BI } };
    updateSlide({ cta: { ...cta, label: { ...cta.label, [lang]: value } } });
  }

  function setCtaHref(lang: keyof Bi, value: string): void {
    if (!selected) return;
    const cta = selected.cta ?? { label: { ...EMPTY_BI }, href: { ...EMPTY_BI } };
    updateSlide({ cta: { ...cta, href: { ...cta.href, [lang]: value } } });
  }

  function setSettings(patch: Partial<HeroDocument["settings"]>): void {
    setDraft((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
  }

  function addSlide(): void {
    if (draft.slides.length >= HERO_LIMITS.slides) {
      setNotice({ tone: "warn", text: labels["hero.issue.too_many_slides"] });
      return;
    }
    const slide = newSlide();
    setDraft((state) => ({ ...state, slides: [...state.slides, slide] }));
    setSelectedId(slide.id);
    setNotice(null);
  }

  function removeSlide(id: string): void {
    const remaining = draft.slides.filter((slide) => slide.id !== id);
    setDraft((state) => ({ ...state, slides: state.slides.filter((slide) => slide.id !== id) }));
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    if (dragging === id) setDragging(null);
    if (over === id) setOver(null);
  }

  function move(id: string, delta: number): void {
    setDraft((state) => {
      const from = state.slides.findIndex((slide) => slide.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= state.slides.length) return state;
      const slides = [...state.slides];
      const [row] = slides.splice(from, 1);
      if (!row) return state;
      slides.splice(to, 0, row);
      return { ...state, slides };
    });
  }

  /** Drop `from` where `to` sits, keeping every other row in order. */
  function reorder(from: string, to: string): void {
    if (from === to) return;
    setDraft((state) => {
      const fromIndex = state.slides.findIndex((slide) => slide.id === from);
      const toIndex = state.slides.findIndex((slide) => slide.id === to);
      if (fromIndex < 0 || toIndex < 0) return state;
      const slides = [...state.slides];
      const [row] = slides.splice(fromIndex, 1);
      if (!row) return state;
      slides.splice(toIndex, 0, row);
      return { ...state, slides };
    });
  }

  const issueText = (issue: HeroIssue): string =>
    labels[`hero.issue.${issue.message}` as MessageKey] ?? issue.message;

  const errorsFor = (suffix: string): string[] =>
    issues.filter((issue) => issue.path === `slides.${index}.${suffix}`).map(issueText);

  async function save(): Promise<void> {
    if (!canWrite || busy) return;
    if (!dirty) {
      setNotice({ tone: "neutral", text: labels["settings.no_changes"] });
      return;
    }
    const found = validateHero(draft);
    if (found.length > 0) {
      setIssues(found);
      setNotice({ tone: "danger", text: labels["hero.error.invalid_input"] });
      return;
    }

    setBusy(true);
    setIssues([]);
    const result = await consoleCall<HeroDocument>("/api/console/hero", "PATCH", normalizeHeroDocument(draft));
    setBusy(false);
    if (result.error) {
      setIssues(result.issues);
      const key = `hero.error.${result.error}` as MessageKey;
      setNotice({ tone: "danger", text: labels[key] ?? labels["hero.error.save"] });
      return;
    }
    if (result.data && Array.isArray(result.data.slides)) {
      const next = cloneDocument(result.data);
      setDraft(next);
      setSelectedId((current) => (next.slides.some((slide) => slide.id === current) ? current : next.slides[0]?.id ?? null));
    }
    setNotice({ tone: "ok", text: labels["hero.saved"] });
    router.refresh();
  }

  const headingPreview = pick(selected?.heading ?? null, locale);
  const subPreview = pick(selected?.sub ?? null, locale);
  const ctaLabelPreview = pick(selected?.cta?.label ?? null, locale);
  const ctaHrefPreview = pick(selected?.cta?.href ?? null, locale);
  const scheduleText = (slide: HeroSlide): string => {
    const from = stamp(slide.startsAt);
    const until = stamp(slide.endsAt);
    if (from && until) return `${labels["hero.from"]} ${from} · ${labels["hero.until"]} ${until}`;
    if (from) return `${labels["hero.from"]} ${from}`;
    if (until) return `${labels["hero.until"]} ${until}`;
    return "";
  };

  const previewDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div className="settings-workspace">
      {!canWrite && <Alert tone="neutral">{labels["hero.readonly"]}</Alert>}
      {notice && (
        <div className="settings-notice">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}
      {issues.length > 0 && (
        <Alert tone="danger" role="alert">
          <ul className="hero-issue-list">
            {issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>{issueText(issue)}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Section
        id="hero-slides"
        index="01"
        title={labels["hero.slides.heading"]}
        lede={labels["hero.slides.lede"]}
        dirty={slidesDirty}
        dirtyLabel={labels["settings.unsaved"]}
        busy={busy}
        footer={
          <>
            <Note>{labels["hero.limit"]}</Note>
            <Button variant={dirty ? "primary" : "default"} loading={busy} disabled={!canWrite || busy} onClick={() => void save()}>
              {labels["content.save"]}
            </Button>
          </>
        }
      >
        <div className="hero-workspace">
          <div className="hero-rail">
            <div className="hero-rail-head">
              <Note>
                {labels["hero.active_count"]
                  .replace("{count}", String(activeCount))
                  .replace("{total}", String(draft.slides.length))}
              </Note>
              <Button size="sm" disabled={!canWrite || busy || draft.slides.length >= HERO_LIMITS.slides} onClick={addSlide}>
                {labels["hero.add"]}
              </Button>
            </div>

            {draft.slides.length === 0 ? (
              <Empty>{labels["hero.empty"]}</Empty>
            ) : (
              <ol className="hero-list" aria-label={labels["hero.slides.heading"]}>
                {draft.slides.map((slide, position) => {
                  const isSelected = selected?.id === slide.id;
                  const window = scheduleText(slide);
                  return (
                    <li
                      key={slide.id}
                      className="hero-slide-row"
                      data-selected={isSelected || undefined}
                      data-inactive={!slide.active || undefined}
                      data-over={over === slide.id || undefined}
                      data-dragging={dragging === slide.id || undefined}
                      draggable={canWrite && !busy}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", slide.id);
                        setDragging(slide.id);
                      }}
                      onDragOver={(event) => {
                        if (!dragging || dragging === slide.id) return;
                        event.preventDefault();
                        setOver(slide.id);
                      }}
                      onDragLeave={() => setOver((current) => (current === slide.id ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = event.dataTransfer.getData("text/plain") || dragging;
                        if (from) reorder(from, slide.id);
                        setDragging(null);
                        setOver(null);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    >
                      <button
                        type="button"
                        className="hero-slide-select"
                        aria-current={isSelected ? "true" : undefined}
                        disabled={busy}
                        onClick={() => setSelectedId(slide.id)}
                      >
                        <span className="hero-slide-thumb" aria-hidden="true">
                          {slide.image ? (
                            // The address may be an imported `/wp` path or an upload; neither is
                            // a host `next/image` is configured for.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={slide.image} alt="" loading="lazy" className="hero-slide-photo" />
                          ) : (
                            <span className="hero-slide-thumb-empty">{position + 1}</span>
                          )}
                        </span>
                        <span className="hero-slide-text">
                          <span className="hero-slide-name">
                            {labels["hero.slide"]} {position + 1}
                          </span>
                          <span className="hero-slide-meta">
                            <Badge tone={slide.active ? "ok" : "neutral"}>
                              {labels[slide.active ? "hero.active" : "hero.inactive"]}
                            </Badge>
                            {window ? <span className="hero-slide-window">{window}</span> : null}
                          </span>
                        </span>
                      </button>

                      <div className="hero-slide-tools">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={labels["hero.move_up"]}
                          disabled={!canWrite || busy || position === 0}
                          onClick={() => move(slide.id, -1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={labels["hero.move_down"]}
                          disabled={!canWrite || busy || position === draft.slides.length - 1}
                          onClick={() => move(slide.id, 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={labels["hero.remove"]}
                          disabled={!canWrite || busy}
                          onClick={() => removeSlide(slide.id)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {draft.slides.length > 0 ? <Note>{labels["hero.remove_hint"]}</Note> : null}
          </div>

          {selected ? (
            <div className="hero-detail">
              <div className="hero-detail-head">
                <h3 className="console-subheading">
                  {labels["hero.slide"]} {index + 1}
                </h3>
                <Checkbox
                  label={labels["hero.active"]}
                  checked={selected.active}
                  disabled={!canWrite || busy}
                  onChange={(event) => updateSlide({ active: event.target.checked })}
                />
              </div>

              <div className="hero-preview" dir={previewDir}>
                {selected.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.image} alt="" loading="lazy" className="hero-preview-photo" />
                    <div className="hero-preview-shade" aria-hidden="true" />
                    <div className="hero-preview-copy">
                      {headingPreview ? (
                        <p className="hero-preview-heading">{headingPreview}</p>
                      ) : (
                        <p className="hero-preview-authored">{labels["hero.preview.authored"]}</p>
                      )}
                      {subPreview ? <p className="hero-preview-sub">{subPreview}</p> : null}
                      {ctaLabelPreview && ctaHrefPreview ? (
                        <span className="hero-preview-cta">{ctaLabelPreview}</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <Empty>{labels["hero.preview.empty"]}</Empty>
                )}
              </div>
              <Note>{labels["hero.preview.lede"]}</Note>
              {selected.imageMobile ? <Note>{labels["hero.preview.mobile"]}</Note> : null}

              <div className="hero-image-grid">
                <Field label={labels["hero.image"]} htmlFor={`${uid}-image`} errors={errorsFor("image")}>
                  <ImagePicker
                    labels={labels}
                    value={selected.image}
                    disabled={!canWrite || busy}
                    inputId={`${uid}-image`}
                    alt={selected.alt}
                    ratio="wide"
                    onChange={(next) => updateSlide({ image: next })}
                  />
                </Field>
                <Field label={labels["hero.image_mobile"]} htmlFor={`${uid}-mobile`} note={<Note>{labels["hero.image_mobile_hint"]}</Note>}>
                  <ImagePicker
                    labels={labels}
                    value={selected.imageMobile ?? ""}
                    disabled={!canWrite || busy}
                    inputId={`${uid}-mobile`}
                    alt={selected.alt}
                    ratio="wide"
                    onChange={(next) => updateSlide({ imageMobile: next.trim() === "" ? null : next })}
                  />
                </Field>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.alt"]}</p>
                <div className="console-doc-pair">
                  <Field label={pairName(labels["hero.alt"], labels["content.locale.ar"])} htmlFor={`${uid}-alt-ar`} errors={errorsFor("alt")}>
                    <Input
                      id={`${uid}-alt-ar`}
                      dir="rtl"
                      value={selected.alt.ar}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.heading}
                      onChange={(event) => setAlt("ar", event.target.value)}
                    />
                  </Field>
                  <Field label={pairName(labels["hero.alt"], labels["content.locale.en"])} htmlFor={`${uid}-alt-en`}>
                    <Input
                      id={`${uid}-alt-en`}
                      dir="ltr"
                      value={selected.alt.en}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.heading}
                      onChange={(event) => setAlt("en", event.target.value)}
                    />
                  </Field>
                </div>
                <Note>{labels["hero.alt_hint"]}</Note>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.heading"]}</p>
                <div className="console-doc-pair">
                  <Field label={pairName(labels["hero.heading"], labels["content.locale.ar"])} htmlFor={`${uid}-heading-ar`}>
                    <Input
                      id={`${uid}-heading-ar`}
                      dir="rtl"
                      value={selected.heading?.ar ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.heading}
                      onChange={(event) => setLine("heading", "ar", event.target.value)}
                    />
                  </Field>
                  <Field label={pairName(labels["hero.heading"], labels["content.locale.en"])} htmlFor={`${uid}-heading-en`}>
                    <Input
                      id={`${uid}-heading-en`}
                      dir="ltr"
                      value={selected.heading?.en ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.heading}
                      onChange={(event) => setLine("heading", "en", event.target.value)}
                    />
                  </Field>
                </div>
                <Note>{labels["hero.heading_hint"]}</Note>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.sub"]}</p>
                <div className="console-doc-pair">
                  <Field label={pairName(labels["hero.sub"], labels["content.locale.ar"])} htmlFor={`${uid}-sub-ar`}>
                    <Input
                      id={`${uid}-sub-ar`}
                      dir="rtl"
                      value={selected.sub?.ar ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.sub}
                      onChange={(event) => setLine("sub", "ar", event.target.value)}
                    />
                  </Field>
                  <Field label={pairName(labels["hero.sub"], labels["content.locale.en"])} htmlFor={`${uid}-sub-en`}>
                    <Input
                      id={`${uid}-sub-en`}
                      dir="ltr"
                      value={selected.sub?.en ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.sub}
                      onChange={(event) => setLine("sub", "en", event.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.cta_label"]}</p>
                <div className="console-doc-pair">
                  <Field label={pairName(labels["hero.cta_label"], labels["content.locale.ar"])} htmlFor={`${uid}-cta-label-ar`}>
                    <Input
                      id={`${uid}-cta-label-ar`}
                      dir="rtl"
                      value={selected.cta?.label.ar ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.ctaLabel}
                      onChange={(event) => setCtaLabel("ar", event.target.value)}
                    />
                  </Field>
                  <Field label={pairName(labels["hero.cta_label"], labels["content.locale.en"])} htmlFor={`${uid}-cta-label-en`}>
                    <Input
                      id={`${uid}-cta-label-en`}
                      dir="ltr"
                      value={selected.cta?.label.en ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.ctaLabel}
                      onChange={(event) => setCtaLabel("en", event.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.cta_href"]}</p>
                <div className="console-doc-pair">
                  <Field label={pairName(labels["hero.cta_href"], labels["content.locale.ar"])} htmlFor={`${uid}-cta-href-ar`} errors={errorsFor("cta")}>
                    <Input
                      id={`${uid}-cta-href-ar`}
                      dir="ltr"
                      value={selected.cta?.href.ar ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.image}
                      placeholder="/offers"
                      onChange={(event) => setCtaHref("ar", event.target.value)}
                    />
                  </Field>
                  <Field label={pairName(labels["hero.cta_href"], labels["content.locale.en"])} htmlFor={`${uid}-cta-href-en`}>
                    <Input
                      id={`${uid}-cta-href-en`}
                      dir="ltr"
                      value={selected.cta?.href.en ?? ""}
                      disabled={!canWrite || busy}
                      maxLength={HERO_LIMITS.image}
                      placeholder="/en/offers"
                      onChange={(event) => setCtaHref("en", event.target.value)}
                    />
                  </Field>
                </div>
                <Note>{labels["hero.cta_hint"]}</Note>
              </div>

              <div className="hero-field-group">
                <p className="console-doc-label">{labels["hero.schedule"]}</p>
                <div className="console-doc-pair">
                  <Field label={labels["hero.starts_at"]} htmlFor={`${uid}-starts`}>
                    <Input
                      id={`${uid}-starts`}
                      type="datetime-local"
                      dir="ltr"
                      value={mounted ? toLocalInput(selected.startsAt) : ""}
                      disabled={!canWrite || busy}
                      onChange={(event) => updateSlide({ startsAt: fromLocalInput(event.target.value) })}
                    />
                  </Field>
                  <Field label={labels["hero.ends_at"]} htmlFor={`${uid}-ends`} errors={errorsFor("endsAt")}>
                    <Input
                      id={`${uid}-ends`}
                      type="datetime-local"
                      dir="ltr"
                      value={mounted ? toLocalInput(selected.endsAt) : ""}
                      disabled={!canWrite || busy}
                      onChange={(event) => updateSlide({ endsAt: fromLocalInput(event.target.value) })}
                    />
                  </Field>
                </div>
                <Note>{labels["hero.schedule_hint"]}</Note>
              </div>
            </div>
          ) : (
            <div className="hero-detail hero-detail-empty">
              <Empty>{draft.slides.length === 0 ? labels["hero.empty"] : labels["hero.select"]}</Empty>
            </div>
          )}
        </div>
      </Section>

      <Section
        id="hero-playback"
        index="02"
        title={labels["hero.settings.heading"]}
        lede={labels["hero.settings.lede"]}
        dirty={settingsDirty}
        dirtyLabel={labels["settings.unsaved"]}
        busy={busy}
        footer={
          <>
            <Note>{labels["hero.limit"]}</Note>
            <Button variant={dirty ? "primary" : "default"} loading={busy} disabled={!canWrite || busy} onClick={() => void save()}>
              {labels["content.save"]}
            </Button>
          </>
        }
      >
        <div className="hero-settings-grid">
          <div className="hero-toggle">
            <Checkbox
              label={labels["hero.autoplay"]}
              checked={draft.settings.autoplay}
              disabled={!canWrite || busy}
              onChange={(event) => setSettings({ autoplay: event.target.checked })}
            />
          </div>
          <Field label={labels["hero.interval"]} htmlFor={`${uid}-interval`}>
            <Input
              id={`${uid}-interval`}
              type="number"
              dir="ltr"
              min={HERO_LIMITS.intervalMs.min / 1000}
              max={HERO_LIMITS.intervalMs.max / 1000}
              step={1}
              value={Math.round(draft.settings.intervalMs / 1000)}
              disabled={!canWrite || busy}
              onChange={(event) =>
                setSettings({ intervalMs: event.target.value === "" ? HERO_DEFAULTS.intervalMs : Math.round(Number(event.target.value)) * 1000 })
              }
            />
          </Field>
          <Field label={labels["hero.fade"]} htmlFor={`${uid}-fade`}>
            <Input
              id={`${uid}-fade`}
              type="number"
              dir="ltr"
              min={HERO_LIMITS.fadeMs.min}
              max={HERO_LIMITS.fadeMs.max}
              step={100}
              value={draft.settings.fadeMs}
              disabled={!canWrite || busy}
              onChange={(event) =>
                setSettings({ fadeMs: event.target.value === "" ? HERO_DEFAULTS.fadeMs : Math.round(Number(event.target.value)) })
              }
            />
          </Field>
          <div className="hero-toggle">
            <Checkbox
              label={labels["hero.pause_on_hover"]}
              checked={draft.settings.pauseOnHover}
              disabled={!canWrite || busy}
              onChange={(event) => setSettings({ pauseOnHover: event.target.checked })}
            />
          </div>
          <div className="hero-toggle">
            <Checkbox
              label={labels["hero.dots"]}
              checked={draft.settings.dots}
              disabled={!canWrite || busy}
              onChange={(event) => setSettings({ dots: event.target.checked })}
            />
          </div>
          <div className="hero-toggle">
            <Checkbox
              label={labels["hero.arrows"]}
              checked={draft.settings.arrows}
              disabled={!canWrite || busy}
              onChange={(event) => setSettings({ arrows: event.target.checked })}
            />
          </div>
          <div className="hero-toggle">
            <Checkbox
              label={labels["hero.loop"]}
              checked={draft.settings.loop}
              disabled={!canWrite || busy}
              onChange={(event) => setSettings({ loop: event.target.checked })}
            />
          </div>
        </div>
        {issues.some((issue) => issue.path.startsWith("settings.")) ? (
          <Alert tone="danger" role="alert">
            <ul className="hero-issue-list">
              {issues
                .filter((issue) => issue.path.startsWith("settings."))
                .map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>{issueText(issue)}</li>
                ))}
            </ul>
          </Alert>
        ) : null}
      </Section>
    </div>
  );
}
