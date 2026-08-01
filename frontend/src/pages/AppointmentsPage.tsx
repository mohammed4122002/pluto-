import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaff } from "../api/staff";
import type { Staff } from "../api/staff";
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

const statuses: AppointmentStatus[] = [
  "requested",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
];

type ActionPanel = { appointmentId: string; kind: "reschedule" | "cancel" | "no_show" };

export function AppointmentsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
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

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listPatients(), listStaff(), listServices(), listAppointments()])
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

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="settings-hint">
          {notice} <button onClick={() => setNotice(null)}>إخفاء</button>
        </p>
      )}

      <form className="data-form" onSubmit={handleCheckInByCode}>
        <input
          autoFocus
          placeholder="امسحي رمز QR أو اكتبي رمز التأكيد لتسجيل الحضور"
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

      {loading ? (
        <p>جاري التحميل...</p>
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
            {appointments.map((appt) => (
              <Fragment key={appt.id}>
                <tr>
                  <td>{nameOf(branches, appt.branch_id)}</td>
                  <td>{nameOf(patients, appt.patient_id)}</td>
                  <td>{nameOf(staff, appt.staff_id)}</td>
                  <td>{nameOf(services, appt.service_id)}</td>
                  <td>{new Date(appt.scheduled_at).toLocaleString("ar-JO")}</td>
                  <td>
                    <span className="badge active">{appt.status}</span>
                  </td>
                  <td>
                    <select value={appt.status} onChange={(e) => changeStatus(appt, e.target.value as AppointmentStatus)}>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
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
          </tbody>
        </table>
      )}
    </div>
  );
}
