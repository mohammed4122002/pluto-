/** Small SVG charts, written by hand.
 *
 * A charting library would be several hundred kilobytes and would have to be
 * re-themed to match the palette anyway. These few shapes are all the dashboard
 * and the weekly report need, they inherit the CSS custom properties directly,
 * and they lay out right-to-left to match the rest of the Arabic UI.
 *
 * They also render on screens that are still on App.css, outside the ui kit's
 * subtree, so every element states its own list/margin/font reset rather than
 * assuming a global one. */

import { Fragment, useId } from "react";
import { cn } from "../ui";
import { formatNumber } from "../format";

/* -------------------------------------------------------------------------
   Sparkline
   ---------------------------------------------------------------------- */

type SparklineProps = {
  /** Oldest value first. Rendered right-to-left, so the newest point sits at
   *  the left edge -- the direction Arabic reads. */
  values: number[];
  color?: string;
  label: string;
  className?: string;
};

const SPARK_W = 120;
const SPARK_H = 34;

/** Catmull-Rom through the points, converted to cubic beziers. A polyline
 * through seven daily counts is a zigzag; the curve is what makes it read as
 * a trend. Tension is low so the line still passes through every value. */
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Sparkline({ values, color = "var(--chart-1)", label, className }: SparklineProps) {
  const gradientId = useId();
  // An all-zero series draws a flat rule along the bottom, which reads as a
  // deliberate underline rather than "no data". Better to show nothing.
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values, 1);
  const step = SPARK_W / (values.length - 1);
  // Mirror x so index 0 (oldest) lands on the right.
  const points = values.map((v, i): [number, number] => [
    SPARK_W - i * step,
    SPARK_H - 3 - (v / max) * (SPARK_H - 8),
  ]);
  const line = smoothPath(points);
  const last = points[points.length - 1];

  return (
    <svg
      className={cn("h-9 w-full", className)}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${last[0]} ${SPARK_H} L ${SPARK_W} ${SPARK_H} Z`} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The newest point, marked: without it the eye has to work out which
          end of a mirrored line is "now". */}
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   Bar chart
   ---------------------------------------------------------------------- */

export type BarDatum = { label: string; value: number; title?: string };

type BarChartProps = {
  /** Oldest first; drawn right-to-left. */
  data: BarDatum[];
  color?: string;
  /** Rendered over the plot when every value is zero. */
  emptyText?: string;
};

export function BarChart({ data, color = "var(--chart-1)", emptyText }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const allZero = data.every((d) => d.value === 0);

  return (
    <div className="relative" dir="rtl">
      {/* Two guide rules instead of a full grid: enough to judge height
          against, not enough to compete with the bars. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between">
        <span className="h-px w-full bg-grid" />
        <span className="h-px w-full bg-grid" />
        <span className="h-px w-full bg-grid" />
      </div>
      <div className="relative flex h-44 items-end gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.label + i}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            title={d.title ?? `${d.label}: ${formatNumber(d.value)}`}
          >
            <span className="text-[11.5px] font-bold text-muted tabular-nums">
              {d.value > 0 ? formatNumber(d.value) : ""}
            </span>
            <div
              className={cn(
                "w-full animate-grow-y origin-bottom rounded-t-lg transition-opacity duration-150",
                d.value > 0 ? "group-hover:opacity-80" : "",
              )}
              style={{
                // A zero-height bar is invisible, so keep a 3px stub to show
                // the day existed and simply had nothing in it.
                height: d.value > 0 ? `${Math.max((d.value / max) * 100, 6)}%` : "3px",
                background:
                  d.value > 0
                    ? `linear-gradient(180deg, ${color} 0%, color-mix(in oklab, ${color} 55%, transparent) 100%)`
                    : "var(--border-strong)",
                animationDelay: `${i * 55}ms`,
              }}
            />
            <span className="truncate text-[11px] font-medium text-faint">{d.label}</span>
          </div>
        ))}
      </div>
      {/* Centred over the plot, not stranded beneath it -- an empty chart is
          otherwise a tall blank rectangle with a caption under it. */}
      {allZero && emptyText && (
        <p className="absolute inset-0 m-0 grid place-items-center text-center text-[13px] text-muted">
          {emptyText}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Donut
   ---------------------------------------------------------------------- */

export type DonutSlice = { label: string; value: number; color: string };

type DonutProps = {
  slices: DonutSlice[];
  /** Big number in the middle. */
  centerValue: number;
  centerLabel: string;
};

const R = 42;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** Hairline gap between slices, in path units. Adjacent slices in similar
 * hues otherwise merge into one arc. */
const GAP = 1.6;

export function Donut({ slices, centerValue, centerLabel }: DonutProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const drawn = slices.filter((s) => s.value > 0);
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative grid size-[136px] shrink-0 place-items-center">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
          {total > 0 &&
            drawn.map((s) => {
              const length = (s.value / total) * CIRCUMFERENCE;
              const visible = Math.max(length - (drawn.length > 1 ? GAP : 0), 0.5);
              const dash = `${visible} ${CIRCUMFERENCE - visible}`;
              const thisOffset = offset;
              offset += length;
              return (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  strokeDashoffset={-thisOffset}
                  className="transition-[stroke-width] duration-200 hover:[stroke-width:14]"
                >
                  <title>{`${s.label}: ${formatNumber(s.value)}`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <strong className="block font-display text-[26px] leading-8 font-bold tracking-[-0.03em] text-heading tabular-nums">
            {formatNumber(centerValue)}
          </strong>
          <span className="block text-[11.5px] font-medium text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="m-0 flex min-w-[10rem] flex-1 list-none flex-col gap-2 p-0">
        {slices.map((s) => (
          <li key={s.label} className="flex items-start gap-2.5 text-[12.5px]">
            <i className="mt-1.5 size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-5 text-fg">{s.label}</span>
            <span className="shrink-0 font-bold text-heading tabular-nums">{formatNumber(s.value)}</span>
            {total > 0 && (
              <span className="w-9 shrink-0 text-end text-[11.5px] text-faint tabular-nums">
                {Math.round((s.value / total) * 100)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Funnel
   ---------------------------------------------------------------------- */

export type FunnelStage = { label: string; value: number };

type FunnelProps = {
  /** Widest (first) stage to narrowest, e.g. محادثات -> حجوزات -> مؤكدة -> مكتملة. */
  stages: FunnelStage[];
};

/** A booking pipeline, widest stage first. Each bar is scaled against the
 * first stage so the drop-off at every step is a width you can see, not just
 * a number you have to read. */
export function Funnel({ stages }: FunnelProps) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0" dir="rtl">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const dropped = prev !== null ? Math.max(prev - s.value, 0) : null;
        const dropRate = prev ? Math.round(((dropped ?? 0) / prev) * 100) : null;
        return (
          <li key={s.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-heading">{s.label}</span>
              {dropped !== null && dropped > 0 && (
                <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger tabular-nums">
                  فقدان {formatNumber(dropped)} · {dropRate}%
                </span>
              )}
            </div>
            <div className="relative h-9 overflow-hidden rounded-[10px] bg-surface-2">
              <div
                className="flex h-full animate-grow-x items-center justify-end rounded-[10px] px-3 [transform-origin:right]"
                style={{
                  width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%`,
                  background: `linear-gradient(90deg, color-mix(in oklab, var(--tone-violet) 65%, transparent) 0%, var(--tone-violet) 100%)`,
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <span className="text-[12.5px] font-bold text-white tabular-nums">{formatNumber(s.value)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------
   Ranked list
   ---------------------------------------------------------------------- */

export type RankedItem = { label: string; value: number; sublabel?: string; percent?: number };

type RankedListProps = {
  items: RankedItem[];
  color?: string;
  emptyText?: string;
};

/** A ranked, horizontal bar-per-row list -- top doctors, top services, that
 * kind of thing. Bars scale to the largest value in the list, not to 100%,
 * so a clinic with one dominant service doesn't draw nine flat rows. */
export function RankedList({ items, color = "var(--tone-violet)", emptyText }: RankedListProps) {
  if (items.length === 0)
    return emptyText ? <p className="m-0 py-6 text-center text-[13px] text-muted">{emptyText}</p> : null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item, i) => (
        <li key={item.label + i} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-2 text-[10.5px] font-bold text-muted tabular-nums"
              >
                {i + 1}
              </span>
              <span className="truncate text-[13px] font-semibold text-heading">{item.label}</span>
            </span>
            <span className="shrink-0 text-[12.5px] text-muted">
              <span className="font-bold text-heading tabular-nums">{formatNumber(item.value)}</span>
              {item.sublabel && <span className="ms-1.5 text-[11.5px] text-faint">{item.sublabel}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full animate-grow-x rounded-full [transform-origin:right]"
              style={{
                width: `${Math.max((item.value / max) * 100, 3)}%`,
                background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, transparent) 0%, ${color} 100%)`,
                animationDelay: `${i * 60}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
   Heatmap
   ---------------------------------------------------------------------- */

export type HeatmapCell = { day: number; hour: number; count: number };

type HeatmapProps = {
  cells: HeatmapCell[];
  /** Right-to-left reading order, index 0..6 matching HeatmapCell.day. */
  dayLabels: string[];
  emptyText?: string;
};

/** Booking demand by day and hour -- a GitHub-style intensity grid. Hours are
 * limited to the range that actually has data (padded by one on each side)
 * so an all-day clinic doesn't get a grid nine-tenths empty at 3am. */
export function Heatmap({ cells, dayLabels, emptyText }: HeatmapProps) {
  if (cells.every((c) => c.count === 0)) {
    return emptyText ? <p className="m-0 py-6 text-center text-[13px] text-muted">{emptyText}</p> : null;
  }
  const hoursWithData = cells.filter((c) => c.count > 0).map((c) => c.hour);
  const hourStart = Math.max(Math.min(...hoursWithData) - 1, 0);
  const hourEnd = Math.min(Math.max(...hoursWithData) + 1, 23);
  const hours: number[] = [];
  for (let h = hourStart; h <= hourEnd; h++) hours.push(h);

  const byKey = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.count]));
  const max = Math.max(...cells.map((c) => c.count), 1);
  const shade = (intensity: number) =>
    `color-mix(in oklab, var(--tone-violet) ${Math.round(12 + intensity * 88)}%, transparent)`;

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div
        className="grid gap-1 text-center"
        style={{ gridTemplateColumns: `auto repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        <div />
        {hours.map((h) => (
          <div key={h} className="pb-1 text-[10.5px] font-medium text-faint tabular-nums">
            {h}
          </div>
        ))}
        {dayLabels.map((label, day) => (
          <Fragment key={`day-${day}`}>
            <div className="pe-2 text-start text-[11.5px] font-medium whitespace-nowrap text-muted">{label}</div>
            {hours.map((h) => {
              const count = byKey.get(`${day}-${h}`) ?? 0;
              const intensity = count / max;
              return (
                <div
                  key={`${day}-${h}`}
                  className="aspect-square rounded-[5px] bg-surface-2 transition-transform duration-150 hover:scale-110"
                  style={count > 0 ? { background: shade(intensity) } : undefined}
                  title={`${label} — ${h}:00: ${formatNumber(count)} موعد`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-faint">
        <span>أقل</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span key={step} className="size-3 rounded-[4px]" style={{ background: shade(step) }} aria-hidden="true" />
        ))}
        <span>أكثر</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Meter
   ---------------------------------------------------------------------- */

type MeterProps = {
  label: string;
  /** 0-100. */
  percent: number;
  color?: string;
  /** Shown next to the percentage, e.g. "9 من 60". */
  note?: string;
  /** For rates where high is bad (no-show, escalation), so the bar reads as a
   *  warning rather than an achievement. */
  invert?: boolean;
};

export function Meter({ label, percent, color, note, invert = false }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = color ?? (invert ? "var(--tone-rose)" : "var(--tone-teal)");
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-heading">{label}</span>
        <span className="font-display text-[15px] font-bold text-heading tabular-nums">{formatNumber(percent)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${percent}%`}>
        <div
          className="h-full animate-grow-x rounded-full [transform-origin:right]"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, ${fill} 55%, transparent) 0%, ${fill} 100%)`,
          }}
        />
      </div>
      {note && <span className="text-[11.5px] text-faint">{note}</span>}
    </div>
  );
}
