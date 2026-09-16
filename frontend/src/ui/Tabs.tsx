import type { ReactNode } from "react";
import { cn } from "./cn";

export type TabItem<T extends string = string> = {
  key: T;
  label: string;
  badge?: ReactNode;
  icon?: ReactNode;
};

/** Pill-style switcher for a handful of sibling views (the invoices /
 * payments / insurers / reports row in the reference). Scrolls rather than
 * wraps on narrow screens so the control keeps its shape. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  onBrand,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Sits on the page-header wash instead of a page surface. */
  onBrand?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1",
        onBrand ? "bg-black/20" : "border border-line bg-surface-2",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer appearance-none items-center gap-2 rounded-lg border-0 px-3.5 py-1.5 font-sans text-[13.5px] font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              onBrand
                ? active
                  ? "bg-white text-[#4c23d6] shadow-sm"
                  : "bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
                : active
                  ? "bg-surface text-heading shadow-[var(--shadow-xs)]"
                  : "bg-transparent text-muted hover:text-heading",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Side rail of sections -- used by the consolidated settings screen, where
 * ten former nav entries became ten sections of one page. Collapses to a
 * horizontal scroller on narrow screens. */
export function SideTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible",
        className,
      )}
      aria-label="أقسام الصفحة"
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer appearance-none items-center gap-2.5 rounded-xl border-0 px-3 py-2.5 text-start font-sans text-[13.5px] font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active
                ? "bg-brand-bg text-brand"
                : "bg-transparent text-fg hover:bg-hover hover:text-heading",
              "lg:w-full",
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center [&_svg]:size-[18px]">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </nav>
  );
}
