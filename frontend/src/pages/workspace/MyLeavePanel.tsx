import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { cancelMyLeave, createMyLeave, getMyLeaves } from "../../api/me";
import type { MyLeave } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { formatDateTime } from "../../format";

function shortDateTime(iso: string) {
  return formatDateTime(iso);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Filing time off lives on the calendar because that's where you notice you
 * need it. Blocking the slots is automatic; the appointments already booked
 * inside the window are not — cancelling those needs appointment.cancel and a
 * human decision, so they're listed for reception instead of vanishing. */
export function MyLeavePanel({ onChanged }: { onChanged?: () => void }) {
  const [leaves, setLeaves] = useState<MyLeave[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justFiled, setJustFiled] = useState<MyLeave | null>(null);

  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState<"planned" | "emergency">("planned");

  const load = useCallback(() => {
    getMyLeaves()
      .then(setLeaves)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const start = `${startDate}T${allDay ? "00:00" : startTime}:00`;
    // An all-day leave has to cover the whole last day, not stop at midnight
    // on its morning.
    const end = allDay
      ? new Date(new Date(`${endDate}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 19)
      : `${endDate}T${endTime}:00`;
    if (new Date(end) <= new Date(start)) {
      setError("وقت النهاية لازم يكون بعد وقت البداية.");
      return;
    }
    setBusy(true);
    createMyLeave({
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      reason: reason.trim() || undefined,
      leave_type: leaveType,
    })
      .then((leave) => {
        setJustFiled(leave);
        setOpen(false);
        setReason("");
        load();
        onChanged?.();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const remove = (id: string) => {
    setBusy(true);
    setError(null);
    cancelMyLeave(id)
      .then(() => {
        setJustFiled(null);
        load();
        onChanged?.();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="leave-panel">
      <div className="today-panel-head">
        <h2>إجازاتي</h2>
        <button className="link-button" onClick={() => setOpen((v) => !v)}>
          {open ? "إلغاء" : "+ تسجيل إجازة"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {justFiled && (
        <div className={justFiled.conflicts.length ? "leave-result warn" : "leave-result"}>
          <strong>
            تم تسجيل الإجازة — أُغلق {justFiled.slots_blocked} وقت متاح للحجز.
          </strong>
          {justFiled.conflicts.length > 0 && (
            <>
              <p>
                في {justFiled.conflicts.length} موعد محجوز ضمن الفترة — هدول ما بينلغوا تلقائياً، لازم
                الاستقبال تتواصل مع المرضى:
              </p>
              <ul className="leave-conflicts">
                {justFiled.conflicts.map((c) => (
                  <li key={c.id}>
                    <span>{shortDateTime(c.scheduled_at)}</span>
                    <strong>{c.patient_name}</strong>
                    {c.patient_phone && <span dir="ltr">{c.patient_phone}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="link-button" onClick={() => setJustFiled(null)}>
            إخفاء
          </button>
        </div>
      )}

      {open && (
        <form className="leave-form" onSubmit={submit}>
          <label>
            من تاريخ
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label>
            إلى تاريخ
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
          <label className="leave-check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            يوم كامل
          </label>
          {!allDay && (
            <>
              <label>
                من الساعة
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label>
                إلى الساعة
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </>
          )}
          <label>
            النوع
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as "planned" | "emergency")}>
              <option value="planned">مخطط لها</option>
              <option value="emergency">طارئة</option>
            </select>
          </label>
          <label className="leave-reason">
            السبب (اختياري)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سفر، مؤتمر..." />
          </label>
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "..." : "تسجيل"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="skeleton-block" style={{ height: 44 }} />
      ) : leaves.length === 0 ? (
        <p className="table-empty">ما في إجازات مسجّلة. سجّل إجازتك عشان يوقف الحجز عليك بهاي الفترة.</p>
      ) : (
        <ul className="leave-list">
          {leaves.map((leave) => (
            <li key={leave.id}>
              <span className="leave-list-when">
                {shortDateTime(leave.start_at)} — {shortDateTime(leave.end_at)}
              </span>
              <span className="leave-list-main">
                <span className={leave.leave_type === "emergency" ? "badge danger" : "badge inactive"}>
                  {leave.leave_type === "emergency" ? "طارئة" : "مخطط لها"}
                </span>
                {leave.reason && <span className="today-list-sub">{leave.reason}</span>}
                {leave.conflicts.length > 0 && (
                  <span className="today-list-sub leave-conflict-note">
                    ⚠ {leave.conflicts.length} موعد محجوز ضمن الفترة
                  </span>
                )}
              </span>
              <button className="btn-secondary" disabled={busy} onClick={() => remove(leave.id)}>
                إلغاء الإجازة
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
