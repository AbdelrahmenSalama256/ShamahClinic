"use client";

/**
 * Marketing & Tracking: the tags the site loads, and where a lead goes.
 *
 * The tag half is a form over the same registry the public site is built from, so the
 * row here, the plan the site injects and the test that proves no vendor loads twice all
 * read one list. A row can be saved but off, and a saved row that Tag Manager already
 * loads is marked rather than injected.
 *
 * The sheet half is a connector, not a second copy of the leads: the lead is written to
 * the database first and the outbox is a promise to deliver, so this screen can offer
 * "send a test", "resend the failures" and a log without any control that deletes a lead.
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
  type Tone,
} from "@/components/console/kit";
import type { MessageKey } from "@/lib/console/messages";
import type { ConsoleLocale } from "@/lib/console/prefs";
import type { IntegrationHistoryRow } from "@/lib/integrations/history";
import type { SheetsView } from "@/lib/integrations/view";
import {
  TRACKING_PROVIDERS,
  planIsEmpty,
  planTags,
  providerByKey,
  validateId,
  type ProviderConfig,
  type ProviderKey,
  type TrackingConfig,
} from "@/lib/tracking/providers";

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  text: string;
}

interface CheckResult {
  tone: Tone;
  text: string;
}

interface Counts {
  sent: number;
  failed: number;
  skipped: number;
}

function cloneConfig(config: TrackingConfig): TrackingConfig {
  const out: TrackingConfig = {};
  for (const provider of TRACKING_PROVIDERS) {
    const row = config[provider.key];
    if (row) out[provider.key] = { ...row };
  }
  return out;
}

/** One stable string per row, so "dirty" means a real edit and not a new object. */
function signature(config: TrackingConfig): string {
  return TRACKING_PROVIDERS.map((provider) => {
    const row = config[provider.key];
    if (!row || row.id.trim() === "") return `${provider.key}::`;
    return `${provider.key}:${row.id.trim()}:${row.enabled ? 1 : 0}:${(row.label ?? "").trim()}`;
  }).join("|");
}

/** A stable, timezone-proof stamp: the server and the browser must agree on this text. */
function stamp(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "";
}

/** The saved view, taken out of an action response that also carries a result. */
function viewFrom(data: unknown): SheetsView | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<SheetsView>;
  if (!candidate.integration || !Array.isArray(candidate.headers) || !Array.isArray(candidate.log)) return null;
  return candidate as SheetsView;
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * A historical tag document, read without validation: an ID that would be refused today
 * still has to appear as the change it was, or the log would hide the row it explains.
 */
function configOf(value: unknown): TrackingConfig {
  const raw = objectOf(value);
  const out: TrackingConfig = {};
  if (!raw) return out;
  for (const provider of TRACKING_PROVIDERS) {
    const row = objectOf(raw[provider.key]);
    if (!row || typeof row.id !== "string" || row.id.trim() === "") continue;
    out[provider.key] = {
      id: row.id,
      ...(typeof row.label === "string" && row.label.trim() ? { label: row.label } : {}),
      enabled: row.enabled !== false,
    };
  }
  return out;
}

function historyTarget(entityId: string): MessageKey {
  switch (entityId) {
    case "tracking.providers":
      return "tracking.history.target.tracking";
    case "sheets":
      return "tracking.history.target.sheets";
    case "sheets.test":
      return "tracking.history.target.sheets_test";
    case "sheets.resend":
      return "tracking.history.target.sheets_resend";
    case "sheets.drain":
      return "tracking.history.target.sheets_drain";
    default:
      return "tracking.history.target.other";
  }
}

function countText(value: unknown, labels: Labels): string {
  const row = objectOf(value);
  if (!row) return labels["tracking.history.unchanged"];
  return labels["sheets.result"]
    .replace("{sent}", String(Number(row.sent ?? 0)))
    .replace("{failed}", String(Number(row.failed ?? 0)))
    .replace("{skipped}", String(Number(row.skipped ?? 0)));
}

