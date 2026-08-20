import { useCallback, useEffect, useState } from "react";
import { getMyCalendar } from "../../api/me";
import type { MyCalendarAppointment, MyCalendarDay, MyCalendarSlot } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { MyLeavePanel } from "./MyLeavePanel";
import { formatTime } from "../../format";

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

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function initial(name: string) {
  return name.trim()[0] ?? "";
}

// An appointment/slot time is the branch's own real-world time, not the
// viewer's -- see format.ts's TimeZoneOpt comment for the live incident
// that motivated branch-aware formatting.
function clockTime(iso: string, timeZone?: string) {
  return formatTime(iso, timeZone);
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
          <div className="day-nav">
            <button type="button" aria-label="اليوم السابق" onClick={() => setDate(shiftDay(date, -1))}>
              ›
            </button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="button" aria-label="اليوم التالي" onClick={() => setDate(shiftDay(date, 1))}>
              ‹
            </button>
          </div>
          {date !== todayIso() && (
            <button type="button" className="btn-secondary" onClick={() => setDate(todayIso())}>
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
        <div className="cal-timeline">
          {timeline.map((entry) =>
            entry.kind === "appointment" ? (
              <div key={`a-${entry.appointment.id}`} className="cal-slot booked">
                <span className="cal-slot-time">
                  {clockTime(entry.appointment.scheduled_at, entry.appointment.branch_timezone)}
                </span>
                <span className="cal-slot-doctor">{entry.appointment.branch_name}</span>
                <span className="badge active">
                  {appointmentStatusLabel[entry.appointment.status] ?? entry.appointment.status}
                </span>
                <div className="cal-slot-body">
                  <span className="cal-slot-patient">
                    <span
                      className="avatar"
                      style={{ background: avatarColor(entry.appointment.patient_name), width: 24, height: 24, fontSize: 11 }}
                    >
                      {initial(entry.appointment.patient_name)}
                    </span>
                    {entry.appointment.patient_name}
                  </span>
                  <span>
                    {entry.appointment.service_name ?? "—"} · {entry.appointment.duration_minutes} د
                  </span>
                  {entry.appointment.reason_for_visit && <span>{entry.appointment.reason_for_visit}</span>}
                </div>
              </div>
            ) : (
              <div key={`s-${entry.slot.id}`} className={`cal-slot ${entry.slot.status === "available" ? "available" : ""}`}>
                <span className="cal-slot-time">{clockTime(entry.slot.start_at, entry.slot.branch_timezone)}</span>
                <span className="cal-slot-doctor">{entry.slot.branch_name}</span>
                <span className="badge inactive">{slotStatusLabel[entry.slot.status] ?? entry.slot.status}</span>
                <div className="cal-slot-body">
                  <span>
                    {entry.slot.service_name ?? "—"} · {entry.slot.duration_minutes} د
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <MyLeavePanel onChanged={load} />
    </div>
  );
}
