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
 * The charts are Recharts charts: their own scales, their own axes, and a tooltip that
 * follows the pointer. Nothing here is a coloured box sized by a CSS percentage, and
 * every one of them carries its rows in a visually hidden table beside the plot, which
 * is what a screen reader actually reads.
 *
 * The one write here is a lead's status in the latest-leads list: the same endpoint
 * and the same rule as the leads screen — the row's own `editable`, which comes from
 * the caller's grant on that lead's source.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
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
// Real charts, not drawings of charts: Recharts owns the scales and the pointer, and
// every colour comes from a console class rather than a value computed in here.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
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

/* --- chart pieces ----------------------------------------------------------- */

// A series never carries a colour literal: it carries a class, and the console sheet
// resolves that class to `--c-ov-n`. The chart therefore repaints itself when the
// theme changes (or when the page is printed) without any of this code reading the
// theme. `currentColor` is what hands the class colour to a Recharts stroke or fill.
const SERIES_CLASS = [
  "console-ov-s1",
  "console-ov-s2",
  "console-ov-s3",
  "console-ov-s4",
  "console-ov-s5",
  "console-ov-s6",
  "console-ov-s7",
] as const;

const seriesClass = (index: number): string => SERIES_CLASS[index % SERIES_CLASS.length];

/** Which series a person has switched off, keyed by the panel that owns them. */
function useSeriesOff(): [readonly string[], (key: string) => void] {
  const [off, setOff] = useState<readonly string[]>([]);
  const toggle = useCallback((key: string): void => {
    setOff((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }, []);
  return [off, toggle];
}

/**
 * The width a plot actually got. Recharts measures itself for its own scales, but a
 * grid whose cells are drawn as rectangles needs the same number to keep them square
 * and non-overlapping, so the box is measured once and re-measured when it changes.
 */
function usePlotWidth(): [RefObject<HTMLDivElement | null>, number] {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [box, width];
}

// ---- shared chart plumbing ---------------------------------------------------

/** What a chart library hands a tooltip, narrowed to the things this one reads. */
type TooltipEntry = { dataKey?: unknown; label?: unknown; name?: unknown; value?: unknown; payload?: unknown };

/** One row of a tooltip: what it counts, how many, and which class colours its dot. */
type TipRow = { name: string; value: string; klass?: string };

/** The sector Recharts hands a `Pie` active shape, narrowed to the fields the hover draws. */
type SliceSector = {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  cornerRadius?: number;
  fill?: string;
  className?: string;
};

/**
 * The default row reads "series name — count". A panel whose dataKey is not a label,
 * or whose unit is a percentage, says so here instead of inventing a number format.
 */
function tipRowOf(entry: TooltipEntry, describe?: (entry: TooltipEntry) => TipRow): TipRow {
  if (describe) return describe(entry);
  return { name: String(entry.name ?? entry.label ?? ""), value: n(Number(entry.value ?? 0)) };
}

function tooltipContent(
  props: { active?: boolean; label?: unknown; payload?: readonly TooltipEntry[] },
  describe?: (entry: TooltipEntry) => TipRow,
  limit?: number
): ReactNode {
  if (props.active === false) return null;
  const rows = (props.payload ?? [])
    .filter((entry) => typeof entry.value === "number")
    .slice(0, limit)
    .map((entry) => tipRowOf(entry, describe));
  if (rows.length === 0) return null;
  const raw = props.label === undefined || props.label === null ? "" : String(props.label);
  // The tip header reads like the axis it points at: a day tick is `10/15`, not `2026-10-15`.
  const label = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? axisDay(raw) : raw;
  return (
    <div className="console-ov-tip" role="presentation">
      {label ? <p className="console-ov-tip-label">{label}</p> : null}
      <ul>
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            {row.klass ? <i className={`console-ov-tip-dot ${row.klass}`} aria-hidden="true" /> : null}
            <span className="console-ov-tip-name">{row.name}</span>
            <b className="console-ov-tip-value">{row.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The cursor a chart draws under the pointer: a guide line for a series read against
 * an axis, a tinted band for a column, a wedge for a slice, nothing for a sparkline.
 *
 * Recharts finds its own parts by the element type of a *direct* child — `findAllByType`
 * reads `child.type.name` — so a wrapper component around `Tooltip`, `XAxis` or
 * `CartesianGrid` is silently dropped and the chart draws without it. These build props
 * instead, and every chart spells its own parts.
 */
function tooltipProps(
  describe?: (entry: TooltipEntry) => TipRow,
  cursor: "none" | "line" | "band" | "sector" = "none",
  limit?: number
): ComponentProps<typeof Tooltip> {
  const shape: Record<typeof cursor, SVGProps<SVGElement>> = {
    none: { stroke: "none" },
    line: { stroke: "currentColor", strokeWidth: 1, strokeDasharray: "3 3" },
    band: { fill: "currentColor", fillOpacity: 0.08, stroke: "none" },
    sector: { fill: "currentColor", fillOpacity: 0.1, stroke: "none" },
  };
  return {
    content: (props) => tooltipContent(props, describe, limit),
    cursor: shape[cursor],
    wrapperStyle: { outline: "none" },
  };
}

/**
 * The tooltip a panel uses when its series already carry their own names: the dot in
 * the tip then takes the class of the line or bar the person is pointing at.
 */
function describeSeries(
  classes: Readonly<Record<string, string>>,
  unit: "count" | "percent" = "count",
): (entry: TooltipEntry) => TipRow {
  return (entry) => ({
    name: String(entry.name ?? entry.label ?? ""),
    value: unit === "percent" ? percent(Number(entry.value ?? 0)) : n(Number(entry.value ?? 0)),
    klass: classes[String(entry.dataKey ?? "")],
  });
}

function xAxisDayProps(): ComponentProps<typeof XAxis> {
  return {
    dataKey: "day",
    className: "console-ov-axis",
    tick: { fontSize: 10 },
    tickFormatter: axisDay,
    axisLine: false,
    tickLine: false,
    interval: "preserveStartEnd",
    minTickGap: 26,
  };
}

/** The count axis the floating "max" label used to stand in for. */
function yAxisCountProps(unit: "count" | "percent" = "count"): ComponentProps<typeof YAxis> {
  return {
    className: "console-ov-axis",
    width: unit === "percent" ? 44 : 40,
    tick: { fontSize: 10 },
    tickFormatter: (value: number) => (unit === "percent" ? percent(value) : n(value)),
    axisLine: false,
    tickLine: false,
  };
}

/** The grid runs across the value axis, so it never competes with the category labels. */
function gridProps(lines: "horizontal" | "vertical" = "horizontal"): ComponentProps<typeof CartesianGrid> {
  return {
    strokeDasharray: "3 3",
    vertical: lines === "vertical",
    horizontal: lines === "horizontal",
  };
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

/** A series a panel can draw: the key the toggle switches, the name it shows, the class that colours it. */
type Series = { key: string; label: string; klass: string };

/**
 * The legend is the chart's control, not a caption under it: every entry is a button
 * that takes its series off the plot, so one line can be read against the axis
 * instead of untangled from the two beside it.
 */
function Legend({
  items,
  off,
  onToggle,
}: Readonly<{ items: readonly Series[]; off: readonly string[]; onToggle: (key: string) => void }>) {
  return (
    <ul className="console-ov-legend">
      {items.map((item) => {
        const hidden = off.includes(item.key);
        return (
          <li key={item.key}>
            <button type="button" className="console-ov-legend-btn" aria-pressed={!hidden} onClick={() => onToggle(item.key)}>
              <i className={`console-ov-legend-dot ${item.klass}`} aria-hidden="true" />
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* --- KPI -------------------------------------------------------------------- */

/** The KPI card's own chart: one point per day of the period, hoverable like any other. */
function Sparkline({
  kpi,
  days,
  labels,
}: Readonly<{ kpi: Kpi; days: readonly string[]; labels: Labels }>) {
  const points = kpi.series.map((value, index) => ({ day: days[index] ?? String(index + 1), value }));
  if (points.length < 2) return null;
  const show = (value: number): string => (kpi.unit === "percent" ? percent(value) : n(value));
  const name = labels[KPI_KEY[kpi.key]];
  return (
    <div className="console-ov-spark" dir="ltr" aria-hidden="true">
      <ResponsiveContainer width="100%" height={34}>
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <XAxis dataKey="day" hide />
          <YAxis hide />
          <Tooltip {...tooltipProps((entry) => ({ name, value: show(Number(entry.value ?? 0)), klass: SERIES_CLASS[0] }))} />
          <Area
            type="monotone"
            dataKey="value"
            name={name}
            className={SERIES_CLASS[0]}
            stroke="currentColor"
            fill="currentColor"
            fillOpacity={0.16}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2.5 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({
  kpi,
  days,
  labels,
  compare,
}: Readonly<{ kpi: Kpi; days: readonly string[]; labels: Labels; compare: boolean }>) {
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
      <Sparkline kpi={kpi} days={days} labels={labels} />
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
  const totalViews = days.reduce((total, point) => total + point.views, 0);
  const totalLeads = days.reduce((total, point) => total + point.leads, 0);
  const empty = totalViews === 0 && totalLeads === 0;
  const [off, toggleOff] = useSeriesOff();
  const on = (key: string): boolean => !off.includes(key);

  // One merged dataset: both panes share their days, so a hover reads the same row twice.
  const chartPoints: { day: string; visitors: number; leads: number; previousVisitors?: number; previousLeads?: number }[] = days.map((point, index) => ({
    day: point.day,
    visitors: point.visitors,
    leads: point.leads,
    previousVisitors: previous?.[index]?.visitors,
    previousLeads: previous?.[index]?.leads,
  }));

  const classes: Record<string, string> = {
    visitors: SERIES_CLASS[0],
    previousVisitors: SERIES_CLASS[2],
    leads: SERIES_CLASS[1],
    previousLeads: SERIES_CLASS[2],
  };
  const describe = describeSeries(classes);

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
              { key: "visitors", label: labels["overview.traffic.visitors"], klass: SERIES_CLASS[0] },
              ...(previous ? [{ key: "previous", label: labels["overview.traffic.previous"], klass: SERIES_CLASS[2] }] : []),
              { key: "leads", label: labels["overview.traffic.leads"], klass: SERIES_CLASS[1] },
            ]}
            off={off}
            onToggle={toggleOff}
          />
          {/* visitors as a filled line; the previous period dashed behind it. */}
          <div className="console-ov-plot" dir="ltr" aria-hidden="true">
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={chartPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps()} />
                <XAxis {...xAxisDayProps()} />
                <YAxis {...yAxisCountProps()} />
                <Tooltip {...tooltipProps(describe, "line")} />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  name={labels["overview.traffic.visitors"]}
                  className={SERIES_CLASS[0]}
                  stroke="currentColor"
                  fill="currentColor"
                  fillOpacity={0.16}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  hide={!on("visitors")}
                />
                {previous ? (
                  <Line
                    type="monotone"
                    dataKey="previousVisitors"
                    name={labels["overview.traffic.previous"]}
                    className={SERIES_CLASS[2]}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    hide={!on("previous")}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* leads as columns on the same days, in their own pane so two scales stay honest. */}
          <div className="console-ov-plot" dir="ltr" aria-hidden="true" data-pane="leads">
            <ResponsiveContainer width="100%" height={112}>
              <BarChart data={chartPoints} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps()} />
                <XAxis {...xAxisDayProps()} />
                <YAxis {...yAxisCountProps()} />
                <Tooltip {...tooltipProps(describe, "band")} />
                <Bar
                  dataKey="leads"
                  name={labels["overview.traffic.leads"]}
                  className={SERIES_CLASS[1]}
                  fill="currentColor"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={28}
                  hide={!on("leads")}
                />
                {previous ? (
                  <Bar
                    dataKey="previousLeads"
                    name={labels["overview.traffic.previous"]}
                    className={SERIES_CLASS[2]}
                    fill="currentColor"
                    fillOpacity={0.55}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                    hide={!on("previous")}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
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
  const rateTotal = conversion.reduce((sum, value) => sum + value, 0);
  const total = points.reduce((sum, point) => sum + point.cta + point.submit, 0);
  const [off, toggleOff] = useSeriesOff();
  const on = (key: string): boolean => !off.includes(key);

  const chartEngagement: { day: string; cta: number; submit: number; rate: number }[] = points.map((point, index) => ({
    day: point.day,
    cta: point.cta,
    submit: point.submit,
    rate: conversion[index] ?? 0,
  }));

  const classes: Record<string, string> = { cta: SERIES_CLASS[0], submit: SERIES_CLASS[1], rate: SERIES_CLASS[2] };
  const describeCounts = describeSeries(classes);
  const describeRate = describeSeries(classes, "percent");

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
                  { key: "cta", label: labels["overview.engagement.cta"], klass: SERIES_CLASS[0] },
                  { key: "submit", label: labels["overview.engagement.submit"], klass: SERIES_CLASS[1] },
                ]}
                off={off}
                onToggle={toggleOff}
              />
              <div className="console-ov-plot" dir="ltr" aria-hidden="true">
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartEngagement} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps()} />
                    <XAxis {...xAxisDayProps()} />
                    <YAxis {...yAxisCountProps()} />
                    <Tooltip {...tooltipProps(describeCounts, "line")} />
                    <Line
                      type="monotone"
                      dataKey="cta"
                      name={labels["overview.engagement.cta"]}
                      className={SERIES_CLASS[0]}
                      stroke="currentColor"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                      hide={!on("cta")}
                    />
                    <Line
                      type="monotone"
                      dataKey="submit"
                      name={labels["overview.engagement.submit"]}
                      className={SERIES_CLASS[1]}
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 3 }}
                      hide={!on("submit")}
                    />
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
                <ResponsiveContainer width="100%" height={104}>
                  <AreaChart data={chartEngagement} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps()} />
                    <XAxis {...xAxisDayProps()} />
                    <YAxis {...yAxisCountProps("percent")} />
                    <Tooltip {...tooltipProps(describeRate, "line")} />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      name={labels["overview.kpi.conversion"]}
                      className={SERIES_CLASS[2]}
                      stroke="currentColor"
                      fill="currentColor"
                      fillOpacity={0.16}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
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
  const [off, toggleOff] = useSeriesOff();
  const on = (key: string): boolean => !off.includes(key);
  const basis = data.sourcesBasis === "leads" ? labels["overview.sources.leads"] : labels["overview.sources.visits"];
  const unit = data.sourcesBasis === "leads" ? labels["overview.top.leads"] : labels["overview.top.visitors"];

  // A folded tail is not the same thing as a blank label: an empty source is Direct,
  // and everything the donut could not show on its own is Other.
  const slices = segmentsOf(data.sources).map((segment, index) => ({
    key: `slice-${index}`,
    name: segment.other ? labels["overview.sources.other"] : segment.label === "" ? labels["overview.sources.direct"] : segment.label,
    value: segment.value,
    klass: seriesClass(index),
  }));
  const shown = slices.filter((slice) => on(slice.key));
  const total = shown.reduce((sum, slice) => sum + slice.value, 0);

  const describeSlice = (entry: TooltipEntry): TipRow => {
    const datum = entry.payload as { name?: string } | undefined;
    const value = Number(entry.value ?? 0);
    return {
      name: datum?.name ?? String(entry.name ?? ""),
      value: `${n(value)} · ${percent(total > 0 ? (value / total) * 100 : 0)}`,
      klass: slices.find((slice) => slice.name === (datum?.name ?? ""))?.klass,
    };
  };

  return (
    <Panel title={labels["overview.sources.title"]} intro={basis}>
      {slices.length === 0 ? (
        <Empty>{labels["overview.sources.empty"]}</Empty>
      ) : (
        <>
          <Legend
            items={slices.map((slice) => ({ key: slice.key, label: slice.name, klass: slice.klass }))}
            off={off}
            onToggle={toggleOff}
          />
          <div className="console-ov-donut-wrap">
            <div className="console-ov-donut" dir="ltr" aria-hidden="true">
              {total === 0 ? (
                <Empty>{labels["overview.sources.empty"]}</Empty>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={shown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={62}
                        paddingAngle={2}
                        isAnimationActive={false}
                        stroke="none"
                        // Recharts hands the hovered slice's own sector props here, the
                        // class included, so the colour still comes from the series class
                        // and only the radius answers the pointer.
                        activeShape={(props: unknown) => {
                          const slice = props as SliceSector;
                          return <Sector {...slice} outerRadius={slice.outerRadius + 5} />;
                        }}
                      >
                        {shown.map((slice) => (
                          <Cell key={slice.key} className={slice.klass} fill="currentColor" />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipProps(describeSlice, "sector")} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="console-ov-donut-total">
                    <b>{n(total)}</b>
                    <small>{labels["overview.sources.total"]}</small>
                  </span>
                </>
              )}
            </div>
            <ul className="console-ov-slices">
              {slices.map((slice) => (
                <li key={slice.key} data-off={on(slice.key) ? undefined : "1"}>
                  <i className={`console-ov-slice-dot ${slice.klass}`} aria-hidden="true" />
                  <span className="console-ov-slice-name">{slice.name}</span>
                  <b>{n(slice.value)}</b>
                  <Note>{percent(total > 0 ? (slice.value / total) * 100 : 0)}</Note>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {slices.length === 0 ? null : (
        <ChartTable
          items={slices.map((slice) => ({ label: slice.name, value: slice.value }))}
          title={labels["overview.sources.title"]}
          unit={unit}
          labels={labels}
        />
      )}
    </Panel>
  );
}

/* --- breakdowns and status ------------------------------------------------- */

/** SVG text cannot be elided by CSS, so a name longer than the axis gives the rest to the tooltip. */
const tickName = (name: string): string => (name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name);

/**
 * One row per category, drawn by Recharts along its own number axis: the bar length,
 * the axis and the tooltip that names the whole category all come from the chart, not
 * from a width written in here.
 */
function Bars({
  rows,
  labels,
  unit,
}: Readonly<{ rows: readonly { label: string; value: number }[]; labels: Labels; unit: string }>) {
  const chartBars: { name: string; value: number }[] = rows.map((row) => ({
    name: row.label === "" ? labels["overview.sources.direct"] : row.label,
    value: row.value,
  }));
  const describe = describeSeries({ value: SERIES_CLASS[1] });
  return (
    <div className="console-ov-plot" dir="ltr" aria-hidden="true">
      <ResponsiveContainer width="100%" height={Math.min(280, Math.max(94, chartBars.length * 30 + 34))}>
        <BarChart data={chartBars} layout="vertical" margin={{ top: 2, right: 14, bottom: 2, left: 0 }}>
          <CartesianGrid {...gridProps("vertical")} />
          {/* The bars are ranked, but a rank without a scale is a decoration: the number
              axis is drawn so a reader can see how far a row is from zero. */}
          <XAxis
            type="number"
            dataKey="value"
            className={`console-ov-axis ${SERIES_CLASS[1]}`}
            tick={{ fontSize: 10 }}
            tickFormatter={(value: number) => n(value)}
            axisLine={false}
            tickLine={false}
            height={18}
          />
          <YAxis
            dataKey="name"
            type="category"
            className="console-ov-axis"
            width={132}
            interval={0}
            tickFormatter={tickName}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...tooltipProps(describe, "band")} />
          <Bar
            dataKey="value"
            name={unit}
            className={SERIES_CLASS[1]}
            fill="currentColor"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A visually hidden table carrying the same numbers as a horizontal bar chart. */
function ChartTable({
  items,
  title,
  unit,
  labels,
}: Readonly<{ items: readonly { label: string; value: number }[]; title: string; unit: string; labels: Labels }>) {
  return (
    <table className="console-sr-only">
      <caption>{`${labels["overview.chart.table"]} — ${title}`}</caption>
      <thead>
        <tr>
          <th scope="col">{title}</th>
          <th scope="col">{unit}</th>
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
  const items = rows.map((row) => ({ label: row.label, value: row.value }));
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <Empty>{labels["overview.breakdown.empty"]}</Empty>
      ) : (
        <>
          <Bars rows={items} labels={labels} unit={labels["overview.top.leads"]} />
          <ChartTable items={items} title={title} unit={labels["overview.top.leads"]} labels={labels} />
        </>
      )}
    </Panel>
  );
}

function StatusPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const statuses = data.leads?.statuses ?? [];
  const total = statuses.reduce((sum, row) => sum + row.count, 0);
  const items = statuses.map((row) => ({ label: labels[STATUS_KEY[row.status]], value: row.count }));
  return (
    <Panel title={labels["overview.funnel.title"]} intro={labels["overview.funnel.intro"]}>
      {total === 0 ? (
        <Empty>{labels["overview.funnel.empty"]}</Empty>
      ) : (
        <>
          <Bars rows={items} labels={labels} unit={labels["overview.top.leads"]} />
          <ChartTable items={items} title={labels["overview.funnel.title"]} unit={labels["overview.top.leads"]} labels={labels} />
        </>
      )}
    </Panel>
  );
}

/* --- heatmap ---------------------------------------------------------------- */

function heatLabel(weekday: number, labels: Labels): string {
  return labels[`overview.weekday.${weekday}` as MessageKey];
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = Array.from({ length: 7 }, (_, weekday) => weekday);

/** The gutter the weekday labels get, the height the hour axis gets, and the air between cells. */
const HEAT_LABEL_W = 44;
const HEAT_AXIS_H = 18;
const HEAT_GAP = 2;

type HeatPoint = { hour: number; weekday: number; views: number };
type HeatDot = { cx?: number; cy?: number; payload?: HeatPoint };

/** Four steps plus "nothing", so a week with one view still reads differently from a week with none. */
function heatLevel(views: number, max: number): number {
  return views === 0 ? 0 : Math.max(1, Math.ceil((views / max) * 4));
}

function HeatmapPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const { cells, placed, missing } = data.heatmap;
  const [box, boxWidth] = usePlotWidth();
  const byKey = new Map<number, number>();
  for (const cell of cells) byKey.set(cell.weekday * 24 + cell.hour, cell.views);
  const max = Math.max(1, ...cells.map((cell) => cell.views));

  // Every weekday and hour is drawn, including the empty ones: a gap in a heatmap is a
  // fact about the week, and leaving it out would make the busiest hours look like the only hours.
  const points: HeatPoint[] = WEEKDAYS.flatMap((weekday) =>
    HOURS.map((hour) => ({ hour, weekday, views: byKey.get(weekday * 24 + hour) ?? 0 })),
  );

  const cellW = Math.max(6, Math.floor((boxWidth - HEAT_LABEL_W) / 24) - HEAT_GAP);
  const cellH = Math.max(12, Math.min(22, Math.round(cellW * 0.5)));
  const plotH = WEEKDAYS.length * (cellH + HEAT_GAP) + HEAT_AXIS_H + 8;

  // The rectangle is drawn inside the chart, at the position the two number axes chose
  // for this hour and weekday; only its size is measured here, because a grid needs one.
  const shape = (dot: unknown): ReactElement => {
    const { cx = 0, cy = 0, payload } = (dot ?? {}) as HeatDot;
    const level = heatLevel(payload?.views ?? 0, max);
    return (
      <rect
        x={cx - cellW / 2}
        y={cy - cellH / 2}
        width={cellW}
        height={cellH}
        rx={2}
        className={`console-ov-heat-cell${level === 0 ? "" : ` console-ov-heat-l${level}`}`}
      />
    );
  };

  const describeHeat = (entry: TooltipEntry): TipRow => {
    const point = entry.payload as HeatPoint | undefined;
    const name = point
      ? `${heatLabel(point.weekday, labels)} · ${String(point.hour).padStart(2, "0")}:00`
      : labels["overview.top.views"];
    // A scatter hover hands the tooltip one entry per axis, never one for `views`,
    // so the cell's own payload carries the number and the first entry carries it.
    return { name, value: n(point ? point.views : Number(entry.value ?? 0)) };
  };

  return (
    <Panel title={labels["overview.heatmap.title"]} intro={labels["overview.heatmap.intro"]}>
      {cells.length === 0 ? (
        <Empty>{labels["overview.heatmap.empty"]}</Empty>
      ) : (
        <div className="console-ov-heat-wrap" ref={box}>
          <div className="console-ov-plot console-ov-plot-heat" dir="ltr" aria-hidden="true">
            <ResponsiveContainer width="100%" height={plotH}>
              <ScatterChart margin={{ top: 4, right: 8, bottom: 2, left: 0 }}>
                <XAxis
                  dataKey="hour"
                  type="number"
                  className="console-ov-axis"
                  domain={[-0.5, 23.5]}
                  ticks={HOURS}
                  interval={0}
                  allowDecimals={false}
                  height={HEAT_AXIS_H}
                  tickFormatter={(hour: number) => (hour % 3 === 0 ? String(hour) : "")}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="weekday"
                  type="number"
                  reversed
                  className="console-ov-axis"
                  domain={[-0.5, 6.5]}
                  ticks={WEEKDAYS}
                  interval={0}
                  width={HEAT_LABEL_W}
                  tickFormatter={(weekday: number) => heatLabel(weekday, labels)}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...tooltipProps(describeHeat, "line", 1)} />
                <Scatter data={points} dataKey="views" shape={shape} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <ul className="console-ov-heat-key" aria-hidden="true">
            {[1, 2, 3, 4].map((level) => (
              <li key={level}>
                <i className={`console-ov-heat-cell console-ov-heat-l${level}`} />
                <Note>{n(Math.round((max * level) / 4))}</Note>
              </li>
            ))}
          </ul>
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
  const [off, toggleOff] = useSeriesOff();
  const on = (key: string): boolean => !off.includes(key);

  const chart: { name: string; views: number; leads: number }[] = rows.map((row) => ({
    name: deviceName(row.device, labels),
    views: row.views,
    leads: row.leads,
  }));

  const classes: Record<string, string> = { views: SERIES_CLASS[0], leads: SERIES_CLASS[1] };
  // Views and leads are never the same order of number, so each keeps its own axis and
  // its own side of the plot rather than one flattening the other against zero.
  const describe = (entry: TooltipEntry): TipRow => {
    const key = String(entry.dataKey ?? "");
    const value = Number(entry.value ?? 0);
    return {
      name: String(entry.name ?? ""),
      value: key === "views" ? `${n(value)} · ${percent(total > 0 ? (value / total) * 100 : 0)}` : n(value),
      klass: classes[key],
    };
  };

  return (
    <Panel title={labels["overview.devices.title"]}>
      {rows.length === 0 ? (
        <Empty>{labels["overview.devices.empty"]}</Empty>
      ) : (
        <>
          <Legend
            items={[
              { key: "views", label: labels["overview.top.views"], klass: SERIES_CLASS[0] },
              { key: "leads", label: labels["overview.devices.leads"], klass: SERIES_CLASS[1] },
            ]}
            off={off}
            onToggle={toggleOff}
          />
          <div className="console-ov-plot" dir="ltr" aria-hidden="true">
            <ResponsiveContainer width="100%" height={Math.max(112, chart.length * 46 + 26)}>
              <BarChart data={chart} layout="vertical" margin={{ top: 18, right: 44, bottom: 2, left: 0 }}>
                <CartesianGrid {...gridProps("vertical")} />
                <XAxis
                  type="number"
                  dataKey="views"
                  className={`console-ov-axis ${SERIES_CLASS[0]}`}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: number) => n(value)}
                  axisLine={false}
                  tickLine={false}
                  height={18}
                />
                {/* In a vertical layout the numbers run along the X axis, so the leads
                    scale is a second X axis across the top: a Y axis here would tick down
                    the side of the plot and no bar would be read against it. */}
                <XAxis
                  xAxisId="leads"
                  type="number"
                  dataKey="leads"
                  orientation="top"
                  className={`console-ov-axis ${SERIES_CLASS[1]}`}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: number) => n(value)}
                  axisLine={false}
                  tickLine={false}
                  height={18}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  className="console-ov-axis"
                  width={64}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...tooltipProps(describe, "band")} />
                <Bar
                  dataKey="views"
                  name={labels["overview.top.views"]}
                  className={SERIES_CLASS[0]}
                  fill="currentColor"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={14}
                  isAnimationActive={false}
                  hide={!on("views")}
                />
                <Bar
                  dataKey="leads"
                  xAxisId="leads"
                  name={labels["overview.devices.leads"]}
                  className={SERIES_CLASS[1]}
                  fill="currentColor"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={14}
                  isAnimationActive={false}
                  hide={!on("leads")}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartTable
            items={chart.map((row) => ({ label: `${row.name} — ${labels["overview.top.views"]}`, value: row.views }))}
            title={labels["overview.devices.title"]}
            unit={labels["overview.top.views"]}
            labels={labels}
          />
          <ChartTable
            items={chart.map((row) => ({ label: `${row.name} — ${labels["overview.devices.leads"]}`, value: row.leads }))}
            title={labels["overview.devices.title"]}
            unit={labels["overview.devices.leads"]}
            labels={labels}
          />
        </>
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
  const dayLabels = useMemo(() => data.daily.map((point) => point.day), [data.daily]);
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
          <KpiCard key={kpi.key} kpi={kpi} days={dayLabels} labels={labels} compare={data.compare} />
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
          {data.setup && data.setup.some((item) => !item.done) && (
            <Panel title={labels["overview.setup.title"]}>
              <p className="console-ov-setup-progress">
                {labels["overview.setup.progress"]
                  .replace("{done}", n(data.setup.filter((item) => item.done).length))
                  .replace("{all}", n(data.setup.length))}
              </p>
              <ul className="console-ov-setup">
                {data.setup.map((item) => (
                  <li key={item.key} data-done={item.done ? "yes" : "no"}>
                    <a href={item.href}>
                      <span aria-hidden="true">{item.done ? "✓" : "○"}</span>
                      <span>{labels[item.key]}</span>
                      <span className="console-sr-only">
                        {item.done ? labels["overview.setup.done"] : labels["overview.setup.todo"]}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
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