function tagChanges(before: unknown, after: unknown, locale: ConsoleLocale, labels: Labels): string[] {
  const from = configOf(before);
  const to = configOf(after);
  const lines: string[] = [];

  for (const provider of TRACKING_PROVIDERS) {
    const earlier = from[provider.key];
    const later = to[provider.key];
    if (!earlier && !later) continue;
    const name = provider.label[locale];
    if (!earlier && later) {
      lines.push(`${name}: ${later.id} · ${labels["tracking.history.added"]}`);
      continue;
    }
    if (earlier && !later) {
      lines.push(`${name}: ${earlier.id} · ${labels["tracking.history.removed"]}`);
      continue;
    }
    if (!earlier || !later) continue;
    if (earlier.id !== later.id) lines.push(`${name}: ${earlier.id} → ${later.id}`);
    if (earlier.enabled !== later.enabled) {
      lines.push(`${name}: ${labels[later.enabled ? "tracking.provider.on" : "tracking.provider.off"]}`);
    }
    if ((earlier.label ?? "") !== (later.label ?? "")) {
      lines.push(labels["tracking.history.label_set"].replace("{label}", later.label ?? "—"));
    }
  }

  return lines.length > 0 ? lines : [labels["tracking.history.unchanged"]];
}

function sheetChange(before: unknown, after: unknown, labels: Labels): string {
  const describe = (value: unknown): string | null => {
    const row = objectOf(value);
    if (!row) return null;
    const url = typeof row.maskedUrl === "string" && row.maskedUrl ? row.maskedUrl : "—";
    const state = labels[row.enabled === true ? "tracking.provider.on" : "tracking.provider.off"];
    const token = row.tokenSet === true ? ` · ${labels["sheets.token.saved"]}` : "";
    return `${url} · ${state}${token}`;
  };
  const earlier = describe(before);
  const later = describe(after) ?? labels["tracking.history.unchanged"];
  return earlier && earlier !== later ? `${earlier} → ${later}` : later;
}

