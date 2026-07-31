import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import {
  addStaffService,
  addStaffSpecialty,
  createStaff,
  listStaff,
  removeStaffService,
  removeStaffSpecialty,
  updateStaff,
} from "../api/staff";
import type { Staff, StaffCreate, StaffRole } from "../api/staff";
import {
  createDoctorAvailability,
  deleteDoctorAvailability,
  listDoctorAvailability,
} from "../api/doctorAvailability";
import type { DoctorAvailability } from "../api/doctorAvailability";
import { listSpecialties } from "../api/specialties";
import type { Specialty } from "../api/specialties";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { generateSlots } from "../api/slots";

const roles: StaffRole[] = ["admin", "doctor", "receptionist"];

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function DoctorProfilePanel({
  doctor,
  branches,
  specialties,
  services,
  onDoctorUpdate,
}: {
  doctor: Staff;
  branches: Branch[];
  specialties: Specialty[];
  services: Service[];
  onDoctorUpdate: (updated: Staff) => void;
}) {
  const doctorBranches = branches.filter((b) => doctor.branch_ids.includes(b.id));
  const [rows, setRows] = useState<DoctorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(doctorBranches[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    listDoctorAvailability(doctor.id)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [doctor.id]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const toggleSpecialty = (specialtyId: string) => {
    setError(null);
    const action = doctor.specialty_ids.includes(specialtyId)
      ? removeStaffSpecialty(doctor.id, specialtyId).then(() => ({
          ...doctor,
          specialty_ids: doctor.specialty_ids.filter((id) => id !== specialtyId),
        }))
      : addStaffSpecialty(doctor.id, specialtyId);
    action.then(onDoctorUpdate).catch((err) => setError(err.message));
  };

  const toggleService = (serviceId: string) => {
    setError(null);
    const action = doctor.service_ids.includes(serviceId)
      ? removeStaffService(doctor.id, serviceId).then(() => ({
          ...doctor,
          service_ids: doctor.service_ids.filter((id) => id !== serviceId),
        }))
      : addStaffService(doctor.id, serviceId);
    action.then(onDoctorUpdate).catch((err) => setError(err.message));
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    setSaving(true);
    setError(null);
    createDoctorAvailability({
      staff_id: doctor.id,
      branch_id: branchId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      slot_duration_minutes: duration,
    })
      .then((row) => setRows((prev) => [...prev, row]))
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const handleDelete = (id: string) => {
    deleteDoctorAvailability(id)
      .then(() => setRows((prev) => prev.filter((r) => r.id !== id)))
      .catch((err) => setError(err.message));
  };

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    if (!branchId || !fromDate || !toDate) return;
    setGenerating(true);
    setGenerateResult(null);
    setError(null);
    generateSlots({ staff_id: doctor.id, branch_id: branchId, from_date: fromDate, to_date: toDate })
      .then((res) => setGenerateResult(`تم توليد ${res.created} موعد متاح`))
      .catch((err) => setError(err.message))
      .finally(() => setGenerating(false));
  };

  return (
    <div className="page" style={{ padding: "0.75rem 0" }}>
      {error && <p className="error">{error}</p>}

      <p><strong>التخصصات</strong> — تحدد أي أسئلة عن "مين الدكاترة" يظهر فيها هذا الطبيب:</p>
      {specialties.length === 0 ? (
        <p className="error">ما في تخصصات معرّفة بعد بالنظام.</p>
      ) : (
        <div className="checkbox-group">
          {specialties.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={doctor.specialty_ids.includes(s.id)}
                onChange={() => toggleSpecialty(s.id)}
              />
              {s.name_ar}
            </label>
          ))}
        </div>
      )}

      <p style={{ marginTop: "1rem" }}><strong>الخدمات التي يقدمها</strong>:</p>
      {services.length === 0 ? (
        <p className="error">ما في خدمات معرّفة بعد بالنظام.</p>
      ) : (
        <div className="checkbox-group">
          {services.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={doctor.service_ids.includes(s.id)}
                onChange={() => toggleService(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}

      {doctorBranches.length === 0 ? (
        <p className="error">اربط الطبيب/ة بفرع أولاً قبل تحديد الدوام.</p>
      ) : (
        <>
          <p style={{ marginTop: "1rem" }}><strong>الدوام والمواعيد المتاحة</strong></p>
          {doctorBranches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {doctorBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {loading ? (
            <p>جاري التحميل...</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>من</th>
                  <th>إلى</th>
                  <th>مدة الموعد (د)</th>
                  <th>الفرع</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dayNames[r.day_of_week]}</td>
                    <td>{r.start_time}</td>
                    <td>{r.end_time}</td>
                    <td>{r.slot_duration_minutes}</td>
                    <td>{branchName(r.branch_id)}</td>
                    <td>
                      <button onClick={() => handleDelete(r.id)}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form className="data-form" onSubmit={handleAdd}>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {dayNames.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            <input
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              title="مدة الموعد بالدقائق"
            />
            <button type="submit" disabled={saving}>
              {saving ? "..." : "إضافة دوام"}
            </button>
          </form>

          <form className="data-form" onSubmit={handleGenerate}>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
            <button type="submit" disabled={generating}>
              {generating ? "..." : "توليد المواعيد المتاحة"}
            </button>
            {generateResult && <span>{generateResult}</span>}
          </form>
        </>
      )}
    </div>
  );
}

const emptyForm: StaffCreate = {
  full_name: "",
  email: "",
  phone: "",
  role: "doctor",
  specialty: "",
  branch_ids: [],
  specialty_ids: [],
  service_ids: [],
  schedule: undefined,
};

export function StaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StaffCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Quick-schedule inputs for the create form (role === "doctor" only) — a
  // single uniform working-hours block applied to whichever days are
  // checked, generating real bookable slots immediately on creation.
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [scheduleDuration, setScheduleDuration] = useState(30);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listSpecialties(), listServices(), listStaff()])
      .then(([branchList, specialtyList, serviceList, staffList]) => {
        setBranches(branchList);
        setSpecialties(specialtyList);
        setServices(serviceList);
        setStaff(staffList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const specialtyNames = (ids: string[]) =>
    ids.map((id) => specialties.find((s) => s.id === id)?.name_ar).filter(Boolean).join(", ");
  const serviceNames = (ids: string[]) =>
    ids.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(", ");

  const toggleFormBranch = (branchId: string) => {
    setForm((f) => ({
      ...f,
      branch_ids: f.branch_ids.includes(branchId)
        ? f.branch_ids.filter((id) => id !== branchId)
        : [...f.branch_ids, branchId],
    }));
  };

  const toggleFormSpecialty = (specialtyId: string) => {
    setForm((f) => ({
      ...f,
      specialty_ids: f.specialty_ids.includes(specialtyId)
        ? f.specialty_ids.filter((id) => id !== specialtyId)
        : [...f.specialty_ids, specialtyId],
    }));
  };

  const toggleFormService = (serviceId: string) => {
    setForm((f) => ({
      ...f,
      service_ids: f.service_ids.includes(serviceId)
        ? f.service_ids.filter((id) => id !== serviceId)
        : [...f.service_ids, serviceId],
    }));
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return;
    setSaving(true);
    const payload: StaffCreate = {
      ...form,
      schedule:
        form.role === "doctor" && scheduleDays.length > 0
          ? {
              days: scheduleDays,
              start_time: scheduleStart,
              end_time: scheduleEnd,
              slot_duration_minutes: scheduleDuration,
            }
          : undefined,
    };
    createStaff(payload)
      .then((member) => {
        setStaff((prev) => [...prev, member]);
        setForm(emptyForm);
        setScheduleDays([]);
        // Surface the profile panel immediately for a new doctor to review
        // or add more schedule rows — not a separate hidden step.
        if (member.role === "doctor") setOpenFor(member.id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const toggleActive = (member: Staff) => {
    updateStaff(member.id, { is_active: !member.is_active })
      .then((updated) => setStaff((prev) => prev.map((s) => (s.id === member.id ? updated : s))))
      .catch((err) => setError(err.message));
  };

  const handleDoctorUpdate = (updated: Staff) => {
    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <form className="data-form" onSubmit={handleCreate}>
        <input
          placeholder="الاسم الكامل"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <input
          placeholder="الإيميل"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          placeholder="الهاتف"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          placeholder="التخصص (نص وصفي اختياري)"
          value={form.specialty}
          onChange={(e) => setForm({ ...form, specialty: e.target.value })}
        />
        <button type="submit" disabled={saving}>
          {saving ? "..." : "إضافة موظف"}
        </button>
      </form>

      {branches.length > 0 && (
        <div className="checkbox-group">
          {branches.map((b) => (
            <label key={b.id}>
              <input
                type="checkbox"
                checked={form.branch_ids.includes(b.id)}
                onChange={() => toggleFormBranch(b.id)}
              />
              {b.name}
            </label>
          ))}
        </div>
      )}

      {form.role === "doctor" && specialties.length > 0 && (
        <div className="checkbox-group">
          {specialties.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={form.specialty_ids.includes(s.id)}
                onChange={() => toggleFormSpecialty(s.id)}
              />
              {s.name_ar}
            </label>
          ))}
        </div>
      )}

      {form.role === "doctor" && services.length > 0 && (
        <div className="checkbox-group">
          {services.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={form.service_ids.includes(s.id)}
                onChange={() => toggleFormService(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}

      {form.role === "doctor" && (
        <div className="data-form">
          <span>أيام الدوام (يبدأ الحجز فيها فوراً بعد الإضافة):</span>
          {dayNames.map((name, idx) => (
            <label key={idx}>
              <input type="checkbox" checked={scheduleDays.includes(idx)} onChange={() => toggleScheduleDay(idx)} />
              {name}
            </label>
          ))}
          <input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} title="من" />
          <input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} title="إلى" />
          <input
            type="number"
            min={5}
            step={5}
            value={scheduleDuration}
            onChange={(e) => setScheduleDuration(Number(e.target.value))}
            title="مدة الموعد بالدقائق"
          />
        </div>
      )}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الإيميل</th>
              <th>الدور</th>
              <th>التخصصات</th>
              <th>الخدمات</th>
              <th>الفروع</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <Fragment key={member.id}>
                <tr>
                  <td>{member.full_name}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{specialtyNames(member.specialty_ids) || member.specialty}</td>
                  <td>{serviceNames(member.service_ids)}</td>
                  <td>{member.branch_ids.map(branchName).join(", ")}</td>
                  <td>
                    <span className={member.is_active ? "badge active" : "badge inactive"}>
                      {member.is_active ? "فعّال" : "متوقف"}
                    </span>
                  </td>
                  <td>
                    {member.role === "doctor" && (
                      <button onClick={() => setOpenFor(openFor === member.id ? null : member.id)}>
                        {openFor === member.id ? "إخفاء الملف" : "الملف والدوام"}
                      </button>
                    )}
                    <button onClick={() => toggleActive(member)}>
                      {member.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
                {openFor === member.id && (
                  <tr>
                    <td colSpan={8}>
                      <DoctorProfilePanel
                        doctor={member}
                        branches={branches}
                        specialties={specialties}
                        services={services}
                        onDoctorUpdate={handleDoctorUpdate}
                      />
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
