import type { ReactNode } from "react";
import { cn } from "./cn";

/** The banner every screen opens with.
 *
 * Reference-inspired: a brand wash carrying the screen's name, its one-line
 * purpose, and the primary action -- so "what am I looking at" and "what can
 * I do here" are answered before the eye reaches the content. The wash is
 * kept to a band rather than the whole page: it frames the screen instead of
 * competing with the data underneath it. */
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Optional strip along the bottom edge of the banner -- filters, a
   * segmented control, a date range. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-[image:var(--brand-wash)] text-white shadow-[var(--shadow-brand)]",
        className,
      )}
    >
      {/* Two soft highlights keep a large flat gradient from banding on wide
          screens; pointer-events-none so they never eat a click. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -start-16 -z-10 size-72 rounded-full bg-white/15 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 end-10 -z-10 size-72 rounded-full bg-black/20 blur-3xl"
      />
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-6 text-white/80">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && (
        <div className="border-t border-white/15 bg-black/10 px-6 py-3 sm:px-8">{children}</div>
      )}
    </header>
  );
}

/** Page scaffold: the vertical rhythm every screen shares, so no page has to
 * invent its own spacing. */
export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-5", className)}>{children}</div>;
}
