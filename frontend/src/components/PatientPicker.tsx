import { useEffect, useRef, useState } from "react";
import { listPatientPage } from "../api/patients";
import type { PatientListItem } from "../api/patients";
import { SearchIcon } from "../icons";
import { Spinner, cn } from "../ui";

/** Pick a patient by typing, not by scrolling.
 *
 * The booking screens rendered every patient into a `<select>`. That is fine
 * for a clinic with fifty and unusable at five thousand — and it only worked at
 * all because the list endpoint returned the whole table, which is the thing
 * that had to stop. Here the query goes to the database with the search term,
 * so the number of patients in the clinic stops being the browser's problem. */
export function PatientPicker({
  value,
  onChange,
  placeholder = "ابحث عن مريض بالاسم أو الهاتف...",
}: {
  value: string;
  onChange: (patientId: string, patient?: PatientListItem) => void;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [selected, setSelected] = useState<PatientListItem | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // A term typed letter by letter should be one query, not eight.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(() => {
      listPatientPage({ search: term.trim() || undefined, limit: 15 })
        .then((page) => setResults(page.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [term, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // A cleared selection has to clear the label too, or the box keeps showing a
  // patient the form no longer holds.
  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  const pick = (patient: PatientListItem) => {
    setSelected(patient);
    setOpen(false);
    setTerm("");
    onChange(patient.id, patient);
  };

  return (
    <div className="relative" ref={boxRef}>
      <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-[18px] text-faint" />
      <input
        className={cn(
          // `border-solid` is spelled out because this picker also renders on
          // screens that are still on App.css, outside the ui kit's data-ui
          // subtree -- where nothing has set a default border style.
          "h-10 w-full appearance-none rounded-xl border border-solid border-line bg-surface ps-10 pe-9 font-sans text-sm text-heading transition",
          "placeholder:text-faint hover:border-line-strong",
          "focus:border-brand focus:ring-4 focus:ring-[var(--accent-ring)] focus:outline-none",
        )}
        value={open ? term : selected?.full_name ?? ""}
        placeholder={selected ? selected.full_name : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
      />
      {selected && !open && (
        <button
          type="button"
          className="absolute inset-y-0 end-2 my-auto grid size-6 cursor-pointer appearance-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted transition hover:bg-hover hover:text-heading"
          aria-label="مسح الاختيار"
          onClick={() => {
            setSelected(null);
            onChange("");
          }}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-40 max-h-64 animate-pop-in overflow-y-auto rounded-xl border border-solid border-line bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-5 text-[13px] text-muted">
              <Spinner /> جاري البحث...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-5 text-center text-[13px] text-muted">
              {term ? "ما في مريض مطابق." : "اكتب حرفين للبحث."}
            </div>
          ) : (
            results.map((p) => (
              <button
                type="button"
                key={p.id}
                className="flex w-full cursor-pointer appearance-none items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-start font-sans transition hover:bg-hover"
                onClick={() => pick(p)}
              >
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-heading">{p.full_name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums" dir="ltr">
                  {p.phone}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
