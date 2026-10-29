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

const VIEW_W = 1000;

/** SVG points for a line, min 0 so a small change is not stretched into a cliff. */
function linePoints(values: readonly number[], max: number, height: number, width = VIEW_W): string {
  if (values.length === 0) return "";
  const spot = (value: number, index: number): string => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (Math.min(Math.max(value, 0), max) / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return values.map(spot).join(" ");
}

function areaPoints(values: readonly number[], max: number, height: number, width = VIEW_W): string {
  if (values.length === 0) return "";
  return `0,${height} ${linePoints(values, max, height, width)} ${width},${height}`;
}

/* --- small pieces ----------------------------------------------------------- */

function Sparkline({ values }: Readonly<{ values: readonly number[] }>) {
  const max = Math.max(1, ...values);
  return (
    <svg className="console-ov-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="console-ov-spark-area" points={areaPoints(values, max, 28, 100)} />
      <polyline className="console-ov-spark-line" points={linePoints(values, max, 28, 100)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
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

function GridLines({ height }: Readonly<{ height: number }>) {
  return (
    <>
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line key={fraction} className="console-ov-grid" x1={0} x2={VIEW_W} y1={height * fraction} y2={height * fraction} />
      ))}
    </>
  );
}

/* --- KPI -------------------------------------------------------------------- */

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
      <Sparkline values={kpi.series} />
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
  const visitors = days.map((point) => point.visitors);
  const leads = days.map((point) => point.leads);
  const visitorMax = Math.max(1, ...visitors, ...(previous ?? []).map((point) => point.visitors));
  const leadMax = Math.max(1, ...leads, ...(previous ?? []).map((point) => point.leads));
  const totalViews = days.reduce((total, point) => total + point.views, 0);
  const totalLeads = leads.reduce((total, value) => total + value, 0);
  const empty = totalViews === 0 && totalLeads === 0;
  const height = 150;
  const leadHeight = 84;

  const bars = days.map((point, index) => {
    const slot = VIEW_W / days.length;
    const width = Math.max(1, slot * 0.62);
    const barHeight = (point.leads / leadMax) * leadHeight;
    return { seed: point.day, x: index * slot + (slot - width) / 2, y: leadHeight - barHeight, width, height: barHeight };
  });

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
          {/* `dir="ltr"` on the plot: a time axis reads left to right in both languages. */}
          <div className="console-ov-plot" dir="ltr" aria-hidden="true">
            <span className="console-ov-max">{n(visitorMax)}</span>
            <svg className="console-ov-chart" viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
              <GridLines height={height} />
              <polygon className="console-ov-area" points={areaPoints(visitors, visitorMax, height)} />
              <polyline className="console-ov-line" points={linePoints(visitors, visitorMax, height)} vectorEffect="non-scaling-stroke" />
              {previous ? (
                <polyline
                  className="console-ov-line"
                  data-kind="previous"
                  points={linePoints(previous.map((point) => point.visitors), visitorMax, height)}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          </div>
          <div className="console-ov-plot" dir="ltr" aria-hidden="true" data-pane="leads">
            <span className="console-ov-max">{n(leadMax)}</span>
            <svg className="console-ov-chart" viewBox={`0 0 ${VIEW_W} ${leadHeight}`} preserveAspectRatio="none">
              <line className="console-ov-base" x1={0} x2={VIEW_W} y1={leadHeight} y2={leadHeight} />
              {bars.map((bar) => (
                <rect key={bar.seed} className="console-ov-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} />
              ))}
              {previous ? (
                <polyline
                  className="console-ov-line"
                  data-kind="previous"
                  points={linePoints(previous.map((point) => point.leads), leadMax, leadHeight)}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
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
  const cta = points.map((point) => point.cta);
  const submit = points.map((point) => point.submit);
  const total = [...cta, ...submit].reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...cta, ...submit);
  const rate = data.kpis.find((kpi) => kpi.key === "conversion")?.series ?? [];
  const rateMax = Math.max(1, ...rate);
  const rateTotal = rate.reduce((sum, value) => sum + value, 0);
  const height = 110;
  const rateHeight = 70;

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
                <svg className="console-ov-chart" viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
                  <GridLines height={height} />
                  <polyline className="console-ov-line" data-kind="cta" points={linePoints(cta, max, height)} vectorEffect="non-scaling-stroke" />
                  <polyline
                    className="console-ov-line"
                    data-kind="submit"
                    points={linePoints(submit, max, height)}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            </>
          ) : (
            <Note>{labels["overview.engagement.empty"]}</Note>
          )}
          {rateTotal > 0 ? (
            <div className="console-ov-rate">
              <p className="console-ov-caption">
                {labels["overview.kpi.conversion"]} · {percent(rate[rate.length - 1] ?? 0)}
              </p>
              <div className="console-ov-plot" dir="ltr" aria-hidden="true" data-pane="rate">
                <span className="console-ov-max">{percent(rateMax)}</span>
                <svg className="console-ov-chart" viewBox={`0 0 ${VIEW_W} ${rateHeight}`} preserveAspectRatio="none">
                  <line className="console-ov-base" x1={0} x2={VIEW_W} y1={rateHeight} y2={rateHeight} />
                  <polygon className="console-ov-area" points={areaPoints(rate, rateMax, rateHeight)} />
                  <polyline
                    className="console-ov-line"
                    data-kind="rate"
                    points={linePoints(rate, rateMax, rateHeight)}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
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

  // Each arc starts where the one before it ended; folded, so nothing is reassigned
  // during a render.
  const arcs = segments.reduce<Array<Segment & { length: number; offset: number }>>((out, segment) => {
    const length = total > 0 ? (segment.value / total) * 100 : 0;
    const previous = out[out.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    return [...out, { ...segment, length, offset }];
  }, []);

  const name = (segment: Segment): string =>
    segment.other ? labels["overview.sources.other"] : segment.label === "" ? labels["overview.sources.direct"] : segment.label;

  return (
    <Panel title={labels["overview.sources.title"]} intro={basis}>
      {total === 0 ? (
        <Empty>{labels["overview.sources.empty"]}</Empty>
      ) : (
        <div className="console-ov-donut-wrap">
          <div className="console-ov-donut">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="console-ov-donut-track" cx={60} cy={60} r={46} />
              {arcs.map((arc, index) => (
                <circle
                  key={`${arc.label}-${index}`}
                  className="console-ov-donut-seg"
                  data-index={index}
                  cx={60}
                  cy={60}
                  r={46}
                  pathLength={100}
                  strokeDasharray={`${arc.length} ${100 - arc.length}`}
                  strokeDashoffset={-arc.offset}
                  transform="rotate(-90 60 60)"
                />
              ))}
            </svg>
            <span className="console-ov-donut-total">
              <b>{n(total)}</b>
              <small>{labels["overview.sources.total"]}</small>
            </span>
          </div>
          <ul className="console-ov-slices">
            {arcs.map((arc, index) => (
              <li key={`${arc.label}-${index}`}>
                <i data-index={index} aria-hidden="true" />
                <span className="console-ov-slice-name">{name(arc)}</span>
                <b>{n(arc.value)}</b>
                <Note>{percent(total > 0 ? (arc.value / total) * 100 : 0)}</Note>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* --- breakdowns and status ------------------------------------------------- */

function Bars({ rows, labels }: Readonly<{ rows: readonly Slice[]; labels: Labels }>) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="console-ov-bars">
      {rows.map((row) => (
        <li key={`${row.label}-${row.value}`}>
          <span className="console-ov-bar-label" title={row.label === "" ? labels["overview.sources.direct"] : row.label}>
            {row.label === "" ? labels["overview.sources.direct"] : row.label}
          </span>
          <span className="console-ov-bar-track" aria-hidden="true">
            <i style={{ inlineSize: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <span className="console-ov-bar-value">{n(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function BreakdownPanel({
  title,
  rows,
  labels,
}: Readonly<{ title: string; rows: readonly Slice[]; labels: Labels }>) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? <Empty>{labels["overview.breakdown.empty"]}</Empty> : <Bars rows={rows} labels={labels} />}
    </Panel>
  );
}

function StatusPanel({ data, labels }: Readonly<{ data: OverviewData; labels: Labels }>) {
  const statuses = data.leads?.statuses ?? [];
  const total = statuses.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...statuses.map((row) => row.count));
  return (
    <Panel title={labels["overview.funnel.title"]} intro={labels["overview.funnel.intro"]}>
      {total === 0 ? (
        <Empty>{labels["overview.funnel.empty"]}</Empty>
      ) : (
        <ul className="console-ov-bars" data-kind="funnel">
          {statuses.map((row) => (
            <li key={row.status} data-status={row.status}>
              <span className="console-ov-bar-label">{labels[STATUS_KEY[row.status]]}</span>
              <span className="console-ov-bar-track" aria-hidden="true">
                <i style={{ inlineSize: `${Math.max(row.count === 0 ? 0 : 2, (row.count / max) * 100)}%` }} />
              </span>
              <span className="console-ov-bar-value">{n(row.count)}</span>
            </li>
          ))}
        </ul>
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
