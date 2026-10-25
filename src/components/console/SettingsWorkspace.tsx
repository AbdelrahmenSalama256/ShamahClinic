"use client";

/**
 * The site's settings as four readable screens and one escape hatch.
 *
 * Pages: every route the site actually renders, each with its own show/hide switch and an
 * optional target to redirect a hidden page to. The registry is `settings-catalog.ts`, so
 * the console cannot list a page the site does not have.
 *
 * Banners: the photo each listing page opens with. The default is the authored photo in
 * `banners-catalog.ts`; a saved row replaces it, and clearing the path restores it.
 *
 * Identity and SEO: the words the site reads from the `site` and `seo` settings groups.
 * They are plain fields here rather than a JSON box, because the person editing a phone
 * number should not have to quote it.
 *
 * Advanced: every other saved row, still as JSON — a group the site reads that this screen
 * has not learned a shape for. A row flagged `is_secret` has no value in the payload at
 * all (`readSettings` withholds it), so this can only say the value exists and where it
 * lives. That is the point of rendering it rather than hiding it: an operator looking for
 * a token needs to learn it is configured in the environment, not that the console is
 * broken.
 */
import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { consoleCall } from "./client-api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Note,
  Textarea,
  type Tone,
} from "@/components/console/kit";
import type { MessageKey } from "@/lib/console/messages";
import type { ConsoleLocale } from "@/lib/console/prefs";
import type { SettingView } from "@/lib/content/settings";
import {
  PAGE_SETTING_GROUP,
  SEO_SETTING_FIELDS,
  SITE_PAGES,
  SITE_SETTING_FIELDS,
  hrefOfPage,
  safeRedirect,
  type SettingField,
  type SitePageKey,
} from "@/lib/content/settings-catalog";
import {
  BANNER_DEFAULTS,
  BANNER_KEYS,
  BANNER_PAGES,
  BANNER_SETTING_GROUP,
  safeBannerSrc,
  type BannerPageKey,
  type BannerSetting,
  type SavedBanners,
} from "@/lib/content/banners-catalog";
import type { PageState, PageStates } from "@/lib/content/page-visibility";
import { ImageGallery } from "./ImageGallery";
import { ImagePicker } from "./ImagePicker";

function encoded(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null, null, 2);
}

/** What each field reads before it is saved: the row when there is one, else the authored value. */
function initialValues(
  rows: readonly SettingView[],
  defaults: Record<string, string>,
): Record<string, string> {
  const values = { ...defaults };
  for (const row of rows) {
    if (row.secret) continue;
    values[`${row.group}.${row.key}`] = encoded(row.value);
  }
  return values;
}

interface Notice {
  tone: Tone;
  text: string;
}

/**
 * A section frame: sticky header, body, sticky-on-mobile footer.
 */
function SettingsSection({
  index,
  title,
  lede,
  detail,
  dirty,
  dirtyLabel,
  busy,
  children,
  footer,
  id,
}: Readonly<{
  index: string;
  title: string;
  lede: string;
  detail?: React.ReactNode;
  dirty: boolean;
  dirtyLabel: string;
  busy: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  id: string;
}>) {
  const titleId = `${id}-title`;
  const ledeId = `${id}-lede`;
  return (
    <Card
      as="section"
      className="console-panel settings-section"
      aria-labelledby={titleId}
      aria-describedby={ledeId}
      aria-busy={busy || undefined}
      data-dirty={dirty || undefined}
      id={id}
    >
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
        <p className="console-lede" id={ledeId}>
          {lede}
        </p>
      </header>
      <div className="settings-section-body">{children}</div>
      {(footer || detail) && (
        <footer className="settings-section-foot">
          {detail ? <Note>{detail}</Note> : null}
          {footer}
        </footer>
      )}
    </Card>
  );
}

