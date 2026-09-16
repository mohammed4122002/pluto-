import type { ReactNode } from "react";
import { cn } from "./cn";

/** What an empty screen should say.
 *
 * The rule the old screens broke: an empty state names the thing that is
 * missing *and* offers the action that fills it. "No invoices" alone leaves
 * the user to hunt for the button. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-10" : "gap-3 px-6 py-16",
        className,
      )}
    >
      {icon && (
        <span className="relative mb-2 grid size-20 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-brand-bg/50" />
          <span className="absolute inset-[10px] rounded-full bg-brand-bg" />
          <span className="relative grid size-11 place-items-center rounded-full bg-surface text-brand shadow-[var(--shadow-sm)] [&_svg]:size-5">
            {icon}
          </span>
        </span>
      )}
      <h3 className="font-display text-[15px] font-bold tracking-tight text-heading">{title}</h3>
      {description && <p className="max-w-sm text-[13px] leading-6 text-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
