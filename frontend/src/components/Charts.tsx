/** Small SVG charts, written by hand.
 *
 * A charting library would be several hundred kilobytes and would have to be
 * re-themed to match the palette anyway. These three shapes are all the
 * dashboard needs, they inherit the CSS custom properties directly, and they
 * lay out right-to-left to match the rest of the Arabic UI. */

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
