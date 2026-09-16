import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

export type StatTone = "brand" | "teal" | "amber" | "rose" | "neutral";

const tones: Record<StatTone, { chip: string; glow: string }> = {
  brand: { chip: "bg-brand-bg text-brand", glow: "var(--tone-violet)" },
  teal: { chip: "bg-teal-bg text-teal", glow: "var(--tone-teal)" },
  amber: { chip: "bg-amber-bg text-amber", glow: "var(--tone-amber)" },
  rose: { chip: "bg-rose-bg text-rose", glow: "var(--tone-rose)" },
  neutral: { chip: "bg-surface-2 text-muted", glow: "var(--border-strong)" },
};

/** A single KPI.
 *
 * Four identical grey boxes -- what most dashboards do, and what this one did
 * -- read as one undifferentiated block. Each tile gets a tone: an icon chip
 * in that hue and a faint radial bloom behind it, so the eye can come back to
 * "the teal one" without re-reading four labels. The value carries the weight,
 * the label sits above it small, and the delta explains it. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  chart,
  tone = "brand",
  loading,
  onClick,
  className,
  index,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Change vs. the previous period, rendered under the value. */
  delta?: ReactNode;
  /** A sparkline or other micro-visual, rendered along the bottom. */
  chart?: ReactNode;
  tone?: StatTone;
  loading?: boolean;
  /** Makes the whole tile the filter it describes ("12 cancelled" -> show
   * them). Rendered as a real button so it is keyboard reachable. */
  onClick?: () => void;
  className?: string;
  index?: number;
}) {
  const t = tones[tone];
  const body = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -end-10 size-40 rounded-full opacity-[0.07] blur-2xl"
        style={{ background: t.glow }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold tracking-tight text-muted">{label}</div>
          {loading ? (
            <Skeleton className="mt-2.5 h-8 w-24" />
          ) : (
            <div className="mt-1 font-display text-[22px] leading-8 font-bold tracking-[-0.03em] text-heading tabular-nums sm:text-[26px] sm:leading-9">
              {value}
            </div>
          )}
          {delta && !loading && <div className="mt-1.5">{delta}</div>}
          {hint && !loading && <div className="mt-1 text-[11.5px] text-faint">{hint}</div>}
        </div>
        {icon && (
          <span
            className={cn(
              "hidden size-11 shrink-0 place-items-center rounded-[14px] shadow-[var(--hairline)] sm:grid [&_svg]:size-5",
              t.chip,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      {chart && !loading && <div className="relative mt-3">{chart}</div>}
    </>
  );

  const shell =
    "relative isolate overflow-hidden rounded-[18px] bg-surface p-4 text-start font-sans shadow-[var(--shadow-sm),var(--hairline),var(--highlight)] sm:p-5";
  const style = index !== undefined ? ({ "--i": index } as CSSProperties) : undefined;
  const entrance = index !== undefined ? "animate-rise stagger" : "";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={cn(
          shell,
          entrance,
          "cursor-pointer appearance-none border-0 transition duration-200",
          "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md),var(--hairline),var(--highlight)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div style={style} className={cn(shell, entrance, className)}>
      {body}
    </div>
  );
}

/** Responsive row of KPIs -- one column on a phone, up to four on a desk. */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-3.5 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}
