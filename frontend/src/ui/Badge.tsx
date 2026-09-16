import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "teal"
  | "amber"
  | "rose";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  brand: "bg-brand-bg text-brand border-brand-border",
  success: "bg-success-bg text-success border-success-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  danger: "bg-danger-bg text-danger border-danger-border",
  info: "bg-info-bg text-info border-info-border",
  teal: "bg-teal-bg text-teal border-transparent",
  amber: "bg-amber-bg text-amber border-transparent",
  rose: "bg-rose-bg text-rose border-transparent",
};

/** Status pill. `dot` adds the small leading marker used in the status
 * column, where the colour alone is doing too much work at a glance. */
export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Small count chip for nav items and tabs. Renders nothing at zero, so
 * callers can pass a raw count without guarding every call site. */
export function CountBadge({ count, tone = "brand" }: { count: number; tone?: BadgeTone }) {
  if (!count) return null;
  return (
    <Badge tone={tone} className="min-w-6 justify-center px-1.5 py-0.5 tabular-nums">
      {count > 99 ? "+99" : count}
    </Badge>
  );
}
