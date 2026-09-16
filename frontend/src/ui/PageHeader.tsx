import type { ReactNode } from "react";
import { cn } from "./cn";

/** The banner every screen opens with.
 *
 * A single flat gradient across 1200px reads as printed plastic, so the wash
 * is built in layers: a three-stop brand gradient, two soft mesh blobs that
 * give the colour somewhere to travel, and a few percent of grain over the
 * whole thing. All of it is decorative and pointer-events-none -- the only
 * interactive things in here are the actions and whatever the caller puts in
 * the bottom strip. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  /** Small line above the title -- the section a screen belongs to. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Optional strip along the bottom edge -- filters, a segmented control,
   * a date range. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grain relative isolate overflow-hidden rounded-[26px] bg-[image:var(--brand-wash)] text-white",
        "shadow-[var(--shadow-brand)] ring-1 ring-white/10 ring-inset",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -start-24 -z-10 size-[26rem] rounded-full bg-[radial-gradient(circle,var(--mesh-1),transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 start-1/3 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,var(--mesh-2),transparent_70%)] opacity-70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 end-0 -z-10 size-[24rem] rounded-full bg-[radial-gradient(circle,var(--mesh-3),transparent_70%)]"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-5 px-6 py-6 sm:px-8 sm:py-7">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.14em] text-white/65 uppercase">
              <span aria-hidden="true" className="h-px w-6 bg-white/40" />
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-white sm:text-[30px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-[46rem] text-[13px] leading-[1.65] text-white/70">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && (
        <div className="relative border-0 border-t border-white/12 bg-black/15 px-6 py-3 backdrop-blur-sm sm:px-8">
          {children}
        </div>
      )}
    </header>
  );
}

/** Page scaffold: the vertical rhythm every screen shares, so no page has to
 * invent its own spacing. Children rise in sequence on first paint -- the
 * `stagger` class reads `--i` off each child. */
export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-5", className)}>{children}</div>;
}

/** Section heading for the space between cards, when a screen has more than
 * one group of them. */
export function SectionTitle({
  title,
  hint,
  actions,
  className,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-1", className)}>
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-heading">{title}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}
