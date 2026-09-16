import type { ReactNode } from "react";
import { cn } from "./cn";

/** The single surface primitive. Every panel in the app is one of these --
 * the old CSS had a dozen near-identical `*-card` / `*-panel` classes that
 * had drifted a pixel apart from each other. */
export function Card({
  className,
  children,
  as: As = "section",
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article" | "aside";
  padded?: boolean;
}) {
  return (
    <As
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[var(--shadow-sm)]",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] leading-6 font-bold text-heading">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Divider that spans a padded card edge to edge. */
export function CardDivider({ className }: { className?: string }) {
  return <hr className={cn("-mx-5 my-4 border-line", className)} />;
}
