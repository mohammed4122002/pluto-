import { useEffect, useRef, useState } from "react";
import { listPatientPage } from "../api/patients";
import type { PatientListItem } from "../api/patients";

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
    <div className="patient-picker" ref={boxRef}>
      <input
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
          className="patient-picker-clear"
          aria-label="مسح الاختيار"
          onClick={() => {
            setSelected(null);
            onChange("");
          }}
        >
          ×
        </button>
      )}
      {open && (
        <div className="patient-picker-results">
          {loading ? (
            <div className="patient-picker-empty">جاري البحث...</div>
          ) : results.length === 0 ? (
            <div className="patient-picker-empty">
              {term ? "ما في مريض مطابق." : "اكتب حرفين للبحث."}
            </div>
          ) : (
            results.map((p) => (
              <button type="button" key={p.id} className="patient-picker-option" onClick={() => pick(p)}>
                <span>{p.full_name}</span>
                <span className="patient-picker-phone" dir="ltr">
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
