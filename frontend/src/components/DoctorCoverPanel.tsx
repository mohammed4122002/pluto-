import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createSubstitute,
  deleteSubstitute,
  getDoctorLimits,
  listSubstitutes,
  setDoctorLimits,
} from "../api/doctorCover";
import type { DoctorLimits, DoctorSubstitute } from "../api/doctorCover";

type Option = { id: string; full_name: string };
type BranchOption = { id: string; name: string };

const emptyLimits: Omit<DoctorLimits, "staff_id"> = {
  max_patients_per_day: null,
  max_consecutive_minutes: null,
  buffer_before_minutes: null,
  buffer_after_minutes: null,
  break_start_time: null,
  break_end_time: null,
};

/** Cover arrangements and scheduling limits for one doctor.
 *
 * The substitute half is not a nicety: handle_doctor_absence only moves a
 * doctor's patients to someone else if an arrangement is on file here, and
 * otherwise cancels every one of them. */
export function DoctorCoverPanel({
  doctor,
  colleagues,
  branches,
}: {
  doctor: Option;
  colleagues: Option[];
  branches: BranchOption[];
}) {
  const [subs, setSubs] = useState<DoctorSubstitute[]>([]);
  const [limits, setLimits] = useState(emptyLimits);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  const [substituteId, setSubstituteId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listSubstitutes(doctor.id), getDoctorLimits(doctor.id)])
      .then(([s, l]) => {
        setSubs(s);
        const { staff_id: _ignored, ...rest } = l;
        setLimits(rest);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [doctor.id]);

  const num = (v: string) => (v === "" ? null : Number(v));

  const saveLimits = (e: FormEvent) => {
    e.preventDefault();
    setSavingLimits(true);
    setError(null);
    setNotice(null);
    setDoctorLimits(doctor.id, limits)
      .then(() => setNotice("تم حفظ الإعدادات. رح تنطبق على المواعيد اللي تتولّد بعد هلأ."))
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSavingLimits(false));
  };

  const addSubstitute = (e: FormEvent) => {
    e.preventDefault();
    if (!substituteId || !startAt || !endAt) return;
    setSavingSub(true);
    setError(null);
    setNotice(null);
    createSubstitute({
      staff_id: doctor.id,
      substitute_staff_id: substituteId,
      branch_id: branchId || null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
    })
      .then((created) => {
        setSubs((prev) => [created, ...prev]);
        setSubstituteId("");
        setStartAt("");
        setEndAt("");
        setNotice("تم تسجيل التغطية. لو غاب الطبيب بهاي الفترة، مرضاه بينتقلوا للبديل بدل ما تتلغى مواعيدهم.");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSavingSub(false));
  };

  const remove = (id: string) => {
    setError(null);
    deleteSubstitute(id)
      .then(() => setSubs((prev) => prev.filter((s) => s.id !== id)))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const nameOf = (id: string) => colleagues.find((c) => c.id === id)?.full_name ?? id;
  const branchNameOf = (id: string | null) =>
    id ? branches.find((b) => b.id === id)?.name ?? id : "كل الفروع";

  if (loading) return <p>جاري التحميل...</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      {notice && <p className="badge active">{notice}</p>}

      <form className="data-form" onSubmit={saveLimits}>
        <p className="data-form-title">إعدادات جدولة الطبيب</p>
        <p className="page-header-subtitle">
          بتنطبق على المواعيد اللي تتولّد بعد الحفظ — المواعيد المولّدة مسبقاً ما بتتغيّر.
        </p>
        <label>
          دقائق تحضير قبل كل مريض
          <input
            type="number"
            min={0}
            value={limits.buffer_before_minutes ?? ""}
            onChange={(e) => setLimits({ ...limits, buffer_before_minutes: num(e.target.value) })}
          />
        </label>
        <label>
          دقائق بعد كل مريض
          <input
            type="number"
            min={0}
            value={limits.buffer_after_minutes ?? ""}
            onChange={(e) => setLimits({ ...limits, buffer_after_minutes: num(e.target.value) })}
          />
        </label>
        <label>
          أقصى عدد مرضى باليوم
          <input
            type="number"
            min={0}
            value={limits.max_patients_per_day ?? ""}
            onChange={(e) => setLimits({ ...limits, max_patients_per_day: num(e.target.value) })}
          />
        </label>
        <label>
          بداية الاستراحة
          <input
            type="time"
            value={limits.break_start_time?.slice(0, 5) ?? ""}
            onChange={(e) => setLimits({ ...limits, break_start_time: e.target.value || null })}
          />
        </label>
        <label>
          نهاية الاستراحة
          <input
            type="time"
            value={limits.break_end_time?.slice(0, 5) ?? ""}
            onChange={(e) => setLimits({ ...limits, break_end_time: e.target.value || null })}
          />
        </label>
        <button type="submit" disabled={savingLimits}>
          {savingLimits ? "..." : "حفظ الإعدادات"}
        </button>
      </form>

      <form className="data-form" onSubmit={addSubstitute}>
        <p className="data-form-title">الطبيب البديل (التغطية أثناء الغياب)</p>
        <p className="page-header-subtitle">
          مهم: بدون تسجيل بديل لفترة الغياب، النظام بيلغي كل مواعيد الطبيب بتلك الفترة بدل ما ينقلها.
        </p>
        <select value={substituteId} onChange={(e) => setSubstituteId(e.target.value)} required>
          <option value="">اختر الطبيب البديل</option>
          {colleagues
            .filter((c) => c.id !== doctor.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">كل الفروع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label>
          من
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </label>
        <label>
          إلى
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
        </label>
        <button type="submit" disabled={savingSub}>
          {savingSub ? "..." : "تسجيل التغطية"}
        </button>

        {subs.length === 0 ? (
          <p>ما في ترتيبات تغطية مسجّلة لهذا الطبيب.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>البديل</th>
                <th>الفرع</th>
                <th>من</th>
                <th>إلى</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>{nameOf(s.substitute_staff_id)}</td>
                  <td>{branchNameOf(s.branch_id)}</td>
                  <td>{new Date(s.start_at).toLocaleString("ar")}</td>
                  <td>{new Date(s.end_at).toLocaleString("ar")}</td>
                  <td>
                    <button type="button" onClick={() => remove(s.id)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </form>
    </>
  );
}