function historyChanges(row: IntegrationHistoryRow, locale: ConsoleLocale, labels: Labels): string[] {
  switch (row.entityId) {
    case "tracking.providers":
      return tagChanges(row.before, row.after, locale, labels);
    case "sheets":
      return [sheetChange(row.before, row.after, labels)];
    case "sheets.test": {
      const result = objectOf(row.after);
      const passed = result?.ok === true;
      const detail = typeof result?.error === "string" && result.error ? ` ${result.error}` : "";
      return [`${labels[passed ? "sheets.test.passed" : "sheets.test.failed"]}${detail}`];
    }
    case "sheets.resend":
      return [`${labels["sheets.resend.done"]} ${countText(row.after, labels)}`];
    case "sheets.drain":
      return [countText(row.after, labels)];
    default:
      return [labels["tracking.history.unchanged"]];
  }
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

export function TrackingWorkspace({
  config,
  sheets,
  history,
  locale,
  labels,
  canWrite,
}: Readonly<{
  config: TrackingConfig;
  sheets: SheetsView;
  history: IntegrationHistoryRow[];
  locale: ConsoleLocale;
  labels: Labels;
  canWrite: boolean;
}>) {
  const router = useRouter();
  const initial = useMemo(() => cloneConfig(config), [config]);
  const [draft, setDraft] = useState<TrackingConfig>(initial);
  const [checks, setChecks] = useState<Partial<Record<ProviderKey, CheckResult>>>({});
  const [checking, setChecking] = useState<ProviderKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeId = useId();

  const [sheetView, setSheetView] = useState<SheetsView>(sheets);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [enabled, setEnabled] = useState(sheets.integration.enabled);
  const [copied, setCopied] = useState<"script" | "headers" | null>(null);

  const plan = useMemo(() => planTags(draft), [draft]);
  const tagsDirty = signature(draft) !== signature(initial);
  const sheetDirty =
    url.trim() !== "" || token.trim() !== "" || removeToken || enabled !== sheetView.integration.enabled;

  function failure(prefix: "tracking" | "sheets", code: string | null): void {
    const mapped = `${prefix}.error.${code ?? "save"}` as MessageKey;
    setNotice({ tone: "danger", text: labels[mapped] ?? labels[`${prefix}.error.save` as MessageKey] });
  }

  function rowOf(key: ProviderKey): ProviderConfig {
    return draft[key] ?? { id: "", enabled: false };
  }

  function setRow(key: ProviderKey, next: ProviderConfig): void {
    setDraft((state) => ({ ...state, [key]: next }));
    setChecks((state) => {
      if (!state[key]) return state;
      const after = { ...state };
      delete after[key];
      return after;
    });
  }

  function stateOf(key: ProviderKey): "empty" | "invalid" | "off" | "suppressed" | "on" {
    const row = draft[key];
    if (!row || row.id.trim() === "") return "empty";
    const provider = providerByKey(key);
    if (!provider) return "invalid";
    if (!validateId(provider, row.id, row.label).ok) return "invalid";
    if (!row.enabled) return "off";
    if (plan.suppressed.includes(key)) return "suppressed";
    return "on";
  }

  const STATE_LABEL: Record<ReturnType<typeof stateOf>, MessageKey> = {
    empty: "tracking.provider.empty",
    invalid: "tracking.provider.invalid",
    off: "tracking.provider.off",
    suppressed: "tracking.provider.suppressed",
    on: "tracking.provider.on",
  };

  const STATE_TONE: Record<ReturnType<typeof stateOf>, Tone> = {
    empty: "neutral",
    invalid: "danger",
    off: "neutral",
    suppressed: "warn",
    on: "ok",
  };

  async function saveTags(): Promise<void> {
    if (!canWrite) return;
    const firstBad = TRACKING_PROVIDERS.find((provider) => {
      const row = draft[provider.key];
      return row && row.id.trim() !== "" && !validateId(provider, row.id, row.label).ok;
    });
    if (firstBad) {
      setNotice({
        tone: "danger",
        text: `${firstBad.label[locale]}: ${labels["tracking.provider.invalid"]}`,
      });
      return;
    }
    if (!tagsDirty) {
      setNotice({ tone: "neutral", text: labels["settings.no_changes"] });
      return;
    }

    const providers: Record<string, ProviderConfig> = {};
    for (const provider of TRACKING_PROVIDERS) {
      const row = draft[provider.key];
      if (!row || row.id.trim() === "") continue;
      providers[provider.key] = {
        id: row.id.trim(),
        ...(row.label?.trim() ? { label: row.label.trim() } : {}),
        enabled: row.enabled,
      };
    }

    setBusy("tags");
    const result = await consoleCall("/api/console/tracking", "PATCH", { providers });
    setBusy(null);
    if (result.error) {
      failure("tracking", result.error);
      return;
    }
    setChecks({});
    setNotice({ tone: "ok", text: labels["tracking.saved"] });
    router.refresh();
  }

  async function check(key: ProviderKey): Promise<void> {
    if (!canWrite) return;
    setChecking(key);
    const result = await consoleCall<{ state: ReturnType<typeof stateOf>; inPage: boolean | null }>(
      "/api/console/tracking",
      "POST",
      { action: "check", provider: key, lang: locale },
    );
    setChecking(null);
    if (result.error || !result.data) {
      setChecks((state) => ({ ...state, [key]: { tone: "danger", text: labels["tracking.check.failed"] } }));
      return;
    }
    const { state, inPage } = result.data;
    let next: CheckResult;
    if (state === "empty") next = { tone: "warn", text: labels["tracking.check.empty"] };
    else if (state === "invalid") next = { tone: "danger", text: labels["tracking.check.invalid"] };
    else if (state === "off") next = { tone: "neutral", text: labels["tracking.check.off"] };
    else if (state === "suppressed") next = { tone: "neutral", text: labels["tracking.check.suppressed"] };
    else if (inPage === true) next = { tone: "ok", text: labels["tracking.check.on"] };
    else if (inPage === false) next = { tone: "warn", text: labels["tracking.check.not_in_page"] };
    else next = { tone: "warn", text: labels["tracking.check.failed"] };
    setChecks((state) => ({ ...state, [key]: next }));
  }

  async function copy(text: string, which: "script" | "headers"): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice({ tone: "danger", text: labels["sheets.copy_failed"] });
    }
  }

  async function saveSheet(): Promise<void> {
    if (!canWrite) return;
    setBusy("sheets:save");
    const result = await consoleCall<SheetsView>("/api/console/sheets", "PATCH", {
      url,
      enabled,
      ...(removeToken ? { token: "" } : token.trim() ? { token: token.trim() } : {}),
    });
    setBusy(null);
    if (result.error) {
      failure("sheets", result.error);
      return;
    }
    const next = viewFrom(result.data);
    if (next) {
      setSheetView(next);
      setEnabled(next.integration.enabled);
    }
    setUrl("");
    setToken("");
    setRemoveToken(false);
    setNotice({ tone: "ok", text: labels["sheets.saved"] });
    router.refresh();
  }

  function countsOf(counts: Counts): string {
    return labels["sheets.result"]
      .replace("{sent}", String(counts.sent))
      .replace("{failed}", String(counts.failed))
      .replace("{skipped}", String(counts.skipped));
  }

  async function act(action: "test" | "drain" | "resend"): Promise<void> {
    if (!canWrite) return;
    setBusy(`sheets:${action}`);
    const result = await consoleCall<Record<string, unknown>>("/api/console/sheets", "POST", { action });
    setBusy(null);
    if (result.error) {
      failure("sheets", result.error);
      return;
    }
    const data = result.data;
    const next = viewFrom(data);
    if (next) setSheetView(next);

    if (action === "test") {
      const sent = data?.result as { ok?: boolean; error?: string } | undefined;
      setNotice(
        sent?.ok
          ? { tone: "ok", text: labels["sheets.test.ok"] }
          : { tone: "danger", text: `${labels["sheets.test.fail"]}${sent?.error ? ` ${sent.error}` : ""}` },
      );
    } else if (action === "resend") {
      const counts = data?.result as Counts | undefined;
      setNotice({
        tone: "ok",
        text: counts ? `${labels["sheets.resend.done"]} ${countsOf(counts)}` : labels["sheets.resend.done"],
      });
    } else {
      const counts = data?.result as Counts | undefined;
      setNotice(
        counts
          ? { tone: counts.failed > 0 ? "warn" : "ok", text: countsOf(counts) }
          : { tone: "neutral", text: labels["sheets.log.empty"] },
      );
    }
    router.refresh();
  }

  async function revertHistory(row: IntegrationHistoryRow): Promise<void> {
    if (!canWrite || !row.revertable) return;
    setBusy(`history:${row.id}`);
    const result = await consoleCall<{ config: TrackingConfig }>("/api/console/tracking", "POST", {
      action: "revert",
      id: row.id,
    });
    setBusy(null);
    if (result.error) {
      failure("tracking", result.error);
      return;
    }
    if (result.data?.config) {
      setDraft(cloneConfig(result.data.config));
      setChecks({});
    }
    setNotice({ tone: "ok", text: labels["tracking.history.reverted"] });
    router.refresh();
  }

  const lastTest = sheetView.lastTest;

  return (
    <div className="settings-workspace">
      {!canWrite && <Alert tone="neutral">{labels["tracking.readonly"]}</Alert>}
      {notice && (
        <div className="settings-notice" id={noticeId}>
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      <Section
        id="tracking-tags"
        index="01"
        title={labels["tracking.section.providers"]}
        lede={labels["tracking.section.providers_lede"]}
        dirty={tagsDirty}
        dirtyLabel={labels["settings.unsaved"]}
        busy={busy === "tags"}
        footer={
          <>
            <Note>{labels["tracking.check.limit"]}</Note>
            <Button
              variant={tagsDirty ? "primary" : "default"}
              loading={busy === "tags"}
              disabled={!canWrite || busy !== null}
              onClick={() => void saveTags()}
            >
              {labels["content.save"]}
            </Button>
          </>
        }
      >
        <ul className="settings-pages">
          {TRACKING_PROVIDERS.map((provider) => {
            const row = rowOf(provider.key);
            const state = stateOf(provider.key);
            const id = `track-${provider.key}`;
            const labelId = `${id}-label`;
            const verdict = row.id.trim() === "" ? null : validateId(provider, row.id, row.label);
            const errors = verdict && !verdict.ok ? [labels["tracking.provider.invalid"]] : [];
            const result = checks[provider.key];
            return (
              <li className="settings-page tracking-provider" key={provider.key} data-dirty={verdict && !verdict.ok ? true : undefined}>
                <div className="settings-page-id">
                  <span className="settings-page-label">{provider.label[locale]}</span>
                  <Badge tone={STATE_TONE[state]}>{labels[STATE_LABEL[state]]}</Badge>
                </div>
                <Note>{provider.hint[locale]}</Note>

                <Card flat flush className="tracking-provider-fields">
                  <Field label={labels["tracking.provider.id"]} htmlFor={id} errors={errors}>
                    <Input
                      id={id}
                      dir="ltr"
                      value={row.id}
                      placeholder={provider.placeholder}
                      disabled={!canWrite || busy !== null}
                      onChange={(event) => setRow(provider.key, { ...row, id: event.target.value })}
                    />
                  </Field>
                  {provider.hasLabel && (
                    <Field
                      label={labels["tracking.provider.label"]}
                      htmlFor={labelId}
                      note={<Note>{labels["tracking.provider.label_hint"]}</Note>}
                    >
                      <Input
                        id={labelId}
                        dir="ltr"
                        value={row.label ?? ""}
                        placeholder={provider.example}
                        disabled={!canWrite || busy !== null}
                        onChange={(event) => setRow(provider.key, { ...row, label: event.target.value })}
                      />
                    </Field>
                  )}
                </Card>

                <div className="settings-page-controls">
                  <Checkbox
                    id={`${id}-on`}
                    checked={row.enabled}
                    disabled={!canWrite || busy !== null}
                    onChange={(event) => setRow(provider.key, { ...row, enabled: event.target.checked })}
                    label={labels["tracking.provider.on"]}
                  />
                  <Note>{labels["tracking.provider.enable_hint"]}</Note>
                  {state === "suppressed" && <Note tone="warn">{labels["tracking.provider.suppressed_hint"]}</Note>}
                </div>

                <div className="settings-page-actions">
                  <Button
                    size="sm"
                    loading={checking === provider.key}
                    disabled={!canWrite || tagsDirty || checking !== null || busy !== null}
                    onClick={() => void check(provider.key)}
                  >
                    {labels["tracking.check"]}
                  </Button>
                </div>
                {result && <Alert tone={result.tone}>{result.text}</Alert>}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="tracking-plan"
        index="02"
        title={labels["tracking.section.plan"]}
        lede={labels["tracking.check.limit"]}
        dirtyLabel={labels["settings.unsaved"]}
      >
        {planIsEmpty(plan) && plan.suppressed.length === 0 && plan.invalid.length === 0 ? (
          <Note>{labels["tracking.plan.empty"]}</Note>
        ) : (
          <dl className="tracking-plan">
            <dt>{labels["tracking.plan.gtm"]}</dt>
            <dd dir="ltr">{plan.gtm ?? labels["tracking.plan.none"]}</dd>
            <dt>{labels["tracking.plan.gtag"]}</dt>
            <dd dir="ltr">{plan.gtagIds.length > 0 ? plan.gtagIds.join(", ") : labels["tracking.plan.none"]}</dd>
            <dt>{labels["tracking.plan.vendors"]}</dt>
            <dd>
              {plan.vendors.length > 0
                ? plan.vendors.map((vendor) => (
                    <span key={vendor.key} className="tracking-plan-vendor">
                      <span>{providerByKey(vendor.key)?.label[locale] ?? vendor.key}</span>{" "}
                      <code dir="ltr">{vendor.id}</code>
                    </span>
                  ))
                : labels["tracking.plan.none"]}
            </dd>
            {plan.suppressed.length > 0 && (
              <>
                <dt>{labels["tracking.plan.suppressed"]}</dt>
                <dd>{plan.suppressed.map((key) => providerByKey(key)?.label[locale] ?? key).join(", ")}</dd>
              </>
            )}
            {plan.invalid.length > 0 && (
              <>
                <dt>{labels["tracking.plan.invalid"]}</dt>
                <dd>{plan.invalid.map((key) => providerByKey(key)?.label[locale] ?? key).join(", ")}</dd>
              </>
            )}
          </dl>
        )}
      </Section>

      <Section
        id="tracking-consent"
        index="03"
        title={labels["tracking.section.consent"]}
        lede={labels["tracking.consent.body"]}
        dirtyLabel={labels["settings.unsaved"]}
      >
        <p className="tracking-consent">{labels["tracking.consent.events"]}</p>
      </Section>

      <Section
        id="tracking-sheets"
        index="04"
        title={labels["sheets.heading"]}
        lede={labels["sheets.intro"]}
        dirty={sheetDirty}
        dirtyLabel={labels["settings.unsaved"]}
        busy={busy === "sheets:save"}
        footer={
          <>
            <Note>{labels["sheets.never_lost"]}</Note>
            <Button
              variant="primary"
              loading={busy === "sheets:save"}
              disabled={!canWrite || busy !== null}
              onClick={() => void saveSheet()}
            >
              {labels["content.save"]}
            </Button>
            <Button
              loading={busy === "sheets:test"}
              disabled={!canWrite || sheetDirty || busy !== null}
              onClick={() => void act("test")}
            >
              {labels["sheets.test"]}
            </Button>
            <Button
              loading={busy === "sheets:drain"}
              disabled={!canWrite || sheetDirty || busy !== null}
              onClick={() => void act("drain")}
            >
              {labels["sheets.drain"]}
            </Button>
            <Button
              loading={busy === "sheets:resend"}
              disabled={!canWrite || sheetDirty || busy !== null}
              onClick={() => void act("resend")}
            >
              {labels["sheets.resend"]}
            </Button>
          </>
        }
      >
        <div className="tracking-sheet-head">
          <Badge tone={sheetView.integration.configured ? "ok" : "neutral"}>
            {sheetView.integration.configured ? labels["sheets.connected"] : labels["sheets.not_configured"]}
          </Badge>
          {sheetView.integration.tokenSet && <Badge>{labels["sheets.token.saved"]}</Badge>}
        </div>
        {sheetView.integration.lastError && (
          <Alert tone="danger">
            {labels["sheets.last_error"]} {sheetView.integration.lastError}
          </Alert>
        )}

        <ol className="tracking-steps">
          <li>{labels["sheets.step.1"]}</li>
          <li>{labels["sheets.step.2"]}</li>
          <li>{labels["sheets.step.3"]}</li>
          <li>{labels["sheets.step.4"]}</li>
        </ol>

        <div className="tracking-sheet-form">
          <Field
            label={labels["sheets.url"]}
            htmlFor="sheets-url"
            note={
              <>
                <Note>{labels["sheets.url.hint"]}</Note>
                {sheetView.integration.urlSet && (
                  <Note>
                    {labels["sheets.url.saved"]} <code dir="ltr">{sheetView.integration.maskedUrl}</code>
                  </Note>
                )}
              </>
            }
          >
            <Input
              id="sheets-url"
              dir="ltr"
              value={url}
              placeholder={sheetView.integration.maskedUrl || "https://script.google.com/macros/s/…/exec"}
              disabled={!canWrite || busy !== null}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>

          <Checkbox
            id="sheets-enabled"
            checked={enabled}
            disabled={!canWrite || busy !== null}
            onChange={(event) => setEnabled(event.target.checked)}
            label={labels["sheets.enabled"]}
          />
          <Note>{labels["sheets.enabled_hint"]}</Note>

          <details className="tracking-token">
            <summary>{labels["sheets.token.tab"]}</summary>
            <Field
              label={labels["sheets.token"]}
              htmlFor="sheets-token"
              note={
                <>
                  <Note>{labels["sheets.token.hint"]}</Note>
                  <Note>{labels["sheets.token.keep"]}</Note>
                </>
              }
            >
              <Input
                id="sheets-token"
                dir="ltr"
                type="password"
                autoComplete="off"
                value={token}
                disabled={!canWrite || busy !== null || removeToken}
                onChange={(event) => setToken(event.target.value)}
              />
            </Field>
            <Checkbox
              id="sheets-token-remove"
              checked={removeToken}
              disabled={!canWrite || busy !== null}
              onChange={(event) => setRemoveToken(event.target.checked)}
              label={labels["sheets.token.remove"]}
            />
          </details>
        </div>

        <div className="tracking-script-block">
          <div className="tracking-copy-row">
            <h3 className="console-subheading">{labels["sheets.script.heading"]}</h3>
            <Button size="sm" onClick={() => void copy(sheetView.script, "script")}>
              {copied === "script" ? labels["sheets.copied"] : labels["sheets.copy"]}
            </Button>
          </div>
          <pre className="tracking-script">
            <code>{sheetView.script}</code>
          </pre>
          <Note>{labels["sheets.script.readonly"]}</Note>
        </div>

        <div className="tracking-headers-block">
          <div className="tracking-copy-row">
            <h3 className="console-subheading">{labels["sheets.headers.heading"]}</h3>
            <Button size="sm" onClick={() => void copy(sheetView.headers.join("\t"), "headers")}>
              {copied === "headers" ? labels["sheets.copied"] : labels["sheets.copy"]}
            </Button>
          </div>
          <div className="tracking-headers">
            {sheetView.headers.map((header) => (
              <span key={header} className="tracking-header">
                {header}
              </span>
            ))}
          </div>
        </div>

        <div className="tracking-last-test">
          <strong>{labels["sheets.last_test"]}</strong>
          {lastTest ? (
            <>
              <time dateTime={lastTest.at}>{stamp(lastTest.at)}</time>
              <Badge tone={lastTest.ok ? "ok" : "danger"}>
                {lastTest.ok ? labels["sheets.test.passed"] : labels["sheets.test.failed"]}
              </Badge>
              {lastTest.error && <Note tone="danger">{lastTest.error}</Note>}
            </>
          ) : (
            <Note>{labels["sheets.never_tested"]}</Note>
          )}
        </div>

        <h3 className="console-subheading tracking-log-title">{labels["sheets.log.heading"]}</h3>
        {sheetView.log.length === 0 ? (
          <Note>{labels["sheets.log.empty"]}</Note>
        ) : (
          <Card flat flush className="console-table-wrap tracking-log">
            <table className="console-table">
              <thead>
                <tr>
                  <th scope="col">{labels["sheets.log.lead"]}</th>
                  <th scope="col">{labels["sheets.log.status"]}</th>
                  <th scope="col">{labels["sheets.log.attempts"]}</th>
                  <th scope="col">{labels["sheets.log.queued"]}</th>
                  <th scope="col">{labels["sheets.log.sent"]}</th>
                  <th scope="col">{labels["sheets.log.error"]}</th>
                </tr>
              </thead>
              <tbody>
                {sheetView.log.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <code className="console-row-key" dir="ltr">
                        {row.leadId ? row.leadId.slice(0, 8) : "—"}
                      </code>
                    </td>
                    <td>
                      <Badge
                        tone={row.status === "sent" ? "ok" : row.status === "retrying" ? "warn" : "neutral"}
                      >
                        {labels[`sheets.status.${row.status}` as MessageKey]}
                      </Badge>
                    </td>
                    <td>{row.attempts}</td>
                    <td>
                      <time dateTime={row.createdAt}>{stamp(row.createdAt)}</time>
                    </td>
                    <td>
                      {row.sentAt ? (
                        <time dateTime={row.sentAt}>{stamp(row.sentAt)}</time>
                      ) : (
                        <time dateTime={row.nextAttemptAt}>{stamp(row.nextAttemptAt)}</time>
                      )}
                    </td>
                    <td>
                      {row.lastError ? <span className="tracking-log-error">{row.lastError}</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section
        id="tracking-history"
        index="05"
        title={labels["tracking.section.history"]}
        lede={labels["tracking.history.lede"]}
        dirtyLabel={labels["settings.unsaved"]}
        busy={busy?.startsWith("history:") ? true : undefined}
      >
        {history.length === 0 ? (
          <Note>{labels["tracking.history.empty"]}</Note>
        ) : (
          <ul className="tracking-history">
            {history.map((row) => (
              <li className="tracking-history-row" key={row.id}>
                <div className="tracking-history-head">
                  <Badge>{labels[historyTarget(row.entityId)]}</Badge>
                  <time dateTime={row.at}>{stamp(row.at)}</time>
                  <span className="tracking-history-actor" dir="ltr">
                    {row.actorEmail}
                  </span>
                  {row.revertable && canWrite && (
                    <Button
                      size="sm"
                      loading={busy === `history:${row.id}`}
                      disabled={busy !== null}
                      onClick={() => void revertHistory(row)}
                    >
                      {labels["tracking.history.revert"]}
                    </Button>
                  )}
                </div>
                <ul className="tracking-history-changes">
                  {historyChanges(row, locale, labels).map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
                {row.entityId === "sheets" && <Note>{labels["tracking.history.not_revertable"]}</Note>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
