"use client";

/**
 * The Overview: what the site did in the period a person picked.
 *
 * Two rules run through the whole screen:
 *
 *   - Every number is a server aggregate (see `lib/console/overview.ts`), drawn
 *     as-is. Where there is nothing to draw, a panel says so — an empty chart with a
 *     flat zero line reads as a decline, and that would be a lie the data never told.
 *   - A period is a chip, not a form, and the URL carries it. Pressing 7d is a link
 *     someone can hand to a colleague, and reloading keeps the period they chose.
 *
 * The charts are plain SVG: no charting dependency, no canvas to lose the numbers on
 * screen readers, and `vector-effect` keeps a hairline a hairline when the box is
 * narrower than the viewBox. Every chart also carries its rows in a visually hidden
 * table, which is what a screen reader actually reads.
 *
 * The one write here is a lead's status in the latest-leads list: the same endpoint
 * and the same rule as the leads screen — the row's own `editable`, which comes from
 * the caller's grant on that lead's source.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Minus, Printer, RefreshCw } from "lucide-react";
import { consoleCall, consoleRead } from "./client-api";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Chip,
  ChipRow,
  Empty,
  Input,
  Note,
  Select,
  type Tone,
} from "@/components/console/kit";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/kinds";
import type {
  CityRow,
  DeviceRow,
  HeatCell,
  Kpi,
  OverviewData,
  RangeKey,
  Slice,
  TopArticle,
  TopPage,
} from "@/lib/console/overview";
import type { LeadRow } from "@/lib/leads/view";
import type { MessageKey } from "@/lib/console/messages";
import type { ConsoleLocale } from "@/lib/console/prefs";

// ---- charts (Recharts) -----------------------------------------------------
// The console is server-themed on `<html> data-theme`; every brand colour comes from
// the console sheet (`--c-accent`), so the series stay gold on dark *and* on light.
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type Labels = Record<MessageKey, string>;

const RANGES: readonly RangeKey[] = ["today", "7d", "30d", "90d", "custom"];

const RANGE_KEY: Record<RangeKey, MessageKey> = {
  today: "overview.range.today",
  "7d": "overview.range.7d",
  "30d": "overview.range.30d",
  "90d": "overview.range.90d",
  custom: "overview.range.custom",
};

const KPI_KEY: Record<Kpi["key"], MessageKey> = {
  visitors: "overview.kpi.visitors",
  views: "overview.kpi.views",
  leads: "overview.kpi.leads",
  conversion: "overview.kpi.conversion",
};

const STATUS_KEY: Record<LeadStatus, MessageKey> = {
  new: "leads.status.new",
  contacted: "leads.status.contacted",
  booked: "leads.status.booked",
  done: "leads.status.done",
  lost: "leads.status.lost",
};

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "warn",
  contacted: "neutral",
  booked: "ok",
  done: "ok",
  lost: "danger",
};

const SOURCE_KEY: Record<string, MessageKey> = {
  booking: "leads.source.booking",
  "contact-form": "leads.source.contact-form",
};

const DEVICE_KEY: Record<string, MessageKey> = {
  mobile: "overview.devices.mobile",
  desktop: "overview.devices.desktop",
  tablet: "overview.devices.tablet",
  unknown: "overview.devices.unknown",
};

/** Keep in step with `MAX_CUSTOM_DAYS` in lib/console/overview.ts — the server refuses too. */
const MAX_CUSTOM_DAYS = 366;
const DAY_MS = 86_400_000;
const OK_NOTICE_MS = 4500;

/** Western digits in both languages, as the rest of the console writes counts. */
const NUMBER = new Intl.NumberFormat("en-US");
const n = (value: number): string => NUMBER.format(value);
const percent = (value: number): string => `${value.toFixed(1)}%`;
const stamp = (iso: string): string => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "");
const axisDay = (day: string): string => day.slice(5).replace("-", "/");

