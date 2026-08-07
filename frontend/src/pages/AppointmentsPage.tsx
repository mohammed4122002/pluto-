import { Fragment, useEffect, useState } from "react";
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
  markNoShow,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "../api/appointments";
import type { Appointment, AppointmentCreate, AppointmentStatus } from "../api/appointments";
import { searchSlots } from "../api/slots";
import type { Slot } from "../api/slots";

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

const statusLabel: Record<AppointmentStatus, string> = {
  draft: "مسودة",
  requested: "بانتظار التأكيد",
  pending_review: "قيد المراجعة",
  pending_approval: "بانتظار الموافقة",
  pending_payment: "بانتظار الدفع",
  pending_insurance_verification: "بانتظار التحقق من التأمين",
  pending_prior_authorization: "بانتظار الموافقة المسبقة",
  confirmed: "مؤكد",
  patient_confirmed: "أكّده المريض",
  waitlisted: "قائمة انتظار",
  rescheduled: "أُعيدت جدولته",
  checked_in: "سجّل حضوره",
  arrived_late: "وصل متأخراً",
  waiting: "بانتظار الدور",
  called: "تم نداؤه",
  in_consultation: "داخل الكشف",
  procedure_started: "بدأ الإجراء",
  completed: "مكتمل",
  checked_out: "غادر العيادة",
  cancelled: "ملغى",
  cancelled_by_patient: "ألغاه المريض",
  cancelled_by_clinic: "ألغته العيادة",
  cancelled_by_doctor: "ألغاه الطبيب",
  rejected: "مرفوض",
  no_show: "لم يحضر",
  expired: "انتهت صلاحيته",
  on_hold: "معلّق",
};

const statusBadgeClass: Record<AppointmentStatus, string> = {
  draft: "inactive",
  requested: "warning",
  pending_review: "warning",
  pending_approval: "warning",
  pending_payment: "warning",
  pending_insurance_verification: "warning",
  pending_prior_authorization: "warning",
  confirmed: "active",
  patient_confirmed: "active",
  waitlisted: "warning",
  rescheduled: "inactive",
  checked_in: "active",
  arrived_late: "warning",
  waiting: "active",
  called: "active",
  in_consultation: "active",
  procedure_started: "active",
  completed: "inactive",
  checked_out: "inactive",
  cancelled: "danger",
  cancelled_by_patient: "danger",
  cancelled_by_clinic: "danger",
  cancelled_by_doctor: "danger",
  rejected: "danger",
  no_show: "danger",
  expired: "danger",
  on_hold: "warning",
};

type ActionPanel = { appointmentId: string; kind: "reschedule" | "cancel" | "no_show" };

export function AppointmentsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
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
    Promise.all([listBranches(), listPatients(), listStaffDirectory(), listServices(), listAppointments()])
      .then(([branchList, patientList, staffList, serviceList, appointmentList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setStaff(staffList);
        setServices(serviceList);
        setAppointments(appointmentList);
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

  const submitCancel = (cancelledBy: "patient" | "clinic" | "doctor") => {
    if (!panel || !reasonText.trim()) return;
    cancelAppointment(panel.appointmentId, reasonText, cancelledBy)
      .then((result) => {
        setNotice(result.fee_charged > 0 ? `تم الإلغاء — رسوم إلغاء مطبّقة: ${result.fee_charged}` : "تم إلغاء الموعد بدون رسوم.");
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const submitNoShow = () => {
    if (!panel || !reasonText.trim()) return;
    markNoShow(panel.appointmentId, reasonText)
      .then((result) => {
        setNotice(result.fee_charged > 0 ? `تم تسجيل عدم الحضور — رسوم مطبّقة: ${result.fee_charged}` : "تم تسجيل عدم الحضور.");
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
  const todayCount = appointments.filter(
    (a) => new Date(a.scheduled_at).toDateString() === new Date().toDateString(),
  ).length;
  const confirmedCount = appointments.filter((a) => a.status === "confirmed" || a.status === "checked_in").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled" || a.status === "no_show").length;

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
          <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
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
            {filteredAppointments.map((appt) => (
              <Fragment key={appt.id}>
                <tr>
                  <td>{nameOf(branches, appt.branch_id)}</td>
                  <td>{nameOf(patients, appt.patient_id)}</td>
                  <td>{nameOf(staff, appt.staff_id)}</td>
                  <td>{nameOf(services, appt.service_id)}</td>
                  <td>{new Date(appt.scheduled_at).toLocaleString("ar-JO")}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass[appt.status]}`}>
                      {statusLabel[appt.status]}
                    </span>
                  </td>
                  <td>
                    <select value={appt.status} onChange={(e) => changeStatus(appt, e.target.value as AppointmentStatus)}>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {/* check_in/reschedule/cancel all need permissions doctors
                        don't have -- only status and no_show (appointment.update)
                        actually work for them. */}
                    <button onClick={() => handleCheckIn(appt)}>تسجيل حضور</button>
                    <button onClick={() => openReschedule(appt)}>إعادة جدولة</button>
                    <button onClick={() => setPanel({ appointmentId: appt.id, kind: "cancel" })}>إلغاء</button>
                    <button onClick={() => setPanel({ appointmentId: appt.id, kind: "no_show" })}>لم يحضر</button>
                  </td>
                </tr>
                {panel?.appointmentId === appt.id && (
                  <tr>
                    <td colSpan={8}>
                      {panel.kind === "reschedule" && (
                        <div className="data-form">
                          <select value={selectedSlotId} onChange={(e) => setSelectedSlotId(e.target.value)}>
                            <option value="">اختر الموعد الجديد</option>
                            {rescheduleSlots.map((s) => (
                              <option key={s.id} value={s.id}>
                                {new Date(s.start_at).toLocaleString("ar-JO")}
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
            ))}
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
