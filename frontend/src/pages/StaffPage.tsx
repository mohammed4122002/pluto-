import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "../components/Modal";
import { listBranches } from "../api/branches";
import { DoctorCoverPanel } from "../components/DoctorCoverPanel";
import type { Branch } from "../api/branches";
import {
  addStaffBranch,
  addStaffService,
  addStaffSpecialty,
  createStaff,
  deleteStaff,
  listStaff,
  removeStaffBranch,
  removeStaffService,
  removeStaffSpecialty,
  setStaffPassword,
  updateStaff,
} from "../api/staff";
import type { Staff, StaffCreate, StaffRole, StaffUpdate } from "../api/staff";
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
const roleLabel: Record<StaffRole, string> = { admin: "مدير", doctor: "طبيب", receptionist: "موظف استقبال" };
const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function initials(name: string) {
  // Arabic letters don't shape/join cleanly as a two-letter monogram the way
  // Latin initials do -- one letter reads far more clearly here.
  return name.replace(/^د\.\s*/, "").trim()[0] ?? "";
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 12) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => PASSWORD_CHARS[v % PASSWORD_CHARS.length]).join("");
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

function AddStaffModal({
  branches,
  specialties,
  services,
  onClose,
  onCreated,
}: {
  branches: Branch[];
  specialties: Specialty[];
  services: Service[];
  onClose: () => void;
  onCreated: (member: Staff) => void;
}) {
  const [form, setForm] = useState<StaffCreate>(emptyForm);
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [scheduleDuration, setScheduleDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: "branch_ids" | "specialty_ids" | "service_ids", id: string) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }));
  };

  const toggleDay = (day: number) => {
    setScheduleDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    const payload: StaffCreate = {
      ...form,
      schedule:
        form.role === "doctor" && scheduleDays.length > 0
          ? { days: scheduleDays, start_time: scheduleStart, end_time: scheduleEnd, slot_duration_minutes: scheduleDuration }
          : undefined,
    };
    createStaff(payload)
      .then((member) => {
        onCreated(member);
        onClose();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title="إضافة موظف جديد" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}

        <div className="form-section">
          <label>البيانات الأساسية</label>
          <div className="data-form">
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
            <input placeholder="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-section">
          <label>الفروع</label>
          <div className="checkbox-group">
            {branches.map((b) => (
              <label key={b.id}>
                <input type="checkbox" checked={form.branch_ids.includes(b.id)} onChange={() => toggle("branch_ids", b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </div>

        {form.role === "doctor" && (
          <>
            <div className="form-section">
              <label>التخصصات</label>
              <div className="checkbox-group">
                {specialties.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={form.specialty_ids.includes(s.id)}
                      onChange={() => toggle("specialty_ids", s.id)}
                    />
                    {s.name_ar}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <label>الخدمات التي يقدمها</label>
              <div className="checkbox-group">
                {services.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={form.service_ids.includes(s.id)}
                      onChange={() => toggle("service_ids", s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <label>أيام الدوام (يبدأ الحجز فيها فوراً بعد الإضافة)</label>
              <div className="checkbox-group">
                {dayNames.map((name, idx) => (
                  <label key={idx}>
                    <input type="checkbox" checked={scheduleDays.includes(idx)} onChange={() => toggleDay(idx)} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="data-form">
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
            </div>
          </>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "..." : "حفظ الموظف"}
        </button>
      </form>
    </Modal>
  );
}

function EditStaffModal({
  doctor,
  branches,
  specialties,
  services,
  allStaff,
  onClose,
  onUpdate,
  onDelete,
}: {
  doctor: Staff;
  branches: Branch[];
  specialties: Specialty[];
  services: Service[];
  allStaff: Staff[];
  onClose: () => void;
  onUpdate: (updated: Staff) => void;
  onDelete: (id: string) => void;
}) {
  const [basic, setBasic] = useState<StaffUpdate>({
    full_name: doctor.full_name,
    phone: doctor.phone ?? "",
    role: doctor.role,
    specialty: doctor.specialty ?? "",
  });
  const [savingBasic, setSavingBasic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSetMessage, setPasswordSetMessage] = useState<string | null>(null);

  const [rows, setRows] = useState<DoctorAvailability[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const doctorBranches = branches.filter((b) => doctor.branch_ids.includes(b.id));
  const [scheduleBranchId, setScheduleBranchId] = useState(doctorBranches[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [duration, setDuration] = useState(30);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoadingSchedule(true);
    listDoctorAvailability(doctor.id)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSchedule(false));
  }, [doctor.id]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const saveBasic = (e: FormEvent) => {
    e.preventDefault();
    setSavingBasic(true);
    setError(null);
    updateStaff(doctor.id, basic).then(onUpdate).catch((err) => setError(err.message)).finally(() => setSavingBasic(false));
  };

  const toggleBranch = (branchId: string) => {
    setError(null);
    const action = doctor.branch_ids.includes(branchId)
      ? removeStaffBranch(doctor.id, branchId).then(() => ({
          ...doctor,
          branch_ids: doctor.branch_ids.filter((id) => id !== branchId),
        }))
      : addStaffBranch(doctor.id, branchId);
    action.then(onUpdate).catch((err) => setError(err.message));
  };

  const toggleSpecialty = (specialtyId: string) => {
    setError(null);
    const action = doctor.specialty_ids.includes(specialtyId)
      ? removeStaffSpecialty(doctor.id, specialtyId).then(() => ({
          ...doctor,
          specialty_ids: doctor.specialty_ids.filter((id) => id !== specialtyId),
        }))
      : addStaffSpecialty(doctor.id, specialtyId);
    action.then(onUpdate).catch((err) => setError(err.message));
  };

  const toggleService = (serviceId: string) => {
    setError(null);
    const action = doctor.service_ids.includes(serviceId)
      ? removeStaffService(doctor.id, serviceId).then(() => ({
          ...doctor,
          service_ids: doctor.service_ids.filter((id) => id !== serviceId),
        }))
      : addStaffService(doctor.id, serviceId);
    action.then(onUpdate).catch((err) => setError(err.message));
  };

  const handleAddSchedule = (e: FormEvent) => {
    e.preventDefault();
    if (!scheduleBranchId) return;
    setError(null);
    createDoctorAvailability({
      staff_id: doctor.id,
      branch_id: scheduleBranchId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      slot_duration_minutes: duration,
    })
      .then((row) => setRows((prev) => [...prev, row]))
      .catch((err) => setError(err.message));
  };

  const handleDeleteSchedule = (id: string) => {
    deleteDoctorAvailability(id)
      .then(() => setRows((prev) => prev.filter((r) => r.id !== id)))
      .catch((err) => setError(err.message));
  };

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    if (!scheduleBranchId || !fromDate || !toDate) return;
    setGenerating(true);
    setGenerateResult(null);
    setError(null);
    generateSlots({ staff_id: doctor.id, branch_id: scheduleBranchId, from_date: fromDate, to_date: toDate })
      .then((res) => setGenerateResult(`تم توليد ${res.created} موعد متاح`))
      .catch((err) => setError(err.message))
      .finally(() => setGenerating(false));
  };

  const handleSetPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    setSettingPassword(true);
    setError(null);
    setPasswordSetMessage(null);
    setStaffPassword(doctor.id, newPassword)
      .then(() => {
        setPasswordSetMessage(`تم تعيين كلمة المرور — شاركها مع ${doctor.full_name} الآن، ما رح تظهر مرة ثانية.`);
        setNewPassword("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSettingPassword(false));
  };

  const handleDelete = () => {
    setDeleting(true);
    setError(null);
    deleteStaff(doctor.id)
      .then(() => {
        onDelete(doctor.id);
        onClose();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setDeleting(false));
  };

  return (
    <Modal title={`تعديل الملف — ${doctor.full_name}`} onClose={onClose} wide>
      {error && <p className="error">{error}</p>}

      <form className="form-section" onSubmit={saveBasic}>
        <label>البيانات الأساسية</label>
        <div className="data-form">
          <input
            placeholder="الاسم الكامل"
            value={basic.full_name}
            onChange={(e) => setBasic({ ...basic, full_name: e.target.value })}
          />
          <input placeholder="الهاتف" value={basic.phone} onChange={(e) => setBasic({ ...basic, phone: e.target.value })} />
          <select value={basic.role} onChange={(e) => setBasic({ ...basic, role: e.target.value as StaffRole })}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={doctor.is_active}
              onChange={(e) =>
                updateStaff(doctor.id, { is_active: e.target.checked })
                  .then(onUpdate)
                  .catch((err) => setError(err.message))
              }
            />
            فعّال
          </label>
          <button type="submit" disabled={savingBasic}>
            {savingBasic ? "..." : "حفظ"}
          </button>
        </div>
      </form>

      <div className="form-section">
        <label>الدخول إلى النظام</label>
        <p className="settings-hint">
          حساب جديد ينشأ بدون كلمة مرور ولا يقدر يسجل دخول قبل ما تعيّنلوا وحدة من هون. شاركها معه مباشرة
          (واتساب/حكي) — ما رح تقدر تشوفها مرة ثانية بعد التعيين.
        </p>
        {passwordSetMessage && <p className="success">{passwordSetMessage}</p>}
        <form className="data-form" onSubmit={handleSetPassword}>
          <input
            placeholder="كلمة مرور جديدة"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="button" onClick={() => setNewPassword(generatePassword())}>
            توليد كلمة مرور
          </button>
          <button type="submit" disabled={settingPassword || !newPassword}>
            {settingPassword ? "..." : "تعيين كلمة المرور"}
          </button>
        </form>
      </div>

      <div className="form-section">
        <label>الفروع</label>
        <div className="checkbox-group">
          {branches.map((b) => (
            <label key={b.id}>
              <input type="checkbox" checked={doctor.branch_ids.includes(b.id)} onChange={() => toggleBranch(b.id)} />
              {b.name}
            </label>
          ))}
        </div>
      </div>

      {doctor.role === "doctor" && (
        <>
          <div className="form-section">
            <label>التخصصات</label>
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
          </div>

          <div className="form-section">
            <label>الخدمات</label>
            <div className="checkbox-group">
              {services.map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={doctor.service_ids.includes(s.id)} onChange={() => toggleService(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label>الدوام والمواعيد المتاحة</label>
            {doctorBranches.length === 0 ? (
              <p className="error">اربط الطبيب/ة بفرع أولاً قبل تحديد الدوام.</p>
            ) : (
              <>
                {doctorBranches.length > 1 && (
                  <select value={scheduleBranchId} onChange={(e) => setScheduleBranchId(e.target.value)}>
                    {doctorBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}

                {loadingSchedule ? (
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
                            <button onClick={() => handleDeleteSchedule(r.id)}>حذف</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <form className="data-form" onSubmit={handleAddSchedule}>
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
                  <button type="submit">إضافة دوام</button>
                </form>

                <form className="data-form" onSubmit={handleGenerate}>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
                  <button type="submit" disabled={generating}>
                    {generating ? "..." : "توليد المواعيد المتاحة"}
                  </button>
                  {generateResult && <span>{generateResult}</span>}
                </form>

                <DoctorCoverPanel
                  doctor={doctor}
                  colleagues={allStaff.filter((s) => s.role === "doctor" && s.is_active)}
                  branches={doctorBranches}
                />
              </>
            )}
          </div>
        </>
      )}

      <div className="modal-danger-zone">
        {!confirmingDelete ? (
          <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
            حذف الموظف
          </button>
        ) : (
          <>
            <span>متأكد إنك بدك تحذف {doctor.full_name}؟ سجل المواعيد السابقة رح يضل محفوظ.</span>{" "}
            <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "..." : "تأكيد الحذف"}
            </button>{" "}
            <button onClick={() => setConfirmingDelete(false)}>تراجع</button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function StaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRole | "">("");

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

  const editingMember = staff.find((s) => s.id === editingId) ?? null;

  const activeCount = staff.filter((s) => s.is_active).length;
  const doctorCount = staff.filter((s) => s.role === "doctor").length;

  const q = search.trim().toLowerCase();
  const filteredStaff = staff.filter((s) => {
    if (roleFilter && s.role !== roleFilter) return false;
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">فريق العيادة</p>
          <p className="page-header-subtitle">إدارة حسابات الموظفين، أدوارهم، وربطهم بالفروع والخدمات.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + إضافة موظف
        </button>
      </div>

      {!loading && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{staff.length}</div>
            <div className="stat-card-label">إجمالي الموظفين</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{activeCount}</div>
            <div className="stat-card-label">فعّالين</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{staff.length - activeCount}</div>
            <div className="stat-card-label">متوقفين</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{doctorCount}</div>
            <div className="stat-card-label">أطباء</div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="table-toolbar">
          <div className="search-input">
            <input
              placeholder="بحث بالاسم أو الإيميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as StaffRole | "")}>
            <option value="">كل الأدوار</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
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
            {filteredStaff.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="avatar-row">
                    <span className="avatar" style={{ background: avatarColor(member.full_name) }}>
                      {initials(member.full_name)}
                    </span>
                    {member.full_name}
                  </div>
                </td>
                <td>{member.email}</td>
                <td>{roleLabel[member.role] ?? member.role}</td>
                <td>{specialtyNames(member.specialty_ids) || member.specialty}</td>
                <td>{serviceNames(member.service_ids)}</td>
                <td>{member.branch_ids.map(branchName).join(", ")}</td>
                <td>
                  <span className={member.is_active ? "badge active" : "badge inactive"}>
                    {member.is_active ? "فعّال" : "متوقف"}
                  </span>
                </td>
                <td>
                  <button onClick={() => setEditingId(member.id)}>تعديل</button>
                </td>
              </tr>
            ))}
            {filteredStaff.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  ما في موظفين مطابقين للبحث.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showAdd && (
        <AddStaffModal
          branches={branches}
          specialties={specialties}
          services={services}
          onClose={() => setShowAdd(false)}
          onCreated={(member) => setStaff((prev) => [...prev, member])}
        />
      )}

      {editingMember && (
        <EditStaffModal
          doctor={editingMember}
          branches={branches}
          specialties={specialties}
          services={services}
          allStaff={staff}
          onClose={() => setEditingId(null)}
          onUpdate={(updated) => setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
          onDelete={(id) => setStaff((prev) => prev.filter((s) => s.id !== id))}
        />
      )}
    </div>
  );
}
