import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { createStaff, listStaff, updateStaff } from "../api/staff";
import type { Staff, StaffCreate, StaffRole } from "../api/staff";
import {
  createDoctorAvailability,
  deleteDoctorAvailability,
  listDoctorAvailability,
} from "../api/doctorAvailability";
import type { DoctorAvailability } from "../api/doctorAvailability";
import { generateSlots } from "../api/slots";

const roles: StaffRole[] = ["admin", "doctor", "receptionist"];

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function DoctorSchedulePanel({ doctor, branches }: { doctor: Staff; branches: Branch[] }) {
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

  if (doctorBranches.length === 0) {
    return <p className="error">اربط الطبيب/ة بفرع أولاً قبل تحديد الدوام.</p>;
  }

  return (
    <div className="page" style={{ padding: "0.75rem 0" }}>
      {error && <p className="error">{error}</p>}

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
};

export function StaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StaffCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listStaff()])
      .then(([branchList, staffList]) => {
        setBranches(branchList);
        setStaff(staffList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const toggleFormBranch = (branchId: string) => {
    setForm((f) => ({
      ...f,
      branch_ids: f.branch_ids.includes(branchId)
        ? f.branch_ids.filter((id) => id !== branchId)
        : [...f.branch_ids, branchId],
    }));
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return;
    setSaving(true);
    createStaff(form)
      .then((member) => {
        setStaff((prev) => [...prev, member]);
        setForm(emptyForm);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const toggleActive = (member: Staff) => {
    updateStaff(member.id, { is_active: !member.is_active })
      .then((updated) => setStaff((prev) => prev.map((s) => (s.id === member.id ? updated : s))))
      .catch((err) => setError(err.message));
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
          placeholder="التخصص"
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

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الإيميل</th>
              <th>الدور</th>
              <th>التخصص</th>
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
                  <td>{member.specialty}</td>
                  <td>{member.branch_ids.map(branchName).join(", ")}</td>
                  <td>
                    <span className={member.is_active ? "badge active" : "badge inactive"}>
                      {member.is_active ? "فعّال" : "متوقف"}
                    </span>
                  </td>
                  <td>
                    {member.role === "doctor" && (
                      <button onClick={() => setScheduleFor(scheduleFor === member.id ? null : member.id)}>
                        {scheduleFor === member.id ? "إخفاء الدوام" : "الدوام"}
                      </button>
                    )}
                    <button onClick={() => toggleActive(member)}>
                      {member.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
                {scheduleFor === member.id && (
                  <tr>
                    <td colSpan={7}>
                      <DoctorSchedulePanel doctor={member} branches={branches} />
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
