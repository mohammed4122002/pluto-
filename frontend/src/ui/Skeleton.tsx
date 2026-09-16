import { cn } from "./cn";

/** Placeholder block for content that is still loading.
 *
 * Skeletons, not a spinner, for anything with a known shape: they keep the
 * layout from jumping when the data lands, which on a table of 30 rows is
 * the difference between a screen that settles and one that lurches. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-shimmer rounded-lg bg-line/70", className)}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && "w-2/3")} />
      ))}
    </div>
  );
}
