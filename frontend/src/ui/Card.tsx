import type { ReactNode } from "react";
import { cn } from "./cn";

/** The single surface primitive. Every panel in the app is one of these --
 * the old CSS had a dozen near-identical `*-card` / `*-panel` classes that
 * had drifted a pixel apart from each other.
 *
 * The surface is a hairline ring plus a top highlight rather than a plain
 * 1px border: the highlight is what makes a card read as lit from above
 * instead of drawn on. */
export function Card({
  className,
  children,
  as: As = "section",
  padded = true,
  interactive = false,
  index,
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article" | "aside";
  padded?: boolean;
  /** Adds the hover lift used by cards that are themselves a link/target. */
  interactive?: boolean;
  /** Slot in the entrance sequence; omit to render without animation. */
  index?: number;
}) {
  return (
    <As
      className={cn(
        "relative rounded-[18px] bg-surface shadow-[var(--shadow-sm),var(--hairline),var(--highlight)]",
        padded && "p-5",
        interactive &&
          "transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md),var(--hairline),var(--highlight)]",
        index !== undefined && "animate-rise stagger",
        className,
      )}
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small tinted glyph before the title -- helps a page of six cards read as
   * six things rather than one wall. */
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-bg text-brand [&_svg]:size-[17px]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] leading-6 font-bold tracking-tight text-heading">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Divider that spans a padded card edge to edge. */
export function CardDivider({ className }: { className?: string }) {
  return <hr className={cn("-mx-5 my-4 border-0 border-t border-line", className)} />;
}