const CAIRO = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** When the numbers were taken, in the clinic's timezone — the same one the days use. */
function cairoStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = CAIRO.formatToParts(date);
  const at = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${at("year")}-${at("month")}-${at("day")} ${at("hour")}:${at("minute")}`;
}

function sourceName(source: string, labels: Labels): string {
  const key = SOURCE_KEY[source];
  return key ? labels[key] : source;
}

function deviceName(device: string, labels: Labels): string {
  const key = DEVICE_KEY[device];
  return key ? labels[key] : device;
}

/* --- geometry --------------------------------------------------------------- */

/* --- chart pieces ----------------------------------------------------------- */

const VIEW_W = 1000;

// ---- chart colours ---------------------------------------------------------
// Series palette. The console theme is picked server-side (`<html> data-theme`), so
// each chart component reads it once per render and keeps the same colour until the
// next reload; this prevents a theme switch from redrawing every data point.

let cachedTheme: "light" | "dark" | null = null;
const LIGHT_ACCENT = "#85640f";
const DARK_ACCENT = "#e1c15b";

function getChartTheme(): "light" | "dark" {
  if (cachedTheme) return cachedTheme;
  try {
    const value = (document.documentElement as HTMLElement).dataset.theme;
    cachedTheme = value === "dark" ? "dark" : "light";
  } catch {
    cachedTheme = "light";
  }
  return cachedTheme;
}

const SERIES_COLORS = [
  "#85640f",
  "#7c3aed",
  "#0ea5e9",
  "#dc2626",
  "#059669",
  "#d97706",
  "#6366f1",
  "#be185d",
] as const;

function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

// ---- shared chart plumbing ---------------------------------------------------

type TooltipPayload = { label?: string; value?: unknown; name?: string }[];

function tooltipContent(props: any): ReactNode {
  const payload: { label?: string; value?: number; name?: string }[] = props.payload ?? [];
  const theme = getChartTheme();
  const text = theme === "dark" ? "#f5eee2" : "#1a1611";
  const bg = theme === "dark" ? "#292520" : "#ffffff";
  const border = theme === "dark" ? "#3d352a" : "#e5e0d5";
  return (
    <div style={{ color: text, background: bg, borderColor: border, fontSize: 12 }}>
      {payload.map((entry, index) => (
        <div key={index} style={{ fontSize: 12 }}>
          {String(entry.name ?? entry.label ?? "")}
          <b> {n(entry.value ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip() {
  return (
    <Tooltip
      content={(props) => tooltipContent(props)}
      cursor={{ fill: "transparent" }}
    />
  );
}

function XAxisDay({ data, theme }: { data: readonly { day: string }[]; theme: "light" | "dark" }) {
  const tickColor = theme === "dark" ? "#9a8a6a" : "#6b6252";
  return (
    <XAxis
      dataKey="day"
      tick={{ fill: tickColor, fontSize: 11, textAnchor: "end" }}
      axisLine={false}
      tickLine={false}
      interval={0}
      minTickGap={22}
    />
  );
}

function YAxisEmpty({ theme }: { theme: "light" | "dark" }) {
  const tickColor = theme === "dark" ? "#9a8a6a" : "#6b6252";
  return <YAxis hide axisLine={false} tickLine={false} tick={{ fill: tickColor, fontSize: 11 }} />;
}

function Grid({ theme }: { theme: "light" | "dark" }) {
  const stroke = theme === "dark" ? "rgba(170, 148, 100, 0.14)" : "rgba(133, 100, 15, 0.35)";
  return <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={stroke} />;
}

function Panel({
  title,
  intro,
  action,
  className,
  children,
}: Readonly<{ title: string; intro?: string; action?: ReactNode; className?: string; children: ReactNode }>) {
  return (
    <Card as="section" className={`console-ov-card${className ? ` ${className}` : ""}`}>
      <header className="console-ov-card-head">
        <div>
          <h2 className="console-ov-title">{title}</h2>
          {intro ? <p className="console-ov-intro">{intro}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </Card>
  );
}

type LegendKind = "visitors" | "leads" | "previous" | "cta" | "submit" | "rate";

function Legend({ items }: Readonly<{ items: readonly { kind: LegendKind; label: string }[] }>) {
  return (
    <ul className="console-ov-legend">
      {items.map((item) => (
        <li key={item.kind} data-kind={item.kind}>
          <i aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}


/* --- KPI -------------------------------------------------------------------- */

function Sparkline({ values, kpiKey }: Readonly<{ values: readonly number[]; kpiKey: string }>) {
  const theme = getChartTheme();
  const color = theme === "dark" ? DARK_ACCENT : LIGHT_ACCENT;
  const gradientId = `spark-grad-${kpiKey}`;
  const max = Math.max(1, ...values);
  return (
    <AreaChart data={[{ value: values }]} width={100} height={28}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="value" stroke="none" fill={gradientId} strokeWidth={0} />
      <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
    </AreaChart>
  );
}

function KpiCard({ kpi, labels, compare }: Readonly<{ kpi: Kpi; labels: Labels; compare: boolean }>) {
  const shown = kpi.unit === "percent" ? percent(kpi.value) : n(kpi.value);
  const previous = kpi.previous === null ? null : kpi.unit === "percent" ? percent(kpi.previous) : n(kpi.previous);
  const delta = kpi.delta;
  const trend = delta === null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const Arrow = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const direction = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
  const deltaText =
    delta === null
      ? labels["overview.kpi.no_previous"]
      : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(1)}${
          kpi.unit === "percent" ? ` ${labels["overview.unit.points"]}` : "%"
        }`;

  return (
    <article className="console-ov-kpi" data-key={kpi.key}>
      <p className="console-ov-kpi-label">{labels[KPI_KEY[kpi.key]]}</p>
      <p className="console-ov-kpi-value">{shown}</p>
      <div className="console-ov-kpi-foot">
        {delta === null ? (
          <Note>{deltaText}</Note>
        ) : (
          <span className="console-ov-delta" data-trend={trend} aria-label={`${labels[`overview.kpi.${direction}` as MessageKey]} ${deltaText}`}>
            <Arrow size={14} aria-hidden="true" />
            <span aria-hidden="true">{deltaText}</span>
          </span>
        )}
        {compare && previous !== null ? (
          <Note className="console-ov-kpi-previous">
            {labels["overview.kpi.previous"]} {previous}
          </Note>
        ) : null}
      </div>
      <Sparkline values={kpi.series} kpiKey={kpi.key} />
    </article>
  );
}

