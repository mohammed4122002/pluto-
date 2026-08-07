import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listNotificationSchedules, updateNotificationSchedule, updateNotificationTemplate } from "../api/notifications";
import type { NotificationSchedule } from "../api/notifications";

const templateLabels: Record<string, string> = {
  reminder_24h_ar: "تذكير قبل الموعد بيوم",
  reminder_2h_ar: "تذكير قبل الموعد بساعتين",
  post_visit_followup_ar: "رسالة التقييم بعد الزيارة",
  booking_confirmation_ar: "رسالة تأكيد الحجز",
  queue_called_ar: "رسالة نداء الطابور",
};

const templateHints: Record<string, string> = {
  reminder_24h_ar: "المتغيرات المتاحة: {{patient_name}} {{date}} {{time}} {{doctor_name}} {{branch_name}}",
  reminder_2h_ar: "المتغيرات المتاحة: {{patient_name}} {{date}} {{time}} {{doctor_name}} {{branch_name}}",
  post_visit_followup_ar: "المتغيرات المتاحة: {{patient_name}}",
  booking_confirmation_ar: "المتغيرات المتاحة: {{patient_name}} {{date}} {{time}} {{appointment_number}} {{confirmation_code}}",
  queue_called_ar: "المتغيرات المتاحة: {{patient_name}} {{doctor_name}}",
};

// Fixed display order -- the two reminders first, then the rest in the
// order an admin would naturally think of the patient's journey.
const displayOrder = ["reminder_24h_ar", "reminder_2h_ar", "post_visit_followup_ar", "booking_confirmation_ar", "queue_called_ar"];

function hoursFromOffset(minutes: number | null): number {
  return minutes !== null ? Math.abs(minutes) / 60 : 0;
}

function ScheduleCard({
  schedule,
  onUpdated,
}: {
  schedule: NotificationSchedule;
  onUpdated: (updated: NotificationSchedule) => void;
}) {
  const [body, setBody] = useState(schedule.template.body_template);
  const [active, setActive] = useState(schedule.is_active);
  const [hours, setHours] = useState(hoursFromOffset(schedule.offset_minutes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The two time-based trigger types get an editable offset; on_status_change
  // schedules (booking confirmation, queue call) fire the instant that status
  // is reached, so there is no "when" to configure for them.
  const isTimeBased = schedule.trigger_type === "before_appointment" || schedule.trigger_type === "after_appointment";
  const offsetMinutes = () => Math.round(hours * 60) * (schedule.trigger_type === "before_appointment" ? -1 : 1);

  const dirty = body !== schedule.template.body_template || active !== schedule.is_active || (isTimeBased && hours !== hoursFromOffset(schedule.offset_minutes));

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const requests: Promise<unknown>[] = [];
    if (body !== schedule.template.body_template) {
      requests.push(updateNotificationTemplate(schedule.template.id, { body_template: body }));
    }
    const scheduleUpdates: { offset_minutes?: number; is_active?: boolean } = {};
    if (active !== schedule.is_active) scheduleUpdates.is_active = active;
    if (isTimeBased && offsetMinutes() !== schedule.offset_minutes) scheduleUpdates.offset_minutes = offsetMinutes();
    if (Object.keys(scheduleUpdates).length > 0) {
      requests.push(updateNotificationSchedule(schedule.id, scheduleUpdates));
    }

    Promise.all(requests)
      .then(() => {
        setNotice("تم الحفظ.");
        onUpdated({
          ...schedule,
          is_active: active,
          offset_minutes: isTimeBased ? offsetMinutes() : schedule.offset_minutes,
          template: { ...schedule.template, body_template: body },
        });
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  return (
    <form className="settings-form" onSubmit={handleSave} style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{templateLabels[schedule.template.code] ?? schedule.template.code}</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          مفعّلة
        </label>
      </div>

      {isTimeBased && (
        <label>
          {schedule.trigger_type === "before_appointment" ? "كم ساعة قبل الموعد" : "كم ساعة بعد الموعد"}
          <input type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ maxWidth: 120 }} />
        </label>
      )}

      <label>
        نص الرسالة
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {templateHints[schedule.template.code] && (
        <p className="settings-hint" style={{ fontSize: 12 }}>
          {templateHints[schedule.template.code]}
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="settings-hint">{notice}</p>}
      <button type="submit" disabled={saving || !dirty}>
        {saving ? "..." : "حفظ"}
      </button>
    </form>
  );
}

export function NotificationSettingsPage() {
  const [schedules, setSchedules] = useState<NotificationSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listNotificationSchedules()
      .then(setSchedules)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...schedules].sort((a, b) => displayOrder.indexOf(a.template.code) - displayOrder.indexOf(b.template.code));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">رسائل وتنبيهات آلية</p>
          <p className="page-header-subtitle">
            نص كل رسالة تلقائية بتوصل للمريض، ومتى بتنبعت — تذكيرات المواعيد، رسالة التقييم بعد الزيارة، تأكيد
            الحجز، ورسالة نداء الطابور.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {sorted.map((s) => (
            <ScheduleCard key={s.id} schedule={s} onUpdated={(updated) => setSchedules((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
          ))}
        </div>
      )}
    </div>
  );
}
