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
        <span
          className="mb-1 grid size-14 place-items-center rounded-2xl bg-brand-bg text-brand [&_svg]:size-7"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <h3 className="text-base font-bold text-heading">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
