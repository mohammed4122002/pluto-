import { useEffect, useMemo, useRef, useState } from "react";
import { search } from "../api/search";
import type { SearchResults } from "../api/search";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { getMyBranches } from "../api/me";
import { SearchIcon } from "../icons";
import { branchTimeZoneMap, formatDateTimeShort } from "../format";

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
  };

  const q = query.trim();
  const hasResults =
    results && (results.patients.length > 0 || results.appointments.length > 0 || results.staff.length > 0);

  return (
    <div className="global-search" ref={containerRef}>
      <SearchIcon className="global-search-icon" />
      <input
        className="global-search-input"
        placeholder="بحث عن مريض، موعد، أو موظف..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && q.length >= MIN_QUERY_LEN && (
        <div className="global-search-results">
          {loading && <div className="global-search-empty">جاري البحث...</div>}
          {!loading && !hasResults && <div className="global-search-empty">ما في نتائج مطابقة.</div>}
          {!loading && results && results.patients.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">المرضى</div>
              {results.patients.map((p) => (
                <button key={p.id} className="global-search-result" onClick={() => go(isSelfScoped ? "my-patients" : "patients")}>
                  <span>{p.full_name}</span>
                  {p.phone && (
                    <span className="global-search-result-meta" dir="ltr">
                      {p.phone}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {!loading && results && results.appointments.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">المواعيد</div>
              {results.appointments.map((a) => (
                <button
                  key={a.id}
                  className="global-search-result"
                  onClick={() => go(isSelfScoped ? "my-calendar" : "appointments")}
                >
                  <span>{a.patient_name}</span>
                  <span className="global-search-result-meta">
                    {formatDateTimeShort(a.scheduled_at, branchTz[a.branch_id])}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!loading && results && results.staff.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">الموظفين</div>
              {results.staff.map((s) => (
                <button key={s.id} className="global-search-result" onClick={() => go("staff")}>
                  <span>{s.full_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
