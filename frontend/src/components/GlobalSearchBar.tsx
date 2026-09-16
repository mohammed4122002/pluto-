import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { search } from "../api/search";
import type { SearchResults } from "../api/search";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { getMyBranches } from "../api/me";
import { AppointmentIcon, PatientIcon, SearchIcon, StaffIcon } from "../icons";
import { branchTimeZoneMap, formatDateTimeShort } from "../format";
import { Spinner, cn } from "../ui";

type GlobalSearchBarProps = {
  onNavigate: (key: string) => void;
  isSelfScoped: boolean;
};

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;

export function GlobalSearchBar({ onNavigate, isSelfScoped }: GlobalSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // An appointment's scheduled_at is its branch's real-world time, not the
  // viewer's own -- see format.ts's TimeZoneOpt comment. /branches is
  // clinic-wide and self-scoped staff (doctors) can't call it, so this uses
  // whichever list their own permissions actually allow.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);

  useEffect(() => {
    (isSelfScoped ? getMyBranches() : listBranches()).then(setBranches).catch(() => setBranches([]));
  }, [isSelfScoped]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      search(q)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const go = (key: string) => {
    onNavigate(key);
    setOpen(false);
    setQuery("");
    setResults(null);
    inputRef.current?.blur();
  };

  const q = query.trim();
  const hasResults =
    results && (results.patients.length > 0 || results.appointments.length > 0 || results.staff.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-[18px] text-faint" />
      <input
        ref={inputRef}
        className={cn(
          "h-10 w-full appearance-none rounded-xl border border-line bg-surface-2 ps-10 pe-3 font-sans text-sm text-heading transition",
          "placeholder:text-faint hover:border-line-strong",
          "focus:border-brand focus:bg-surface focus:ring-4 focus:ring-[var(--accent-ring)] focus:outline-none",
        )}
        placeholder="بحث عن مريض، موعد، أو موظف..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {open && q.length >= MIN_QUERY_LEN && (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 max-h-[min(70svh,26rem)] animate-pop-in overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-muted">
              <Spinner /> جاري البحث...
            </div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-6 text-center text-[13px] text-muted">ما في نتائج مطابقة.</div>
          )}
          {!loading && results && results.patients.length > 0 && (
            <ResultGroup label="المرضى" icon={<PatientIcon />}>
              {results.patients.map((p) => (
                <ResultRow
                  key={p.id}
                  title={p.full_name}
                  meta={p.phone ?? undefined}
                  metaDir="ltr"
                  onClick={() => go(isSelfScoped ? "my-patients" : "patients")}
                />
              ))}
            </ResultGroup>
          )}
          {!loading && results && results.appointments.length > 0 && (
            <ResultGroup label="المواعيد" icon={<AppointmentIcon />}>
              {results.appointments.map((a) => (
                <ResultRow
                  key={a.id}
                  title={a.patient_name}
                  meta={formatDateTimeShort(a.scheduled_at, branchTz[a.branch_id])}
                  onClick={() => go(isSelfScoped ? "my-calendar" : "appointments")}
                />
              ))}
            </ResultGroup>
          )}
          {!loading && results && results.staff.length > 0 && (
            <ResultGroup label="الموظفين" icon={<StaffIcon />}>
              {results.staff.map((s) => (
                <ResultRow key={s.id} title={s.full_name} onClick={() => go("staff")} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 pt-1 pb-1.5 text-[11px] font-bold tracking-wide text-faint [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  title,
  meta,
  metaDir,
  onClick,
}: {
  title: string;
  meta?: string;
  metaDir?: "ltr" | "rtl";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer appearance-none items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-start font-sans transition hover:bg-hover"
    >
      <span className="min-w-0 truncate text-[13.5px] font-semibold text-heading">{title}</span>
      {meta && (
        <span className="shrink-0 text-xs text-muted tabular-nums" dir={metaDir}>
          {meta}
        </span>
      )}
    </button>
  );
}
