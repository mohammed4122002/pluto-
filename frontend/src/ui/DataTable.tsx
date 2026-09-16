import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Supplying this makes the column sortable. Return null for "no value" --
   * those rows sink to the bottom in both directions instead of scattering. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "start" | "center" | "end";
  width?: string;
  /** Kept out of the card view on phones, where space is the scarce thing. */
  secondary?: boolean;
  /** The column that titles the card on phones. Exactly one per table. */
  primary?: boolean;
  className?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

const alignClass = { start: "text-start", center: "text-center", end: "text-end" } as const;

function compare(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  // Arabic sorts nothing like code-unit order, so names have to go through
  // the locale collator rather than `<`.
  return String(a).localeCompare(String(b), "ar");
}

/** The table every list screen uses.
 *
 * Carries the things each hand-rolled table was missing one of: a sticky
 * header that survives a long scroll, click-to-sort, skeleton rows that hold
 * the layout while data loads, a real empty state, and a card layout on
 * phones -- a 9-column table on a 390px screen is a horizontal scrollbar
 * nobody finds. */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  loading = false,
  empty,
  onRowClick,
  initialSort = null,
  rowClassName,
  footer,
  className,
  skeletonRows = 6,
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  getRowKey: (row: T, index: number) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
  className?: string;
  skeletonRows?: number;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Sort a copy: the caller's array is state somewhere upstream.
    return [...rows].sort((a, b) => factor * compare(col.sortValue!(a), col.sortValue!(b)));
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? current.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );
  };

  const cardColumns = columns.filter((c) => !c.secondary);
  const titleColumn = columns.find((c) => c.primary) ?? columns[0];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow-sm),var(--hairline),var(--highlight)]",
        className,
      )}
    >
      {/* Desk: a real table. */}
      <div className="hidden max-h-[70svh] overflow-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--surface-translucent)] backdrop-blur-xl">
            <tr>
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue);
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "border-0 border-b border-line px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] whitespace-nowrap text-faint uppercase",
                      alignClass[col.align ?? "start"],
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex cursor-pointer appearance-none items-center gap-1.5 rounded border-0 bg-transparent p-0 font-sans text-[11px] font-bold tracking-[0.08em] uppercase transition hover:text-heading",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                          active ? "text-brand" : "text-inherit",
                        )}
                      >
                        {col.header}
                        <SortGlyph dir={active ? sort!.dir : null} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className="border-0 border-b border-line px-4 py-4">
                        <Skeleton className="h-4" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row, index) => (
                  <tr
                    key={getRowKey(row, index)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-0 border-b border-line transition-colors duration-150 last:border-0 hover:bg-surface-2/70",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3.5 align-middle text-[13.5px] text-fg",
                          alignClass[col.align ?? "start"],
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per row, labels beside values. */}
      <div className="divide-y divide-line md:hidden">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          : sorted.map((row, index) => (
              <div
                key={getRowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("flex flex-col gap-2 p-4", onRowClick && "cursor-pointer active:bg-surface-2")}
              >
                <div className="text-sm font-bold text-heading">{titleColumn?.cell(row)}</div>
                <dl className="flex flex-col gap-1.5">
                  {cardColumns
                    .filter((col) => col.key !== titleColumn?.key)
                    .map((col) => (
                      <div key={col.key} className="flex items-start justify-between gap-3">
                        <dt className="shrink-0 text-xs font-semibold text-muted">{col.header}</dt>
                        <dd className="min-w-0 text-end text-[13px] text-fg">{col.cell(row)}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
      </div>

      {!loading && sorted.length === 0 && empty}
      {footer && <div className="border-0 border-t border-line bg-surface-2/60 px-4 py-3">{footer}</div>}
    </div>
  );
}

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-3.5 shrink-0 transition", !dir && "opacity-35")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir !== "desc" && <path d="m7 10 5-5 5 5" />}
      {dir !== "asc" && <path d="m7 14 5 5 5-5" />}
    </svg>
  );
}

/** Filter strip above a table -- a search box plus a few selects, wrapped so
 * it degrades to a stack on a phone instead of overflowing. */
export function TableToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 rounded-[18px] bg-surface p-4 shadow-[var(--shadow-xs),var(--hairline)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
