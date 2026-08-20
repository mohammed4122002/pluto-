import { Fragment, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import {
  cancelAppointment,
  checkInAppointment,
  checkInByCode,
  createAppointment,
  listAppointments,
  listVisitTypes,
  markNoShow,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "../api/appointments";
import type { Appointment, AppointmentCreate, AppointmentStatus, VisitType } from "../api/appointments";
import { searchSlots } from "../api/slots";
import type { Slot } from "../api/slots";
import { PatientPicker } from "../components/PatientPicker";
import { QUEUE_OWNED_STATUSES, statusBadgeClass, statusLabel } from "../statusLabels";
import { branchTimeZoneMap, formatDateTimeShort } from "../format";

// Every status status_transitions can actually produce (confirmed against
// the live table) -- not just the handful this UI creates directly, since
// queue/check-in flows drive several of these (waiting, called,
// in_consultation...) without going through this page's own dropdown.
const statuses: AppointmentStatus[] = [
  "draft",
  "requested",
  "pending_review",
  "pending_approval",
  "pending_payment",
  "pending_insurance_verification",
  "pending_prior_authorization",
  "confirmed",
  "patient_confirmed",
  "waitlisted",
  "rescheduled",
  "checked_in",
  "arrived_late",
  "waiting",
  "called",
  "in_consultation",
  "procedure_started",
  "completed",
  "checked_out",
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "cancelled_by_doctor",
  "rejected",
  "no_show",
  "expired",
  "on_hold",
];


// Statuses that mean the visit is settled one way or another -- mirrors
// _FINISHED_STATUSES in backend app/routers/me.py.
const finishedStatuses = new Set<AppointmentStatus>([
  "completed",
  "checked_out",
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "cancelled_by_doctor",
  "no_show",
  "rejected",
  "expired",
]);

/** An appointment from a day that has already passed which nobody ever closed
 * out. Deliberately measured in whole days rather than minutes: a patient
 * turning up two hours late is an ordinary same-day arrival that staff still
 * need to check in, whereas one from a previous day needs resolving, not
 * checking in. */
const isOverdue = (appt: Appointment) => {
  if (finishedStatuses.has(appt.status)) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(appt.scheduled_at) < startOfToday;
};

type ActionPanel = { appointmentId: string; kind: "reschedule" | "cancel" | "no_show" };

export function AppointmentsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  // A confirmed time is a real-world event at that branch, regardless of
  // which timezone the staff member viewing this table happens to be in --
  // see format.ts's TimeZoneOpt comment for the live incident this fixes.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<AppointmentCreate | null>(null);
  const [saving, setSaving] = useState(false);

  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [checkInCode, setCheckInCode] = useState("");
  const [checkingInByCode, setCheckingInByCode] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listPatients(), listStaffDirectory(), listServices(), listAppointments(), listVisitTypes()])
      .then(([branchList, patientList, staffList, serviceList, appointmentList, visitTypeList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setStaff(staffList);
        setServices(serviceList);
        setAppointments(appointmentList);
        setVisitTypes(visitTypeList);
        if (branchList.length > 0 && patientList.length > 0) {
          setForm((f) =>
            f ?? {
              branch_id: branchList[0].id,
              patient_id: patientList[0].id,
              scheduled_at: "",
              duration_minutes: 30,
            },
          );
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form || !form.scheduled_at) return;
    setSaving(true);
    createAppointment(form)
      .then((appt) => {
        setAppointments((prev) => [...prev, appt]);
        if (appt.meeting_link) setNotice(`تم الحجز — رابط الزيارة عن بعد: ${appt.meeting_link}`);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const changeStatus = (appt: Appointment, status: AppointmentStatus) => {
    updateAppointmentStatus(appt.id, status)
      .then((updated) => setAppointments((prev) => prev.map((a) => (a.id === appt.id ? updated : a))))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const closePanel = () => {
    setPanel(null);
    setReasonText("");
    setRescheduleSlots([]);
    setSelectedSlotId("");
  };

  const openReschedule = (appt: Appointment) => {
    setPanel({ appointmentId: appt.id, kind: "reschedule" });
    setError(null);
    searchSlots({ branch_id: appt.branch_id, staff_id: appt.staff_id ?? undefined, status: "available" })
      .then(setRescheduleSlots)
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const submitReschedule = () => {
    if (!panel || !selectedSlotId) return;
    rescheduleAppointment(panel.appointmentId, selectedSlotId, crypto.randomUUID(), reasonText || undefined)
      .then(() => {
        setNotice("تمت إعادة جدولة الموعد.");
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const settlementNotice = (label: string, result: { fee_charged: number; refunded: number }) => {
    const parts: string[] = [];
    if (result.fee_charged > 0) parts.push(`رسوم مطبّقة: ${result.fee_charged}`);
    if (result.refunded > 0) parts.push(`تم استرجاع: ${result.refunded}`);
    return parts.length ? `${label} — ${parts.join(" | ")}` : `${label} بدون رسوم.`;
  };

  const submitCancel = (cancelledBy: "patient" | "clinic" | "doctor") => {
    if (!panel || !reasonText.trim()) return;
    cancelAppointment(panel.appointmentId, reasonText, cancelledBy)
      .then((result) => {
        setNotice(settlementNotice("تم الإلغاء", result));
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const submitNoShow = () => {
    if (!panel || !reasonText.trim()) return;
    markNoShow(panel.appointmentId, reasonText)
      .then((result) => {
        setNotice(settlementNotice("تم تسجيل عدم الحضور", result));
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleCheckIn = (appt: Appointment) => {
    setError(null);
    checkInAppointment(appt.id)
      .then((result) => {
        setNotice(`تم تسجيل الحضور — رقم الدور: ${result.ticket.ticket_number}`);
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleCheckInByCode = (e: FormEvent) => {
    e.preventDefault();
    if (!checkInCode.trim()) return;
    setError(null);
    setCheckingInByCode(true);
    checkInByCode(checkInCode.trim())
      .then((result) => {
        setNotice(`تم تسجيل الحضور — رقم الدور: ${result.ticket.ticket_number}`);
        setCheckInCode("");
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setCheckingInByCode(false));
  };

  if (!loading && (branches.length === 0 || patients.length === 0)) {
    return (
      <div className="page">
        <p>لازم يكون عندك فرع ومريض واحد على الأقل قبل ما تحجز موعد.</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filteredAppointments = appointments.filter((appt) => {
    if (statusFilter && appt.status !== statusFilter) return false;
    if (!q) return true;
    const patientName = nameOf(patients, appt.patient_id).toLowerCase();
    const doctorName = nameOf(staff, appt.staff_id).toLowerCase();
    return patientName.includes(q) || doctorName.includes(q);
  });
  // Same patient booking several visits is normal, but repeating her name on
  // every consecutive row just makes the table noisy. Merge the "المريض"
  // cell (Excel-style, via rowSpan) across a run of adjacent rows for the
  // same patient instead -- purely a rendering grouping, the data underneath
  // is unchanged and stays sorted exactly as the API returned it.
  const appointmentGroups: { patientId: string; items: Appointment[] }[] = [];
  for (const appt of filteredAppointments) {
    const last = appointmentGroups[appointmentGroups.length - 1];
    if (last && last.patientId === appt.patient_id) {
      last.items.push(appt);
    } else {
      appointmentGroups.push({ patientId: appt.patient_id, items: [appt] });
    }
  }

  const todayCount = appointments.filter(
    (a) => new Date(a.scheduled_at).toDateString() === new Date().toDateString(),
  ).length;
  const confirmedCount = appointments.filter((a) => a.status === "confirmed" || a.status === "checked_in").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled" || a.status === "no_show").length;
  const overdueCount = appointments.filter(isOverdue).length;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="settings-hint">
          {notice} <button onClick={() => setNotice(null)}>إخفاء</button>
        </p>
      )}

      <div className="page-header">
        <div>
          <p className="page-header-title">المواعيد</p>
          <p className="page-header-subtitle">حجز، متابعة، وإدارة كل مواعيد العيادة.</p>
        </div>
      </div>

      {!loading && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{appointments.length}</div>
            <div className="stat-card-label">إجمالي المواعيد</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{todayCount}</div>
            <div className="stat-card-label">مواعيد اليوم</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{confirmedCount}</div>
            <div className="stat-card-label">مؤكدة/تم الحضور</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{cancelledCount}</div>
            <div className="stat-card-label">ملغاة/لم يحضر</div>
          </div>
          {overdueCount > 0 && (
            <div className="stat-card">
              <div className="stat-card-value">{overdueCount}</div>
              <div className="stat-card-label">متأخرة — بحاجة إنهاء</div>
            </div>
          )}
        </div>
      )}

      <form className="data-form" onSubmit={handleCheckInByCode}>
        <input
          autoFocus
          placeholder="امسحي رمز QR أو اكتبي رقم الحجز أو رمز التأكيد لتسجيل الحضور"
          value={checkInCode}
          onChange={(e) => setCheckInCode(e.target.value)}
        />
        <button type="submit" disabled={checkingInByCode || !checkInCode.trim()}>
          تسجيل حضور
        </button>
      </form>

      {form && (
        <form className="data-form" onSubmit={handleCreate}>
          <p className="data-form-title">حجز موعد جديد</p>
          <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <PatientPicker
            value={form.patient_id}
            onChange={(patientId) => setForm({ ...form, patient_id: patientId })}
          />
          <select
            value={form.staff_id ?? ""}
            onChange={(e) => setForm({ ...form, staff_id: e.target.value || undefined })}
          >
            <option value="">بدون طبيب محدد</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <select
            value={form.service_id ?? ""}
            onChange={(e) => setForm({ ...form, service_id: e.target.value || undefined })}
          >
            <option value="">بدون خدمة محددة</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            required
          />
          <select
            value={form.visit_type_id ?? ""}
            onChange={(e) => setForm({ ...form, visit_type_id: e.target.value || undefined })}
          >
            <option value="">حضوري (افتراضي)</option>
            {visitTypes
              .filter((v) => v.code !== "in_person")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name_ar}
                </option>
              ))}
          </select>
          <input
            placeholder="مصدر الإحالة (اختياري)"
            value={form.referral_source ?? ""}
            onChange={(e) => setForm({ ...form, referral_source: e.target.value || undefined })}
          />
          <button type="submit" disabled={saving}>
            {saving ? "..." : "حجز موعد"}
          </button>
        </form>
      )}

      {!loading && appointments.length > 0 && (
        <div className="table-toolbar">
          <div className="search-input">
            <input
              placeholder="بحث باسم المريض أو الطبيب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}>
            <option value="">كل الحالات</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>المريض</th>
              <th>الطبيب</th>
              <th>الخدمة</th>
              <th>الموعد</th>
              <th>الحالة</th>
              <th></th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {appointmentGroups.map((group) => {
              const isMerged = group.items.length > 1;
              // rowSpan counts physical <tr> elements, and an open action
              // panel inserts one -- so a span that opens mid-group has to
              // grow by exactly the rows that are currently expanded within it.
              const rowSpan = isMerged
                ? group.items.length + group.items.filter((a) => panel?.appointmentId === a.id).length
                : undefined;
              // A panel row spans the full table width normally (colSpan=8),
              // but inside a merged group the "المريض" column is already
              // claimed by the spanning cell above, so it only has 7 left.
              const panelColSpan = isMerged ? 7 : 8;

              return group.items.map((appt, idx) => (
                <Fragment key={appt.id}>
                  <tr className={isOverdue(appt) ? "row-overdue" : undefined}>
                    <td>{nameOf(branches, appt.branch_id)}</td>
                    {idx === 0 && (
                      <td rowSpan={rowSpan} className={isMerged ? "merged-cell" : undefined}>
                        {nameOf(patients, appt.patient_id)}
                      </td>
                    )}
                    <td>{nameOf(staff, appt.staff_id)}</td>
                    <td>{nameOf(services, appt.service_id)}</td>
                    <td>{formatDateTimeShort(appt.scheduled_at, branchTz[appt.branch_id])}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass[appt.status]}`}>
                        {statusLabel[appt.status]}
                      </span>
                      {isOverdue(appt) && <span className="badge danger">متأخر — بحاجة إنهاء</span>}
                    </td>
                    <td>
                      {/* Queue-owned statuses stay listed so the dropdown shows
                          the truth for an appointment the queue already moved,
                          but they cannot be picked here -- choosing one would
                          advance the appointment without creating its queue
                          ticket. The current value is never disabled, so the
                          select always has a matching option. */}
                      <select
                        value={appt.status}
                        onChange={(e) => changeStatus(appt, e.target.value as AppointmentStatus)}
                        title={"حالات الطابور تُضبط من زر «تسجيل حضور» ومن شاشة الطابور، مش من هون."}
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s} disabled={s !== appt.status && QUEUE_OWNED_STATUSES.has(s)}>
                            {statusLabel[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {/* check_in/reschedule/cancel all need permissions doctors
                          don't have -- only status and no_show (appointment.update)
                          actually work for them. */}
                      {/* Checking someone in for a day that has already passed
                          isn't a real action -- what an overdue row needs is
                          "لم يحضر" or "مكتمل", which stay available. */}
                      {!isOverdue(appt) && <button onClick={() => handleCheckIn(appt)}>تسجيل حضور</button>}
                      <button onClick={() => openReschedule(appt)}>إعادة جدولة</button>
                      <button onClick={() => setPanel({ appointmentId: appt.id, kind: "cancel" })}>إلغاء</button>
                      <button onClick={() => setPanel({ appointmentId: appt.id, kind: "no_show" })}>لم يحضر</button>
                    </td>
                  </tr>
                  {panel?.appointmentId === appt.id && (
                    <tr>
                      <td colSpan={panelColSpan}>
                        {panel.kind === "reschedule" && (
                        <div className="data-form">
                          <select value={selectedSlotId} onChange={(e) => setSelectedSlotId(e.target.value)}>
                            <option value="">اختر الموعد الجديد</option>
                            {rescheduleSlots.map((s) => (
                              <option key={s.id} value={s.id}>
                                {formatDateTimeShort(s.start_at, branchTz[s.branch_id])}
                              </option>
                            ))}
                          </select>
                          <input
                            placeholder="سبب إعادة الجدولة (اختياري)"
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                          />
                          <button onClick={submitReschedule} disabled={!selectedSlotId}>
                            تأكيد
                          </button>
                          <button onClick={closePanel}>إلغاء</button>
                        </div>
                      )}
                      {panel.kind === "cancel" && (
                        <div className="data-form">
                          <input
                            placeholder="سبب الإلغاء"
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                          />
                          <button onClick={() => submitCancel("patient")} disabled={!reasonText.trim()}>
                            إلغاء بطلب المريض
                          </button>
                          <button onClick={() => submitCancel("clinic")} disabled={!reasonText.trim()}>
                            إلغاء من العيادة
                          </button>
                          <button onClick={closePanel}>تراجع</button>
                        </div>
                      )}
                      {panel.kind === "no_show" && (
                        <div className="data-form">
                          <input
                            placeholder="سبب عدم الحضور"
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                          />
                          <button onClick={submitNoShow} disabled={!reasonText.trim()}>
                            تأكيد عدم الحضور
                          </button>
                          <button onClick={closePanel}>تراجع</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )}
                </Fragment>
              ));
            })}
            {filteredAppointments.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  ما في مواعيد مطابقة للبحث.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
