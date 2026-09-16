import type { ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

export type StatTone = "brand" | "teal" | "amber" | "rose" | "neutral";

const tones: Record<StatTone, { chip: string; accent: string }> = {
  brand: { chip: "bg-brand-bg text-brand", accent: "bg-brand" },
  teal: { chip: "bg-teal-bg text-teal", accent: "bg-teal" },
  amber: { chip: "bg-amber-bg text-amber", accent: "bg-amber" },
  rose: { chip: "bg-rose-bg text-rose", accent: "bg-rose" },
  neutral: { chip: "bg-surface-2 text-muted", accent: "bg-line-strong" },
};

/** A single KPI.
 *
 * Four identical grey boxes -- what the reference does, and what the old
 * dashboard did -- read as one undifferentiated block. A tone per metric and
 * an icon chip give each one a handle the eye can come back to, and the
 * value carries the weight instead of the label. */
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
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Change vs. the previous period, rendered beside the value. */
  delta?: ReactNode;
  /** A sparkline or other micro-visual, rendered under the value. */
  chart?: ReactNode;
  tone?: StatTone;
  loading?: boolean;
  /** Makes the whole tile the filter it describes ("12 cancelled" -> show
   * them). Rendered as a real button so it is keyboard reachable. */
  onClick?: () => void;
  className?: string;
}) {
  const t = tones[tone];
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 start-0 w-1 rounded-e-full opacity-80", t.accent)}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-muted">{label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <div className="mt-1 text-2xl leading-8 font-extrabold tracking-tight text-heading tabular-nums">
              {value}
            </div>
          )}
          {delta && !loading && <div className="mt-1.5">{delta}</div>}
          {hint && !loading && <div className="mt-1 text-xs text-faint">{hint}</div>}
        </div>
        {icon && (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", t.chip)}>
            {icon}
          </span>
        )}
      </div>
      {chart && !loading && <div className="mt-3">{chart}</div>}
    </>
  );

  const shell =
    "relative isolate overflow-hidden rounded-2xl border border-line bg-surface p-4 ps-5 text-start font-sans shadow-[var(--shadow-xs)]";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          shell,
          "cursor-pointer appearance-none transition hover:-translate-y-0.5 hover:border-brand-border hover:shadow-[var(--shadow-sm)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn(shell, className)}>{body}</div>;
}

/** Responsive row of KPIs -- one column on a phone, up to four on a desk. */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}
