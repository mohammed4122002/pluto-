/** Small SVG charts, written by hand.
 *
 * A charting library would be several hundred kilobytes and would have to be
 * re-themed to match the palette anyway. These few shapes are all the dashboard
 * and the weekly report need, they inherit the CSS custom properties directly,
 * and they lay out right-to-left to match the rest of the Arabic UI. */

import { Fragment } from "react";

type SparklineProps = {
  /** Oldest value first. Rendered right-to-left, so the newest point sits at
   *  the left edge -- the direction Arabic reads. */
  values: number[];
  color?: string;
  label: string;
};

const SPARK_W = 88;
const SPARK_H = 26;

export function Sparkline({ values, color = "var(--chart-1)", label }: SparklineProps) {
  // An all-zero series draws a flat rule along the bottom, which reads as a
  // deliberate underline rather than "no data". Better to show nothing.
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values, 1);
  const step = SPARK_W / (values.length - 1);
  // Mirror x so index 0 (oldest) lands on the right.
  const point = (v: number, i: number) => {
    const x = SPARK_W - i * step;
    const y = SPARK_H - 2 - (v / max) * (SPARK_H - 5);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const line = values.map(point).join(" ");
  const area = `${SPARK_W},${SPARK_H} ${line} 0,${SPARK_H}`;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width={SPARK_W}
      height={SPARK_H}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type BarDatum = { label: string; value: number; title?: string };

type BarChartProps = {
  /** Oldest first; drawn right-to-left. */
  data: BarDatum[];
  color?: string;
  /** Rendered under the chart when every value is zero. */
  emptyText?: string;
};

export function BarChart({ data, color = "var(--chart-1)", emptyText }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const allZero = data.every((d) => d.value === 0);

  return (
    <div className="bar-chart" dir="rtl">
      <div className="bar-chart-plot">
        {data.map((d, i) => (
          <div className="bar-col" key={d.label + i} title={d.title ?? `${d.label}: ${d.value}`}>
            <span className="bar-value">{d.value > 0 ? d.value : ""}</span>
            <div
              className="bar"
              style={{
                // A zero-height bar is invisible, so keep a 2px stub to show
                // the day existed and simply had nothing in it.
                height: d.value > 0 ? `${Math.max((d.value / max) * 100, 6)}%` : "2px",
                background: d.value > 0 ? color : "var(--border-strong)",
                animationDelay: `${i * 45}ms`,
              }}
            />
            <span className="bar-label">{d.label}</span>
          </div>
        ))}
      </div>
      {/* Centred over the plot, not stranded beneath it -- an empty chart is
          otherwise a tall blank rectangle with a caption under it. */}
      {allZero && emptyText && <p className="chart-empty chart-empty-overlay">{emptyText}</p>}
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

type DonutProps = {
  slices: DonutSlice[];
  /** Big number in the middle. */
  centerValue: number;
  centerLabel: string;
};

const R = 42;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function Donut({ slices, centerValue, centerLabel }: DonutProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let offset = 0;

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 100 100" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const length = (s.value / total) * CIRCUMFERENCE;
                const dash = `${length} ${CIRCUMFERENCE - length}`;
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
                    strokeWidth="11"
                    strokeDasharray={dash}
                    strokeDashoffset={-thisOffset}
                    // Start at 12 o'clock and run clockwise.
                    transform="rotate(-90 50 50)"
                  >
                    <title>{`${s.label}: ${s.value}`}</title>
                  </circle>
                );
              })}
        </svg>
        <div className="donut-center">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-value">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
    <ol className="funnel" dir="rtl">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const dropped = prev !== null ? Math.max(prev - s.value, 0) : null;
        const dropRate = prev ? Math.round(((dropped ?? 0) / prev) * 100) : null;
        return (
          <li key={s.label} className="funnel-row">
            <div className="funnel-bar-track">
              <div
                className="funnel-bar"
                style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 4 : 0)}%`, animationDelay: `${i * 70}ms` }}
              >
                <span className="funnel-value">{s.value}</span>
              </div>
            </div>
            <div className="funnel-meta">
              <span className="funnel-label">{s.label}</span>
              {dropped !== null && dropped > 0 && (
                <span className="funnel-drop">فقدان {dropped} · {dropRate}%</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

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
  if (items.length === 0) return emptyText ? <p className="chart-empty">{emptyText}</p> : null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="ranked-list">
      {items.map((item, i) => (
        <li key={item.label + i} className="ranked-row" style={{ animationDelay: `${i * 45}ms` }}>
          <div className="ranked-row-head">
            <span className="ranked-label">{item.label}</span>
            <span className="ranked-value">
              {item.value}
              {item.sublabel && <span className="ranked-sublabel"> {item.sublabel}</span>}
            </span>
          </div>
          <div className="ranked-track">
            <div
              className="ranked-fill"
              style={{ width: `${Math.max((item.value / max) * 100, 3)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

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
    return emptyText ? <p className="chart-empty">{emptyText}</p> : null;
  }
  const hoursWithData = cells.filter((c) => c.count > 0).map((c) => c.hour);
  const hourStart = Math.max(Math.min(...hoursWithData) - 1, 0);
  const hourEnd = Math.min(Math.max(...hoursWithData) + 1, 23);
  const hours: number[] = [];
  for (let h = hourStart; h <= hourEnd; h++) hours.push(h);

  const byKey = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.count]));
  const max = Math.max(...cells.map((c) => c.count), 1);

  return (
    <div className="heatmap" dir="rtl">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `auto repeat(${hours.length}, 1fr)` }}>
        <div className="heatmap-corner" />
        {hours.map((h) => (
          <div className="heatmap-hour" key={h}>
            {h}
          </div>
        ))}
        {dayLabels.map((label, day) => (
          <Fragment key={`day-${day}`}>
            <div className="heatmap-day">{label}</div>
            {hours.map((h) => {
              const count = byKey.get(`${day}-${h}`) ?? 0;
              const intensity = count / max;
              return (
                <div
                  key={`${day}-${h}`}
                  className="heatmap-cell"
                  style={count > 0 ? { background: `rgba(124, 92, 255, ${0.12 + intensity * 0.78})` } : undefined}
                  title={`${label} — ${h}:00: ${count} موعد`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

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
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{percent}%</span>
      </div>
      <div className="meter-track" role="img" aria-label={`${label}: ${percent}%`}>
        <div className="meter-fill" style={{ width: `${clamped}%`, background: fill }} />
      </div>
      {note && <span className="meter-note">{note}</span>}
    </div>
  );
}
