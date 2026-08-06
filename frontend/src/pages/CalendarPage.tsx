import { useEffect, useRef, useState } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listStaff } from "../api/staff";
import type { Staff } from "../api/staff";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listAppointments, rescheduleAppointment } from "../api/appointments";
import type { Appointment } from "../api/appointments";
import { searchSlots, generateSlots, holdSlot, bookSlot } from "../api/slots";
import type { Slot } from "../api/slots";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { listActivePatientPackages } from "../api/packages";
import type { PatientPackage } from "../api/packages";

const DRAG_APPOINTMENT_ID = "application/x-pluto-appointment-id";

const statusLabel: Record<string, string> = {
  available: "متاح",
  temporarily_held: "محجوز مؤقتاً",
  booked: "محجوز",
  blocked: "معطّل",
  unavailable: "غير متاح",
  reserved: "محجوز إدارياً",
  overbooked: "حجز إضافي",
  waitlist_only: "قائمة انتظار فقط",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CalendarPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Staff[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branchId, setBranchId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generateDays, setGenerateDays] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookingPatientId, setBookingPatientId] = useState("");
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingActivePackages, setBookingActivePackages] = useState<PatientPackage[]>([]);
  const [bookingPatientPackageId, setBookingPatientPackageId] = useState("");
  const [booking, setBooking] = useState(false);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const draggedAppointmentId = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([listBranches(), listStaff(), listPatients(), listServices()]).then(([b, s, p, sv]) => {
      setBranches(b);
      setDoctors(s.filter((x) => x.role === "doctor"));
      setPatients(p);
      setServices(sv);
      if (b.length > 0) setBranchId((cur) => cur || b[0].id);
    });
  }, []);

  const load = () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
    Promise.all([
      searchSlots({ branch_id: branchId, staff_id: doctorId || undefined, date_from: dayStart, date_to: dayEnd, status: "all" }),
      listAppointments(branchId),
    ])
      .then(([slotList, apptList]) => {
        setSlots(slotList.sort((a, b) => a.start_at.localeCompare(b.start_at)));
        setAppointments(apptList);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [branchId, doctorId, date]);

  useEffect(() => {
    setBookingPatientPackageId("");
    if (!bookingPatientId || !bookingServiceId) {
      setBookingActivePackages([]);
      return;
    }
    listActivePatientPackages(bookingPatientId, bookingServiceId)
      .then(setBookingActivePackages)
      .catch(() => setBookingActivePackages([]));
  }, [bookingPatientId, bookingServiceId]);

  const handleGenerate = () => {
    if (!branchId || !doctorId) {
      setError("اختر فرع وطبيب قبل توليد الأوقات.");
      return;
    }
    setGenerating(true);
    const from = date;
    const to = new Date(new Date(date).getTime() + (generateDays - 1) * 86400000).toISOString().slice(0, 10);
    generateSlots({ staff_id: doctorId, branch_id: branchId, from_date: from, to_date: to })
      .then(() => load())
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setGenerating(false));
  };

  const handleBook = (slotId: string) => {
    if (!bookingPatientId || !bookingServiceId) return;
    setBooking(true);
    setError(null);
    const sessionId = `dashboard-${Date.now()}`;
    holdSlot(slotId, sessionId)
      .then(() =>
        bookSlot(slotId, {
          patient_id: bookingPatientId,
          session_id: sessionId,
          service_id: bookingServiceId,
          patient_package_id: bookingPatientPackageId || undefined,
        }),
      )
      .then(() => {
        setBookingSlotId(null);
        setBookingPatientId("");
        setBookingServiceId("");
        setBookingPatientPackageId("");
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBooking(false));
  };

  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";
  const doctorName = (id: string | null) => doctors.find((d) => d.id === id)?.full_name ?? "—";
  const apptForSlot = (slotId: string) => appointments.find((a) => a.slot_id === slotId);

  const handleDropReschedule = (targetSlotId: string) => {
    setDragOverSlotId(null);
    const appointmentId = draggedAppointmentId.current;
    draggedAppointmentId.current = null;
    if (!appointmentId) return;
    setRescheduling(true);
    setError(null);
    rescheduleAppointment(appointmentId, targetSlotId, `calendar-drag-${Date.now()}`, "إعادة جدولة بالسحب والإفلات من التقويم")
      .then(() => load())
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setRescheduling(false));
  };

  return (
    <div className="page">
      <p className="settings-hint">
        عرض يومي لأوقات طبيب معيّن. اسحبي موعداً محجوزاً وأفلتيه على وقت متاح لإعادة جدولته
        {rescheduling && " — جارٍ إعادة الجدولة..."}
      </p>

      <div className="data-form">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">كل الأطباء</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" onClick={() => setDate(new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10))}>
          اليوم السابق
        </button>
        <button type="button" onClick={() => setDate(new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10))}>
          اليوم التالي
        </button>
      </div>

      <div className="data-form">
        <span>توليد أوقات لهذا الطبيب بدءاً من {date} لمدة</span>
        <input
          type="number"
          min={1}
          max={60}
          value={generateDays}
          onChange={(e) => setGenerateDays(Number(e.target.value))}
          style={{ width: 70 }}
        />
        <span>يوم</span>
        <button type="button" onClick={handleGenerate} disabled={generating}>
          {generating ? "جاري التوليد..." : "توليد"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>...جاري التحميل</p>
      ) : slots.length === 0 ? (
        <p className="inbox-empty">ما في أوقات مولّدة لهذا اليوم. استخدم "توليد" فوق بعد ما تحدد الطبيب.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الطبيب</th>
              <th>الحالة</th>
              <th>المريض / الحجز</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => {
              const appt = s.status === "booked" ? apptForSlot(s.id) : undefined;
              const isDropTarget = s.status === "available";
              return (
                <tr
                  key={s.id}
                  draggable={Boolean(appt)}
                  onDragStart={
                    appt
                      ? (e) => {
                          draggedAppointmentId.current = appt.id;
                          e.dataTransfer.setData(DRAG_APPOINTMENT_ID, appt.id);
                          e.dataTransfer.effectAllowed = "move";
                        }
                      : undefined
                  }
                  onDragOver={
                    isDropTarget
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverSlotId !== s.id) setDragOverSlotId(s.id);
                        }
                      : undefined
                  }
                  onDragLeave={isDropTarget ? () => setDragOverSlotId((cur) => (cur === s.id ? null : cur)) : undefined}
                  onDrop={
                    isDropTarget
                      ? (e) => {
                          e.preventDefault();
                          handleDropReschedule(s.id);
                        }
                      : undefined
                  }
                  style={{
                    cursor: appt ? "grab" : undefined,
                    background: dragOverSlotId === s.id ? "var(--highlight, #eef6ff)" : undefined,
                  }}
                >
                  <td>
                    {new Date(s.start_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {new Date(s.end_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>{doctorName(s.doctor_id)}</td>
                  <td>
                    <span className={s.status === "available" ? "badge active" : "badge inactive"}>
                      {statusLabel[s.status] ?? s.status}
                    </span>
                  </td>
                  <td>
                    {appt && patientName(appt.patient_id)}
                    {s.status === "available" &&
                      (bookingSlotId === s.id ? (
                        <span className="setup-row" style={{ display: "inline-flex", gap: 6 }}>
                          <select value={bookingPatientId} onChange={(e) => setBookingPatientId(e.target.value)}>
                            <option value="">اختر المريض</option>
                            {patients.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                          <select value={bookingServiceId} onChange={(e) => setBookingServiceId(e.target.value)}>
                            <option value="">اختر الخدمة</option>
                            {services
                              .filter((sv) => sv.doctor_ids.length === 0 || sv.doctor_ids.includes(s.doctor_id ?? ""))
                              .map((sv) => (
                                <option key={sv.id} value={sv.id}>
                                  {sv.name}
                                  {sv.price ? ` (${sv.price})` : ""}
                                </option>
                              ))}
                          </select>
                          {bookingActivePackages.length > 0 && (
                            <select value={bookingPatientPackageId} onChange={(e) => setBookingPatientPackageId(e.target.value)}>
                              <option value="">دفع عادي (بدون باقة)</option>
                              {bookingActivePackages.map((pp) => (
                                <option key={pp.id} value={pp.id}>
                                  باقة — {pp.sessions_remaining} جلسات متبقية
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="button" disabled={booking || !bookingPatientId || !bookingServiceId} onClick={() => handleBook(s.id)}>
                            {booking ? "..." : "تأكيد الحجز"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBookingSlotId(null);
                              setBookingServiceId("");
                              setBookingPatientPackageId("");
                            }}
                          >
                            إلغاء
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setBookingSlotId(s.id)}>
                          احجز
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