/* --- traffic ---------------------------------------------------------------- */

function TrafficTable({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const previous = data.previousDaily;
  return (
    <table className="console-sr-only">
      <caption>{labels["overview.chart.table"]}</caption>
      <thead>
        <tr>
          <th scope="col">{labels["overview.chart.date"]}</th>
          <th scope="col">{labels["overview.traffic.visitors"]}</th>
          <th scope="col">{labels["overview.traffic.leads"]}</th>
          {previous ? <th scope="col">{labels["overview.traffic.previous"]}</th> : null}
        </tr>
      </thead>
      <tbody>
        {data.daily.map((point, index) => (
          <tr key={point.day}>
            <th scope="row">{point.day}</th>
            <td>{n(point.visitors)}</td>
            <td>{n(point.leads)}</td>
            {previous ? (
              <td>{`${n(previous[index]?.visitors ?? 0)} / ${n(previous[index]?.leads ?? 0)}`}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrafficPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const days = data.daily;
  const previous = data.previousDaily;
  const theme = getChartTheme();
  const visitorsColor = theme === "dark" ? DARK_ACCENT : LIGHT_ACCENT;
  const leadsColor = seriesColor(1);
  const previousColor = theme === "dark" ? "#6b5d3a" : "#a8874b";
  const leadMax = Math.max(1, ...days.map((point) => point.leads), ...(previous ?? []).map((point) => point.leads));
  const totalViews = days.reduce((total, point) => total + point.views, 0);
  const totalLeads = days.reduce((total, point) => total + point.leads, 0);
  const empty = totalViews === 0 && totalLeads === 0;

  // Merged dataset so every series lives on a single series for the chart.
  const chartPoints: { day: string; visitors: number; leads: number; previousVisitors?: number; previousLeads?: number }[] = days.map((point, index) => ({
    day: point.day,
    visitors: point.visitors,
    leads: point.leads,
    previousVisitors: previous?.[index]?.visitors,
    previousLeads: previous?.[index]?.leads,
  }));

  return (
    <Panel
      title={labels["overview.traffic.title"]}
      intro={labels["overview.traffic.intro"]}
      className="console-ov-card-wide"
    >
      {empty ? (
        <Empty>{labels["overview.traffic.empty"]}</Empty>
      ) : (
        <>
          <Legend
            items={[
              { kind: "visitors", label: labels["overview.traffic.visitors"] },
              ...(previous ? [{ kind: "previous" as const, label: labels["overview.traffic.previous"] }] : []),
              { kind: "leads", label: labels["overview.traffic.leads"] },
            ]}
          />
          {/* visitors: area fill over line, previous as a dashed line. */}
          <div className="console-ov-plot" dir="ltr" aria-hidden="true">
            <span className="console-ov-max">
              {n(Math.max(1, ...days.map((p) => p.visitors), ...(previous ?? []).map((p) => p.visitors)))}
            </span>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartPoints} margin={{ top: 3, right: 6, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="traffic-visitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={visitorsColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={visitorsColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ChartTooltip />
                <Grid theme={theme} />
                <XAxisDay data={chartPoints} theme={theme} />
                <YAxisEmpty theme={theme} />
                <Area type="monotone" dataKey="visitors" fill="url(#traffic-visitors)" stroke="none" strokeWidth={0} dot={false} />
                <Line type="monotone" dataKey="visitors" stroke={visitorsColor} strokeWidth={2} dot={false} />
                {previous ? (
                  <Line type="monotone" dataKey="previousVisitors" stroke={previousColor} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                ) : null}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* leads: horizontal bars, previous as a lighter bar set. */}
          <div className="console-ov-plot" dir="ltr" aria-hidden="true" data-pane="leads">
            <span className="console-ov-max">{n(leadMax)}</span>
            <ResponsiveContainer width="100%" height={84}>
              <BarChart data={chartPoints} margin={{ top: 2, right: 6, bottom: 0, left: 0 }}>
                <ChartTooltip />
                <Grid theme={theme} />
                <XAxis dataKey="day" tick={{ fill: theme === "dark" ? "#9a8a6a" : "#6b6252", fontSize: 10, textAnchor: "end" }} axisLine={false} tickLine={false} interval={0} minTickGap={22} />
                <YAxis hide axisLine={false} tickLine={false} />
                <Bar dataKey="leads" fill={leadsColor} radius={[0, 2, 2, 0]} maxBarSize={40} />
                {previous ? (
                  <Bar dataKey="previousLeads" fill={previousColor} radius={[0, 2, 2, 0]} maxBarSize={40} opacity={0.55} />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="console-ov-axis" dir="ltr" aria-hidden="true">
            <span>{axisDay(days[0].day)}</span>
            <span>{axisDay(days[Math.floor(days.length / 2)].day)}</span>
            <span>{axisDay(days[days.length - 1].day)}</span>
          </div>
          {totalLeads === 0 ? <Note>{labels["overview.traffic.no_leads"]}</Note> : null}
        </>
      )}
      {empty ? null : <TrafficTable data={data} labels={labels} />}
    </Panel>
  );
}

/* --- engagement ------------------------------------------------------------- */

function EngagementPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const points = data.engagement;
  const conversion = data.kpis.find((kpi) => kpi.key === "conversion")?.series ?? [];
  const theme = getChartTheme();
  const ctaColor = theme === "dark" ? DARK_ACCENT : LIGHT_ACCENT;
  const submitColor = seriesColor(1);
  const rateColor = seriesColor(2);
  const rateMax = Math.max(1, ...conversion);
  const rateTotal = conversion.reduce((sum, value) => sum + value, 0);
  const total = [...points.map((p) => p.cta), ...points.map((p) => p.submit)].reduce((sum, value) => sum + value, 0);

  const chartEngagement: { day: string; cta: number; submit: number; rate: number }[] = points.map((point, index) => ({
    day: point.day,
    cta: point.cta,
    submit: point.submit,
    rate: conversion[index] ?? 0,
  }));

  const ctaValues = points.map((point) => point.cta);
  const submitValues = points.map((point) => point.submit);
  const max = Math.max(1, ...ctaValues, ...submitValues);

  return (
    <Panel title={labels["overview.engagement.title"]} intro={labels["overview.engagement.intro"]}>
      {total === 0 && rateTotal === 0 ? (
        <Empty>{labels["overview.engagement.empty"]}</Empty>
      ) : (
        <>
          {total > 0 ? (
            <>
              <Legend
                items={[
                  { kind: "cta", label: labels["overview.engagement.cta"] },
                  { kind: "submit", label: labels["overview.engagement.submit"] },
                ]}
              />
              <div className="console-ov-plot" dir="ltr" aria-hidden="true">
                <span className="console-ov-max">{n(max)}</span>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={chartEngagement} margin={{ top: 3, right: 6, bottom: 0, left: 0 }}>
                    <ChartTooltip />
                    <Grid theme={theme} />
                    <XAxisDay data={chartEngagement} theme={theme} />
                    <YAxisEmpty theme={theme} />
                    <Line type="monotone" dataKey="cta" stroke={ctaColor} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="submit" stroke={submitColor} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Note>{labels["overview.engagement.empty"]}</Note>
          )}
          {rateTotal > 0 ? (
            <div className="console-ov-rate">
              <p className="console-ov-caption">
                {labels["overview.kpi.conversion"]} · {percent(conversion[conversion.length - 1] ?? 0)}
              </p>
              <div className="console-ov-plot" dir="ltr" aria-hidden="true" data-pane="rate">
                <span className="console-ov-max">{percent(rateMax)}</span>
                <ResponsiveContainer width="100%" height={70}>
                  <AreaChart data={chartEngagement} margin={{ top: 2, right: 6, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rate-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={rateColor} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={rateColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <ChartTooltip />
                    <Grid theme={theme} />
                    <XAxisDay data={chartEngagement} theme={theme} />
                    <YAxisEmpty theme={theme} />
                    <Area type="monotone" dataKey="rate" fill="url(#rate-gradient)" stroke="none" strokeWidth={0} dot={false} />
                    <Line type="monotone" dataKey="rate" stroke={rateColor} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </>
      )}
      <table className="console-sr-only">
        <caption>{labels["overview.chart.table"]}</caption>
        <thead>
          <tr>
            <th scope="col">{labels["overview.chart.date"]}</th>
            <th scope="col">{labels["overview.engagement.cta"]}</th>
            <th scope="col">{labels["overview.engagement.submit"]}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{n(point.cta)}</td>
              <td>{n(point.submit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* --- sources ---------------------------------------------------------------- */

interface Segment {
  label: string;
  value: number;
  other?: true;
}

/** More than six slices is a donut nobody can read, so the tail is folded, not dropped. */
function segmentsOf(slices: readonly Slice[]): Segment[] {
  const visible = slices.filter((slice) => slice.value > 0);
  if (visible.length <= 6) return visible.map((slice) => ({ label: slice.label, value: slice.value }));
  const head = visible.slice(0, 5).map((slice) => ({ label: slice.label, value: slice.value }));
  const tail = visible.slice(5).reduce((sum, slice) => sum + slice.value, 0);
  return [...head, { label: "", value: tail, other: true }];
}

function SourcesPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const segments = segmentsOf(data.sources);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const basis = data.sourcesBasis === "leads" ? labels["overview.sources.leads"] : labels["overview.sources.visits"];
  const theme = getChartTheme();
  const chartSources: { name: string; value: number }[] = segments.map((segment) => ({
    name: segment.label === "" ? labels["overview.sources.direct"] : segment.label,
    value: segment.value,
  }));

  return (
    <Panel title={labels["overview.sources.title"]} intro={basis}>
      {total === 0 ? (
        <Empty>{labels["overview.sources.empty"]}</Empty>
      ) : (
        <div className="console-ov-donut-wrap">
          <div className="console-ov-donut">
            <ResponsiveContainer width="100%" height={120}>
              <PieChart height={120}>
                <Pie
                  data={chartSources}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={52}
                  paddingAngle={2}
                  isAnimationActive={false}
                  stroke="none"
                >
                  {chartSources.map((segment, index) => (
                    <Cell key={segment.name} fill={seriesColor(index % SERIES_COLORS.length)} />
                  ))}
                </Pie>
                <Tooltip content={(props) => tooltipContent(props)} cursor={{ fill: "transparent" }} />
              </PieChart>
            </ResponsiveContainer>
            <span className="console-ov-donut-total">
              <b>{n(total)}</b>
              <small>{labels["overview.sources.total"]}</small>
            </span>
          </div>
          <ul className="console-ov-slices">
            {chartSources.map((segment, index) => (
              <li key={`${segment.name}-${index}`}>
                <span className="console-ov-slice-name">{segment.name}</span>
                <b>{n(segment.value)}</b>
                <Note>{percent(total > 0 ? (segment.value / total) * 100 : 0)}</Note>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* --- breakdowns and status ------------------------------------------------- */

function Bars({ rows, labels }: Readonly<{ rows: readonly { label: string; value: number }[]; labels: Labels }>) {
  const chartBars: { name: string; value: number }[] = rows.map((row) => ({
    name: row.label === "" ? labels["overview.sources.direct"] : row.label,
    value: row.value,
  }));
  return (
    <ResponsiveContainer width="100%" height={84}>
      <BarChart data={chartBars} layout="horizontal" margin={{ left: 80, right: 6, top: 0, bottom: 0 }}>
        <XAxis type="number" dataKey="value" hide />
        <YAxis dataKey="name" type="category" width={170} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A visually hidden table carrying the same numbers as a horizontal bar chart. */
function ChartTable({ items, labels }: Readonly<{ items: readonly { label: string; value: number }[]; labels: Labels }>) {
  return (
    <table className="console-sr-only">
      <caption>{labels["overview.chart.table"]}</caption>
      <thead>
        <tr>
          <th scope="col">{labels["overview.chart.table"]}</th>
          <th scope="col">Count</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <th scope="row">{item.label}</th>
            <td>{n(item.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BreakdownPanel({
  title,
  rows,
  labels,
}: Readonly<{ title: string; rows: readonly Slice[]; labels: Labels }>) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <Empty>{labels["overview.breakdown.empty"]}</Empty>
      ) : (
        <>
          <Bars rows={rows} labels={labels} />
          <ChartTable items={rows.map((row) => ({ label: row.label, value: row.value }))} labels={labels} />
        </>
      )}
    </Panel>
  );
}

function StatusPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const statuses = data.leads?.statuses ?? [];
  const total = statuses.reduce((sum, row) => sum + row.count, 0);
  return (
    <Panel title={labels["overview.funnel.title"]} intro={labels["overview.funnel.intro"]}>
      {total === 0 ? (
        <Empty>{labels["overview.funnel.empty"]}</Empty>
      ) : (
        <>
          <Bars rows={statuses.map((row) => ({ label: labels[STATUS_KEY[row.status]], value: row.count }))} labels={labels} />
          <ChartTable
            items={statuses.map((row) => ({ label: labels[STATUS_KEY[row.status]], value: row.count }))}
            labels={labels}
          />
        </>
      )}
    </Panel>
  );
}

/* --- heatmap ---------------------------------------------------------------- */

function heatLabel(weekday: number, labels: Labels): string {
  return labels[`overview.weekday.${weekday}` as MessageKey];
}

function HeatmapPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const { cells, placed, missing } = data.heatmap;
  const byKey = new Map<number, number>();
  for (const cell of cells) byKey.set(cell.weekday * 24 + cell.hour, cell.views);
  const max = Math.max(1, ...cells.map((cell) => cell.views));

  return (
    <Panel title={labels["overview.heatmap.title"]} intro={labels["overview.heatmap.intro"]}>
      {cells.length === 0 ? (
        <Empty>{labels["overview.heatmap.empty"]}</Empty>
      ) : (
        <div className="console-ov-heat-wrap">
          <div className="console-ov-heat" dir="ltr" aria-hidden="true">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="console-ov-heat-hour">
                {hour % 3 === 0 ? hour : ""}
              </span>
            ))}
            {Array.from({ length: 7 }, (_, weekday) => (
              <span key={`row-${weekday}`} className="console-ov-heat-row">
                <span className="console-ov-heat-day">{heatLabel(weekday, labels)}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const views = byKey.get(weekday * 24 + hour) ?? 0;
                  return (
                    <span
                      key={hour}
                      className="console-ov-heat-cell"
                      data-level={views === 0 ? undefined : Math.max(1, Math.ceil((views / max) * 4))}
                      title={`${heatLabel(weekday, labels)} ${hour}:00 — ${n(views)}`}
                    />
                  );
                })}
              </span>
            ))}
          </div>
          {missing > 0 ? (
            <p className="console-ov-note">
              {n(placed)} {labels["overview.heatmap.covered"]} {n(missing)} {labels["overview.heatmap.missing"]}
            </p>
          ) : null}
        </div>
      )}
      <table className="console-sr-only">
        <caption>{labels["overview.heatmap.title"]}</caption>
        <thead>
          <tr>
            <th scope="col">{labels["overview.chart.day"]}</th>
            <th scope="col">{labels["overview.heatmap.title"]}</th>
            <th scope="col">{labels["overview.top.views"]}</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell: HeatCell) => (
            <tr key={`${cell.weekday}-${cell.hour}`}>
              <th scope="row">{heatLabel(cell.weekday, labels)}</th>
              <td>{`${cell.hour}:00`}</td>
              <td>{n(cell.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* --- ranked lists ----------------------------------------------------------- */

interface Ranked {
  key: string;
  label: string;
  note?: string;
  primary: string;
  secondary?: string;
}

function RankedList({ rows }: Readonly<{ rows: readonly Ranked[] }>) {
  return (
    <ol className="console-ov-ranked">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="console-ov-rank-name">
            <bdi>{row.label}</bdi>
            {row.note ? <small>{row.note}</small> : null}
          </span>
          <span className="console-ov-rank-values">
            <b>{row.primary}</b>
            {row.secondary ? <Note>{row.secondary}</Note> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function pageRows(rows: readonly TopPage[], labels: Labels): Ranked[] {
  return rows.map((row) => ({
    key: row.path,
    label: row.path,
    primary: `${n(row.views)} ${labels["overview.top.views"]}`,
    secondary: `${n(row.visitors)} ${labels["overview.top.visitors"]}`,
  }));
}

function articleRows(rows: readonly TopArticle[], labels: Labels, locale: ConsoleLocale): Ranked[] {
  return rows.map((row) => ({
    key: row.slug,
    label: locale === "ar" ? row.titleAr || row.titleEn : row.titleEn || row.titleAr,
    note: row.path,
    primary: `${n(row.views)} ${labels["overview.top.views"]}`,
    secondary: `${n(row.visitors)} ${labels["overview.top.visitors"]}`,
  }));
}

/* --- devices and cities ----------------------------------------------------- */

function DevicesPanel({ rows, labels }: Readonly<{ rows: readonly DeviceRow[]; labels: Labels }>) {
  const total = rows.reduce((sum, row) => sum + row.views, 0);
  const max = Math.max(1, ...rows.map((row) => row.views));
  return (
    <Panel title={labels["overview.devices.title"]}>
      {rows.length === 0 ? (
        <Empty>{labels["overview.devices.empty"]}</Empty>
      ) : (
        <ul className="console-ov-bars">
          {rows.map((row) => (
            <li key={row.device}>
              <span className="console-ov-bar-label">{deviceName(row.device, labels)}</span>
              <span className="console-ov-bar-track" aria-hidden="true">
                <i style={{ inlineSize: `${Math.max(2, (row.views / max) * 100)}%` }} />
              </span>
              <span className="console-ov-bar-value">
                {n(row.views)}
                <small>
                  {percent(total > 0 ? (row.views / total) * 100 : 0)} · {n(row.leads)} {labels["overview.devices.leads"]}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CitiesPanel({ rows, labels }: Readonly<{ rows: readonly CityRow[]; labels: Labels }>) {
  return (
    <Panel title={labels["overview.cities.title"]}>
      {rows.length === 0 ? (
        <Empty>{labels["overview.cities.empty"]}</Empty>
      ) : (
        <ul className="console-ov-ranked">
          {rows.map((row) => (
            <li key={row.city || "unknown"}>
              <span className="console-ov-rank-name">
                <bdi>{row.city || labels["overview.cities.unknown"]}</bdi>
              </span>
              <span className="console-ov-rank-values">
                <b>{`${n(row.views)} ${labels["overview.top.views"]}`}</b>
                <Note>{`${n(row.visitors)} ${labels["overview.top.visitors"]}`}</Note>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --- recent leads ----------------------------------------------------------- */

function RecentPanel({
  rows,
  labels,
  busyId,
  onMove,
}: Readonly<{ rows: readonly LeadRow[]; labels: Labels; busyId: string | null; onMove: (row: LeadRow, status: LeadStatus) => void }>) {
  return (
    <Panel
      title={labels["overview.recent.title"]}
      className="console-ov-card-wide"
      action={
        <ButtonLink size="sm" variant="ghost" href="/console/leads">
          {labels["overview.recent.all"]}
        </ButtonLink>
      }
    >
      {rows.length === 0 ? (
        <Empty>{labels["overview.recent.none"]}</Empty>
      ) : (
        <ul className="console-ov-recent">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="console-ov-recent-who">
                <b>{row.contact_hidden ? labels["leads.read_only"] : row.name}</b>
                <small>
                  {sourceName(row.source, labels)} · <time dateTime={row.createdAt}>{stamp(row.createdAt)}</time>
                </small>
              </span>
              {row.editable ? (
                <Select
                  className="console-ov-recent-status"
                  value={row.status}
                  disabled={busyId === row.id}
                  aria-label={labels["leads.field.status"]}
                  onChange={(event) => onMove(row, event.target.value as LeadStatus)}
                >
                  {LEAD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labels[STATUS_KEY[status]]}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone={STATUS_TONE[row.status]}>{labels[STATUS_KEY[row.status]]}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --- the screen ------------------------------------------------------------- */

interface View {
  range: RangeKey;
  from: string;
  to: string;
  compare: boolean;
}

function queryOf(view: View): string {
  const params = new URLSearchParams();
  params.set("range", view.range);
  if (view.range === "custom") {
    params.set("from", view.from);
    params.set("to", view.to);
  }
  if (view.compare) params.set("compare", "1");
  return params.toString();
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}

function customDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

export function OverviewScreen({
  initial,
  labels,
  locale,
}: Readonly<{ initial: OverviewData; labels: Labels; locale: ConsoleLocale }>) {
  const [data, setData] = useState<OverviewData>(initial);
  const [view, setView] = useState<View>({
    range: initial.range.key,
    from: initial.range.from,
    to: initial.range.to,
    compare: initial.compare,
  });
  const [from, setFrom] = useState(initial.range.from);
  const [to, setTo] = useState(initial.range.to);
  const [customOpen, setCustomOpen] = useState(initial.range.key === "custom");
  const [customError, setCustomError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);

  const load = useCallback(async (next: View, refresh = false): Promise<void> => {
    setLoading(true);
    setFailed(false);
    const query = queryOf(next);
    const result = await consoleRead<OverviewData>(`/api/console/overview?${query}${refresh ? "&refresh=1" : ""}`);
    setLoading(false);
    if (!result.data || !Array.isArray(result.data.kpis)) {
      setFailed(true);
      return;
    }
    setData(result.data);
  }, []);

  // The URL is the state: a period is something a person can bookmark or hand over.
  const signature = JSON.stringify(view);
  const drawn = useRef(signature);
  useEffect(() => {
    if (drawn.current === signature) return;
    drawn.current = signature;
    window.history.replaceState(null, "", `/console?${queryOf(view)}`);
    void load(view);
  }, [signature, view, load]);

  useEffect(() => {
    if (notice?.tone !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), OK_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refresh = useCallback((): void => void load(view, true), [load, view]);

  function pickRange(range: RangeKey): void {
    if (range === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setCustomError(false);
    setView((current) => ({ ...current, range }));
  }

  function applyCustom(): void {
    if (!isDate(from) || !isDate(to) || customDays(from, to) > MAX_CUSTOM_DAYS || to < from) {
      setCustomError(true);
      return;
    }
    setCustomError(false);
    setView((current) => ({ ...current, range: "custom", from, to }));
  }

  const moveLead = useCallback(async (row: LeadRow, status: LeadStatus): Promise<void> => {
    if (busyId || status === row.status) return;
    setBusyId(row.id);
    const result = await consoleCall<{ lead?: LeadRow }>(
      `/api/console/leads/${row.id}?source=${encodeURIComponent(row.source)}`,
      "PATCH",
      { status },
    );
    setBusyId(null);
    if (!result.data?.lead) {
      setNotice({ tone: "danger", key: "overview.recent.failed" });
      return;
    }
    const saved = result.data.lead;
    // The funnel is "where each lead stands now", so a move is exactly one out and one in.
    setData((current) => {
      if (!current.leads) return current;
      const statuses = current.leads.statuses.map((entry) =>
        entry.status === row.status
          ? { ...entry, count: Math.max(0, entry.count - 1) }
          : entry.status === saved.status
            ? { ...entry, count: entry.count + 1 }
            : entry,
      );
      return {
        ...current,
        leads: {
          ...current.leads,
          recent: current.leads.recent.map((entry) => (entry.id === saved.id ? saved : entry)),
          statuses,
          funnel: statuses.map((entry) => ({ label: entry.status, value: entry.count })),
        },
      };
    });
    setNotice({ tone: "ok", key: "overview.recent.saved" });
  }, [busyId]);

  const exported = useMemo(() => `/api/console/overview/export?${queryOf(view)}`, [view]);
  const pages = pageRows(data.topPages, labels);
  const articles = articleRows(data.topArticles, labels, locale);
  const leadPages: Ranked[] = (data.leads?.topPages ?? []).map((row) => ({
    key: row.label,
    label: row.label,
    primary: `${n(row.count)} ${labels["overview.top.leads"]}`,
  }));

  return (
    <div className="console-ov" data-busy={loading || undefined}>
      <header className="console-ov-head">
        <div className="console-ov-heading">
          <h1 className="console-heading">{labels["overview.heading"]}</h1>
          <p className="console-lede">{labels["overview.intro"]}</p>
        </div>
        <div className="console-ov-stamp">
          <Note>
            {labels["overview.generated"]}{" "}
            <time dateTime={data.generatedAt}>{cairoStamp(data.generatedAt)}</time>
          </Note>
          <span className="console-ov-span" dir="ltr">
            {data.range.from} → {data.range.to}
          </span>
          <Button size="sm" leading={<RefreshCw size={14} aria-hidden="true" />} loading={loading} onClick={refresh}>
            {labels["overview.refresh"]}
          </Button>
        </div>
      </header>

      <div className="console-ov-controls">
        <ChipRow label={labels["overview.range.label"]}>
          {RANGES.map((range) => (
            <Chip
              key={range}
              active={range === "custom" ? customOpen || view.range === "custom" : view.range === range}
              aria-pressed={view.range === range}
              onClick={() => pickRange(range)}
            >
              {labels[RANGE_KEY[range]]}
            </Chip>
          ))}
        </ChipRow>
        <Button
          active={view.compare}
          aria-pressed={view.compare}
          size="sm"
          onClick={() => setView((current) => ({ ...current, compare: !current.compare }))}
        >
          {labels["overview.compare"]}
        </Button>
        <span className="console-ov-actions">
          {data.canExport ? (
            <ButtonLink size="sm" href={exported} leading={<Download size={14} aria-hidden="true" />}>
              {labels["overview.export.csv"]}
            </ButtonLink>
          ) : null}
          <Button size="sm" leading={<Printer size={14} aria-hidden="true" />} onClick={() => window.print()}>
            {labels["overview.export.print"]}
          </Button>
        </span>
      </div>

      {customOpen ? (
        <div className="console-ov-custom">
          <label className="console-inline">
            {labels["overview.range.from"]}
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="console-inline">
            {labels["overview.range.to"]}
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <Button variant="primary" size="sm" onClick={applyCustom}>
            {labels["overview.range.apply"]}
          </Button>
          {customError ? <Alert tone="danger">{labels["overview.range.invalid"]}</Alert> : null}
        </div>
      ) : null}

      {loading ? (
        <p role="status" className="console-ov-loading">
          {labels["overview.loading"]}
        </p>
      ) : null}

      {failed ? (
        <Alert tone="danger">
          {labels["overview.load_failed"]}
          <Button onClick={refresh}>{labels["overview.retry"]}</Button>
        </Alert>
      ) : null}

      {notice ? <Alert tone={notice.tone}>{labels[notice.key]}</Alert> : null}

      {!data.leads ? <Alert tone="warn">{labels["overview.leads_hidden"]}</Alert> : null}

      <div className="console-ov-kpis">
        {data.kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} labels={labels} compare={data.compare} />
        ))}
      </div>

      {data.quickActions.length > 0 ? (
        <ChipRow label={labels["overview.actions.title"]} className="console-ov-quick">
          {data.quickActions.map((action) => (
            <ButtonLink key={action.href} size="sm" variant="ghost" href={action.href}>
              {labels[action.key]}
            </ButtonLink>
          ))}
        </ChipRow>
      ) : null}

      <div className="console-ov-main">
        <TrafficPanel data={data} labels={labels} />
        <div className="console-ov-side">
          <SourcesPanel data={data} labels={labels} />
          <Panel title={labels["overview.attention.title"]}>
            {data.attention.length === 0 ? (
              <Note>{labels["overview.attention.none"]}</Note>
            ) : (
              <ul className="console-ov-attention">
                {data.attention.map((row) => (
                  <li key={row.key}>
                    <a href={row.href}>
                      <span>{labels[row.key]}</span>
                      <b>{n(row.count)}</b>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="console-ov-split">
        <EngagementPanel data={data} labels={labels} />
        {data.leads ? <StatusPanel data={data} labels={labels} /> : null}
      </div>

      {data.leads ? (
        <div className="console-ov-trio">
          <BreakdownPanel title={labels["overview.campaigns.title"]} rows={data.leads.campaigns} labels={labels} />
          <BreakdownPanel title={labels["overview.services.title"]} rows={data.leads.services} labels={labels} />
          <BreakdownPanel title={labels["overview.branches.title"]} rows={data.leads.branches} labels={labels} />
        </div>
      ) : null}

      <HeatmapPanel data={data} labels={labels} />

      <div className="console-ov-trio">
        <Panel title={labels["overview.pages.title"]}>
          {pages.length === 0 ? <Empty>{labels["overview.top.empty"]}</Empty> : <RankedList rows={pages} />}
        </Panel>
        <Panel title={labels["overview.articles.title"]}>
          {articles.length === 0 ? <Empty>{labels["overview.top.empty"]}</Empty> : <RankedList rows={articles} />}
        </Panel>
        <Panel title={labels["overview.lead_pages.title"]}>
          {!data.leads ? (
            <Note>{labels["overview.leads_hidden"]}</Note>
          ) : leadPages.length === 0 ? (
            <Empty>{labels["overview.top.empty"]}</Empty>
          ) : (
            <RankedList rows={leadPages} />
          )}
        </Panel>
      </div>

      <div className="console-ov-split">
        <DevicesPanel rows={data.devices} labels={labels} />
        <CitiesPanel rows={data.cities} labels={labels} />
      </div>

      {data.leads ? <RecentPanel rows={data.leads.recent} labels={labels} busyId={busyId} onMove={(row, status) => void moveLead(row, status)} /> : null}

      <Panel title={labels["overview.library.title"]} intro={labels["overview.library.intro"]}>
        {data.library.length === 0 ? (
          <Empty>{labels["overview.not_allowed"]}</Empty>
        ) : (
          <ul className="console-ov-library">
            {data.library.map((row) => (
              <li key={row.resource}>
                <span>{labels[row.label]}</span>
                <b>{n(row.count)}</b>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
