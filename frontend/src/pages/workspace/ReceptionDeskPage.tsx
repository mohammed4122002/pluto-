import { useCallback, useEffect, useState } from "react";
import { getDesk } from "../../api/reception";
import type { DeskArrival, ReceptionDesk } from "../../api/reception";
import { checkInAppointment, checkInByCode } from "../../api/appointments";
import { errorMessage } from "../../api/errors";
import { labelFor, queueStatusLabel, statusLabel } from "../../statusLabels";
import { formatTime } from "../../format";


const SETTLED = new Set([
  "completed", "checked_out", "cancelled", "cancelled_by_patient",
  "cancelled_by_clinic", "cancelled_by_doctor", "no_show", "expired", "rejected",
]);

function clockTime(iso: string) {
  return formatTime(iso);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isLate(arrival: DeskArrival) {
  return !arrival.checked_in && !SETTLED.has(arrival.status) && new Date(arrival.scheduled_at) < new Date();
}

/** The front desk's whole day is one loop: who's due, greet them, check them
 * in, watch the queue absorb them. This screen is that loop — the arrivals and
 * the queue state they feed live in one response, so nobody has to hold two
 * screens open and reconcile them by eye. */
export function ReceptionDeskPage() {
  const [date, setDate] = useState(todayIso());
  const [desk, setDesk] = useState<ReceptionDesk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    getDesk({ date })
      .then(setDesk)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  // Patients arrive while this is open, and doctors advance the queue from
  // their own screens — a stale desk sends someone to a room that's busy.
  useEffect(() => {
    if (date !== todayIso()) return;
    const timer = setInterval(() => getDesk({ date }).then(setDesk).catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, [date]);

  const checkIn = (arrival: DeskArrival) => {
    setBusyId(arrival.appointment_id);
    setError(null);
    setNotice(null);
    checkInAppointment(arrival.appointment_id)
      .then((res) => {
        setNotice(`تم تسجيل حضور ${arrival.patient_name} — رقم الدور ${res.ticket.ticket_number}.`);
        load();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusyId(null));
  };

  const byCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusyId("code");
    setError(null);
    setNotice(null);
    checkInByCode(code.trim())
      .then((res) => {
        setNotice(`تم تسجيل الحضور — رقم الدور ${res.ticket.ticket_number}.`);
        setCode("");
        load();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusyId(null));
  };

  const q = search.trim().toLowerCase();
  const arrivals = (desk?.arrivals ?? []).filter(
    (a) => !q || a.patient_name.toLowerCase().includes(q) || (a.patient_phone ?? "").includes(q),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">الاستقبال</div>
          <div className="page-header-subtitle">
            مواعيد اليوم وحالة كل مريض — بيتحدّث تلقائياً كل 20 ثانية.
          </div>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-value">{desk?.expected_count ?? 0}</div>
          <div className="stat-card-label">متوقّعين اليوم</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{desk?.waiting_count ?? 0}</div>
          <div className="stat-card-label">بانتظار الدور</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{desk?.in_progress_count ?? 0}</div>
          <div className="stat-card-label">بالكشف</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{desk?.done_count ?? 0}</div>
          <div className="stat-card-label">خلصوا</div>
        </div>
      </div>

      <form className="desk-code-form" onSubmit={byCode}>
        <label>
          تسجيل حضور برمز الحجز
          <input
            dir="ltr"
            placeholder="APT-1234 أو الرمز القصير"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button className="btn-primary" type="submit" disabled={busyId === "code"}>
          {busyId === "code" ? "..." : "تسجيل"}
        </button>
      </form>

      {!loading && (desk?.arrivals.length ?? 0) > 0 && (
        <div className="table-toolbar">
          <div className="search-input">
            <input
              placeholder="ابحث بالاسم أو الهاتف ضمن مواعيد اليوم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (desk?.arrivals.length ?? 0) === 0 ? (
        <p className="table-empty">
          {date === todayIso() ? "ما في مواعيد اليوم." : "ما كان في مواعيد بهاد اليوم."}
        </p>
      ) : arrivals.length === 0 ? (
        <p className="table-empty">ما في مريض مطابق للبحث ضمن مواعيد اليوم.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المريض</th>
              <th>الطبيب</th>
              <th>الخدمة</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {arrivals.map((a) => (
              <tr key={a.appointment_id} className={SETTLED.has(a.status) ? "row-muted" : undefined}>
                <td>
                  {clockTime(a.scheduled_at)}
                  {isLate(a) && <span className="desk-late">متأخر</span>}
                </td>
                <td>
                  <strong>{a.patient_name}</strong>
                  {a.patient_phone && (
                    <div className="today-list-sub" dir="ltr">
                      {a.patient_phone}
                    </div>
                  )}
                </td>
                <td>{a.doctor_name ?? "—"}</td>
                <td>{a.service_name ?? "—"}</td>
                <td>
                  {a.checked_in ? (
                    <span className="badge active">
                      دور {a.ticket_number} · {labelFor(queueStatusLabel, a.queue_status, "")}
                    </span>
                  ) : (
                    <span className="badge inactive">{labelFor(statusLabel, a.status, a.status)}</span>
                  )}
                </td>
                <td>
                  {!a.checked_in && !SETTLED.has(a.status) && (
                    <button
                      className="btn-primary"
                      disabled={busyId === a.appointment_id}
                      onClick={() => checkIn(a)}
                    >
                      {busyId === a.appointment_id ? "..." : "تسجيل حضور"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