export function SettingsWorkspace({
  rows,
  pages,
  banners,
  defaults,
  locale,
  labels,
  canWrite,
}: Readonly<{
  rows: SettingView[];
  pages: PageStates;
  banners: SavedBanners;
  defaults: Record<string, string>;
  locale: ConsoleLocale;
  labels: Record<MessageKey, string>;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const initial = initialValues(rows, defaults);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pageDraft, setPageDraft] = useState<
    Partial<Record<SitePageKey, PageState>>
  >({});
  const [bannerDraft, setBannerDraft] = useState<
    Partial<Record<BannerPageKey, BannerSetting>>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeId = useId();

  const valueOf = (field: SettingField): string => {
    const id = `${field.group}.${field.key}`;
    return draft[id] ?? initial[id] ?? "";
  };

  const stateOf = (key: SitePageKey): PageState => pageDraft[key] ?? pages[key];

  const setField = (field: SettingField, value: string): void => {
    const id = `${field.group}.${field.key}`;
    setDraft((state) => ({ ...state, [id]: value }));
  };

  const setPage = (key: SitePageKey, next: PageState): void => {
    setPageDraft((state) => ({ ...state, [key]: next }));
  };

  const bannerOf = (key: BannerPageKey): BannerSetting =>
    bannerDraft[key] ?? {
      src: banners[key]?.src ?? "",
      altAr: banners[key]?.altAr ?? "",
      altEn: banners[key]?.altEn ?? "",
    };

  const setBanner = (key: BannerPageKey, next: BannerSetting): void => {
    setBannerDraft((state) => ({ ...state, [key]: next }));
  };

  const failure = (code: string | null): void => {
    const mapped = `content.error.${code}` as MessageKey;
    setNotice({
      tone: "danger",
      text: labels[mapped] ?? labels["content.error.save"],
    });
  };

  async function saveFields(
    section: string,
    fields: readonly SettingField[],
  ): Promise<void> {
    const dirty = fields.filter((field) => {
      const id = `${field.group}.${field.key}`;
      return valueOf(field) !== (initial[id] ?? "");
    });
    if (dirty.length === 0) {
      setNotice({ tone: "neutral", text: labels["settings.no_changes"] });
      return;
    }
    setBusy(section);
    for (const field of dirty) {
      const text = valueOf(field);
      const result = await consoleCall("/api/console/settings", "PATCH", {
        group: field.group,
        key: field.key,
        value: text === "" ? null : text,
      });
      if (result.error) {
        setBusy(null);
        failure(result.error);
        return;
      }
    }
    setBusy(null);
    setNotice({ tone: "ok", text: labels["content.saved"] });
    router.refresh();
  }

  async function savePage(key: SitePageKey): Promise<void> {
    const state = stateOf(key);
    const target = state.redirectTo?.trim() ?? "";
    const redirectTo = target ? safeRedirect(target) : null;
    if (target && !redirectTo) {
      setNotice({
        tone: "danger",
        text: labels["settings.pages.redirect_invalid"],
      });
      return;
    }
    setBusy(`page:${key}`);
    const result = await consoleCall("/api/console/settings", "PATCH", {
      group: PAGE_SETTING_GROUP,
      key,
      value: { enabled: state.enabled, redirectTo },
    });
    setBusy(null);
    if (result.error) {
      failure(result.error);
      return;
    }
    setNotice({ tone: "ok", text: labels["content.saved"] });
    setPageDraft((draft) => ({
      ...draft,
      [key]: { enabled: state.enabled, redirectTo: redirectTo ?? "" },
    }));
    router.refresh();
  }

  async function saveBanner(key: BannerPageKey): Promise<void> {
    const value = bannerOf(key);
    const input = value.src.trim();
    const src = input === "" ? null : safeBannerSrc(input);
    if (input !== "" && !src) {
      setNotice({
        tone: "danger",
        text: labels["settings.banners.src_invalid"],
      });
      return;
    }
    setBusy(`banner:${key}`);
    const result = await consoleCall("/api/console/settings", "PATCH", {
      group: BANNER_SETTING_GROUP,
      key,
      value: src
        ? { src, altAr: value.altAr.trim(), altEn: value.altEn.trim() }
        : null,
    });
    setBusy(null);
    if (result.error) {
      failure(result.error);
      return;
    }
    setNotice({ tone: "ok", text: labels["content.saved"] });
    setBannerDraft((draft) => ({
      ...draft,
      [key]: {
        src: src ?? "",
        altAr: src ? value.altAr.trim() : "",
        altEn: src ? value.altEn.trim() : "",
      },
    }));
    router.refresh();
  }

  async function saveRaw(
    row: SettingView,
    text: string,
    id: string,
  ): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      setNotice({ tone: "danger", text: labels["content.error.json"] });
      return;
    }
    setBusy(`raw:${id}`);
    const result = await consoleCall("/api/console/settings", "PATCH", {
      group: row.group,
      key: row.key,
      value,
    });
    setBusy(null);
    if (result.error) {
      failure(result.error);
      return;
    }
    setNotice({ tone: "ok", text: labels["content.saved"] });
    router.refresh();
  }

  const identityDirty = useMemo(
    () =>
      SITE_SETTING_FIELDS.some((field) => {
        const id = `${field.group}.${field.key}`;
        return valueOf(field) !== (initial[id] ?? "");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, initial],
  );

  const seoDirty = useMemo(
    () =>
      SEO_SETTING_FIELDS.some((field) => {
        const id = `${field.group}.${field.key}`;
        return valueOf(field) !== (initial[id] ?? "");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, initial],
  );

  const pagesDirty = useMemo(
    () =>
      SITE_PAGES.some((page) => {
        const state = pageDraft[page.key] ?? pages[page.key];
        return (
          state.enabled !== pages[page.key].enabled ||
          (state.redirectTo ?? "").trim() !== (pages[page.key].redirectTo ?? "")
        );
      }),
    [pageDraft, pages],
  );

  const bannersDirty = useMemo(
    () =>
      BANNER_PAGES.some((page) => {
        const saved = banners[page.key];
        const value = bannerDraft[page.key];
        if (!value) return false;
        return (
          value.src.trim() !== (saved?.src ?? "") ||
          value.altAr.trim() !== (saved?.altAr ?? "") ||
          value.altEn.trim() !== (saved?.altEn ?? "")
        );
      }),
    [bannerDraft, banners],
  );

  const known = new Set(
    [...SITE_SETTING_FIELDS, ...SEO_SETTING_FIELDS].map(
      (field) => `${field.group}.${field.key}`,
    ),
  );
  for (const key of BANNER_KEYS) known.add(`${BANNER_SETTING_GROUP}.${key}`);
  const pageKeys = new Set<string>(SITE_PAGES.map((page) => page.key));
  const advanced = rows.filter((row) => {
    const id = `${row.group}.${row.key}`;
    if (known.has(id)) return false;
    return !(row.group === PAGE_SETTING_GROUP && pageKeys.has(row.key));
  });

  // Note: replace these with the real keys when you add them to messages.ts
  const dirtyLabel = "Unsaved changes";
  const readOnlyLabel = "Read only";

  return (
    <div className="settings-workspace">
      {!canWrite && <Alert tone="neutral">{readOnlyLabel}</Alert>}

      <SettingsSection
        id="settings-pages"
        index="01"
        title={labels["settings.pages.heading"]}
        lede={labels["settings.pages.intro"]}
        detail={labels["settings.pages.detail"]}
        dirty={pagesDirty}
        dirtyLabel={dirtyLabel}
        busy={busy !== null && busy.startsWith("page:")}
      >
        <ul className="settings-pages">
          {SITE_PAGES.map((page) => {
            const state = stateOf(page.key);
            const rowDirty =
              state.enabled !== pages[page.key].enabled ||
              (state.redirectTo ?? "").trim() !==
                (pages[page.key].redirectTo ?? "");
            const redirectId = `page-redirect-${page.key}`;
            const enabledId = `page-enabled-${page.key}`;
            return (
              <li
                className="settings-page"
                key={page.key}
                data-dirty={rowDirty || undefined}
              >
                <div className="settings-page-id">
                  <span className="settings-page-label">
                    {page.label[locale]}
                  </span>
                  <code className="console-row-key settings-page-path" dir="ltr">
                    {hrefOfPage(page)}
                  </code>
                </div>

                <div className="settings-page-controls">
                  <Checkbox
                    id={enabledId}
                    checked={state.enabled}
                    disabled={!canWrite || busy !== null}
                    onChange={(event) =>
                      setPage(page.key, {
                        ...state,
                        enabled: event.target.checked,
                      })
                    }
                    label={labels["settings.pages.enabled"]}
                  />
                  {!state.enabled && (
                    <Field
                      label={labels["settings.pages.redirect"]}
                      htmlFor={redirectId}
                      note={
                        <Note>{labels["settings.pages.redirect_hint"]}</Note>
                      }
                    >
                      <Input
                        id={redirectId}
                        dir="ltr"
                        value={state.redirectTo ?? ""}
                        placeholder="/offers"
                        disabled={!canWrite || busy !== null}
                        onChange={(event) =>
                          setPage(page.key, {
                            ...state,
                            redirectTo: event.target.value,
                          })
                        }
                      />
                    </Field>
                  )}
                </div>

                {canWrite && (
                  <div className="settings-page-actions">
                    <Button
                      size="sm"
                      variant={rowDirty ? "primary" : "default"}
                      loading={busy === `page:${page.key}`}
                      disabled={busy !== null && busy !== `page:${page.key}`}
                      onClick={() => void savePage(page.key)}
                    >
                      {labels["content.save"]}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <SettingsSection
        id="settings-banners"
        index="02"
        title={labels["settings.banners.heading"]}
        lede={labels["settings.banners.intro"]}
        detail={labels["settings.banners.detail"]}
        dirty={bannersDirty}
        dirtyLabel={dirtyLabel}
        busy={busy !== null && busy.startsWith("banner:")}
      >
        <div className="settings-banner-grid">
          {BANNER_PAGES.map((page) => {
            const fallback = BANNER_DEFAULTS[page.key];
            const saved = banners[page.key];
            const value = bannerOf(page.key);
            const preview = safeBannerSrc(value.src.trim()) ?? fallback.src;
            const rowDirty =
              value.src.trim() !== (saved?.src ?? "") ||
              value.altAr.trim() !== (saved?.altAr ?? "") ||
              value.altEn.trim() !== (saved?.altEn ?? "");
            const srcId = `banner-src-${page.key}`;
            const altArId = `banner-alt-ar-${page.key}`;
            const altEnId = `banner-alt-en-${page.key}`;
            return (
              <article
                className="settings-banner"
                key={page.key}
                data-dirty={rowDirty || undefined}
              >
                <div className="settings-banner-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="settings-banner-photo"
                    src={preview}
                    alt=""
                    width={640}
                    height={360}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="settings-banner-meta">
                    {saved ? (
                      <Badge tone="ok">
                        {labels["settings.banners.custom"]}
                      </Badge>
                    ) : (
                      <Badge>Default</Badge>
                    )}
                    {rowDirty && (
                      <span className="settings-dirty">
                        <span
                          className="settings-dirty-dot"
                          aria-hidden="true"
                        />
                        {dirtyLabel}
                      </span>
                    )}
                  </div>
                </div>
                <header className="settings-banner-head">
                  <span className="settings-page-label">
                    {page.label[locale]}
                  </span>
                  <code className="console-row-key settings-page-path" dir="ltr">
                    {page.path === "" ? "/" : page.path}
                  </code>
                </header>
                <div className="console-fields">
                  <Field
                    label={labels["settings.banners.src"]}
                    htmlFor={srcId}
                    note={<Note>{labels["settings.banners.src_hint"]}</Note>}
                  >
                    <ImagePicker
                      labels={labels}
                      value={value.src}
                      disabled={!canWrite}
                      inputId={srcId}
                      ratio="wide"
                      alt={{ ar: value.altAr, en: value.altEn }}
                      onChange={(next) =>
                        setBanner(page.key, { ...value, src: next })
                      }
                    />
                  </Field>
                  <Field
                    label={labels["settings.banners.alt_ar"]}
                    htmlFor={altArId}
                    note={<Note>{labels["settings.banners.alt_hint"]}</Note>}
                  >
                    <Input
                      id={altArId}
                      dir="rtl"
                      value={value.altAr}
                      placeholder={fallback.alt.ar}
                      readOnly={!canWrite}
                      onChange={(event) =>
                        setBanner(page.key, {
                          ...value,
                          altAr: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={labels["settings.banners.alt_en"]}
                    htmlFor={altEnId}
                  >
                    <Input
                      id={altEnId}
                      dir="ltr"
                      value={value.altEn}
                      placeholder={fallback.alt.en}
                      readOnly={!canWrite}
                      onChange={(event) =>
                        setBanner(page.key, {
                          ...value,
                          altEn: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                {canWrite && (
                  <div className="settings-banner-actions">
                    {rowDirty && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() =>
                          setBanner(page.key, {
                            src: saved?.src ?? "",
                            altAr: saved?.altAr ?? "",
                            altEn: saved?.altEn ?? "",
                          })
                        }
                        disabled={busy !== null}
                      >
                        Reset
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={rowDirty ? "primary" : "default"}
                      loading={busy === `banner:${page.key}`}
                      disabled={busy !== null && busy !== `banner:${page.key}`}
                      onClick={() => void saveBanner(page.key)}
                    >
                      {labels["content.save"]}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-site"
        index="03"
        title={labels["settings.site.heading"]}
        lede={labels["settings.site.intro"]}
        dirty={identityDirty}
        dirtyLabel={dirtyLabel}
        busy={busy === "site"}
        footer={
          canWrite ? (
            <Button
              variant="primary"
              loading={busy === "site"}
              disabled={(busy !== null && busy !== "site") || !identityDirty}
              onClick={() => void saveFields("site", SITE_SETTING_FIELDS)}
            >
              {labels["content.save"]}
            </Button>
          ) : null
        }
      >
        <div className="console-fields settings-field-grid">
          {SITE_SETTING_FIELDS.map((field) => {
            const id = `setting-${field.group}-${field.key}`;
            return (
              <Field key={id} label={field.label[locale]} htmlFor={id}>
                {field.multiline ? (
                  <Textarea
                    id={id}
                    rows={2}
                    value={valueOf(field)}
                    placeholder={field.placeholder?.[locale]}
                    readOnly={!canWrite}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                ) : (
                  <Input
                    id={id}
                    value={valueOf(field)}
                    placeholder={field.placeholder?.[locale]}
                    readOnly={!canWrite}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-seo"
        index="04"
        title={labels["settings.seo.heading"]}
        lede={labels["settings.seo.intro"]}
        dirty={seoDirty}
        dirtyLabel={dirtyLabel}
        busy={busy === "seo"}
        footer={
          canWrite ? (
            <Button
              variant="primary"
              loading={busy === "seo"}
              disabled={(busy !== null && busy !== "seo") || !seoDirty}
              onClick={() => void saveFields("seo", SEO_SETTING_FIELDS)}
            >
              {labels["content.save"]}
            </Button>
          ) : null
        }
      >
        <div className="console-fields settings-field-grid">
          {SEO_SETTING_FIELDS.map((field) => {
            const id = `setting-${field.group}-${field.key}`;
            const hint =
              field.key === "verification.google" ? (
                <Note>{labels["settings.seo.verification_hint"]}</Note>
              ) : undefined;
            return (
              <Field
                key={id}
                label={field.label[locale]}
                htmlFor={id}
                note={hint}
              >
                <Textarea
                  id={id}
                  rows={field.multiline ? 3 : 1}
                  dir={field.key === "verification.google" ? "ltr" : undefined}
                  value={valueOf(field)}
                  readOnly={!canWrite}
                  onChange={(event) => setField(field, event.target.value)}
                />
              </Field>
            );
          })}
        </div>
      </SettingsSection>

      {advanced.length > 0 && (
        <SettingsSection
          id="settings-advanced"
          index="05"
          title={labels["settings.advanced.heading"]}
          lede={labels["settings.advanced.intro"]}
          dirty={false}
          dirtyLabel={dirtyLabel}
          busy={false}
        >
          <div className="settings-advanced">
            {advanced.map((row) => {
              const id = `${row.group}.${row.key}`;
              const current = draft[id] ?? encoded(row.value);
              const rowDirty = current !== encoded(row.value);
              return (
                <div
                  className="settings-raw"
                  key={id}
                  data-dirty={rowDirty || undefined}
                >
                  <header className="settings-raw-head">
                    <h3 className="settings-raw-heading">
                      <code className="settings-raw-key">{row.key}</code>
                      <Badge>{row.group}</Badge>
                    </h3>
                    {rowDirty && (
                      <span className="settings-dirty">
                        <span
                          className="settings-dirty-dot"
                          aria-hidden="true"
                        />
                        {dirtyLabel}
                      </span>
                    )}
                  </header>
                  {row.secret ? (
                    <Alert>{labels["content.secret"]}</Alert>
                  ) : (
                    <>
                      <Field label={id} htmlFor={`setting-${id}`}>
                        <Textarea
                          id={`setting-${id}`}
                          rows={5}
                          dir="ltr"
                          value={current}
                          readOnly={!canWrite}
                          className="settings-raw-editor"
                          onChange={(event) =>
                            setDraft((state) => ({
                              ...state,
                              [id]: event.target.value,
                            }))
                          }
                        />
                        <ImageGallery
                          labels={labels}
                          value={current}
                          disabled={!canWrite}
                          onChange={(next) =>
                            setDraft((state) => ({ ...state, [id]: next }))
                          }
                        />
                      </Field>
                      {canWrite && (
                        <div className="settings-raw-actions">
                          <Button
                            variant={rowDirty ? "primary" : "default"}
                            size="sm"
                            loading={busy === `raw:${id}`}
                            disabled={busy !== null && busy !== `raw:${id}`}
                            onClick={() => void saveRaw(row, current, id)}
                          >
                            {labels["content.save"]}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  <Note>
                    {labels["content.updated_at"]}: {row.updatedAt.slice(0, 10)}{" "}
                    · {labels["content.version"]} {row.version}
                  </Note>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      )}

      {notice && (
        <div
          className="settings-notice"
          id={noticeId}
          role="status"
          aria-live="polite"
        >
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}
    </div>
  );
}
