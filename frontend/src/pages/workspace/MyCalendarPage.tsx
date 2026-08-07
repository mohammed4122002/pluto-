import { useCallback, useEffect, useState } from "react";
import { getMyCalendar } from "../../api/me";
import type { MyCalendarAppointment, MyCalendarDay, MyCalendarSlot } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { MyLeavePanel } from "./MyLeavePanel";

const slotStatusLabel: Record<string, string> = {
  available: "متاح",
  temporarily_held: "محجوز مؤقتاً",
  booked: "محجوز",
  blocked: "معطّل",
  unavailable: "غير متاح",
  reserved: "محجوز إدارياً",
  overbooked: "حجز إضافي",
  waitlist_only: "قائمة انتظار فقط",
};

const appointmentStatusLabel: Record<string, string> = {
  requested: "مطلوب",
  confirmed: "مؤكّد",
  patient_confirmed: "أكّده المريض",
  checked_in: "سجّل حضور",
  waiting: "بالانتظار",
  called: "تم النداء",
  in_consultation: "بالكشف",
  completed: "خلص",
  checked_out: "خرج",
  no_show: "ما حضر",
  cancelled: "ملغي",
  rescheduled: "معاد جدولته",
};

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Slots and appointments interleaved on one timeline — a doctor reads their
 * day as "what's at 10:30", not as two separate lists to cross-reference. */
type Entry =
  | { at: string; kind: "appointment"; appointment: MyCalendarAppointment }
  | { at: string; kind: "slot"; slot: MyCalendarSlot };

function buildTimeline(day: MyCalendarDay): Entry[] {
  const bookedSlotIds = new Set(day.appointments.map((a) => a.slot_id).filter(Boolean));
  const entries: Entry[] = [
    ...day.appointments.map((a) => ({ at: a.scheduled_at, kind: "appointment" as const, appointment: a })),
    // A slot that already carries one of my appointments would otherwise show
    // up twice — the appointment row is the informative one.
    ...day.slots
      .filter((s) => !bookedSlotIds.has(s.id))
      .map((s) => ({ at: s.start_at, kind: "slot" as const, slot: s })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export function MyCalendarPage() {
  const [date, setDate] = useState(todayIso());
  const [day, setDay] = useState<MyCalendarDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyCalendar(date)
      .then(setDay)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  const timeline = day ? buildTimeline(day) : [];
  const bookedCount = day?.appointments.length ?? 0;
  const freeCount = day?.slots.filter((s) => s.status === "available").length ?? 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">تقويمي</div>
          <div className="page-header-subtitle">مواعيدك وأوقاتك المتاحة بهاد اليوم.</div>
        </div>
        <div className="table-toolbar" style={{ margin: 0 }}>
          <button className="btn-secondary" onClick={() => setDate(shiftDay(date, -1))}>
            اليوم السابق
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-secondary" onClick={() => setDate(shiftDay(date, 1))}>
            اليوم التالي
          </button>
          {date !== todayIso() && (
            <button className="btn-secondary" onClick={() => setDate(todayIso())}>
              اليوم
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-value">{bookedCount}</div>
          <div className="stat-card-label">مواعيد محجوزة</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{freeCount}</div>
          <div className="stat-card-label">أوقات متاحة</div>
        </div>
      </div>

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 4 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : timeline.length === 0 ? (
        <p className="table-empty">
          ما في أوقات ولا مواعيد إلك بهاد اليوم. إذا المفروض تكون دوام، الإدارة لازم تولّد أوقاتك من شاشة التقويم.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المريض / الحالة</th>
              <th>الخدمة</th>
              <th>المدة</th>
              <th>الفرع</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry) =>
              entry.kind === "appointment" ? (
                <tr key={`a-${entry.appointment.id}`}>
                  <td>{clockTime(entry.appointment.scheduled_at)}</td>
                  <td>
                    <strong>{entry.appointment.patient_name}</strong>
                    <span className="badge active" style={{ marginInlineStart: 8 }}>
                      {appointmentStatusLabel[entry.appointment.status] ?? entry.appointment.status}
                    </span>
                    {entry.appointment.reason_for_visit && (
                      <div className="page-header-subtitle">{entry.appointment.reason_for_visit}</div>
                    )}
                  </td>
                  <td>{entry.appointment.service_name ?? "—"}</td>
                  <td>{entry.appointment.duration_minutes} د</td>
                  <td>{entry.appointment.branch_name}</td>
                </tr>
              ) : (
                <tr key={`s-${entry.slot.id}`} className="row-muted">
                  <td>{clockTime(entry.slot.start_at)}</td>
                  <td>
                    <span className="badge inactive">{slotStatusLabel[entry.slot.status] ?? entry.slot.status}</span>
                  </td>
                  <td>{entry.slot.service_name ?? "—"}</td>
                  <td>{entry.slot.duration_minutes} د</td>
                  <td>{entry.slot.branch_name}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      <MyLeavePanel onChanged={load} />
    </div>
  );
}
