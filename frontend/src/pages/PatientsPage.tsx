import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addPatientTag,
  createPatient,
  listPatientTags,
  listPatients,
  removePatientTag,
} from "../api/patients";
import type { Patient, PatientCreate, PatientDuplicate, PatientTagValue } from "../api/patients";

const emptyForm: PatientCreate = { full_name: "", phone: "", email: "", notes: "", date_of_birth: "" };

const tagLabels: Record<PatientTagValue, string> = {
  new: "مريض جديد",
  existing: "مريض حالي",
  vip: "VIP",
  corporate: "شركات",
  self_pay: "دفع ذاتي",
  chronic: "مرض مزمن",
  high_risk: "خطورة عالية",
  frequent_no_show: "متكرر عدم الحضور",
  blacklisted: "قائمة سوداء",
};
const allTags = Object.keys(tagLabels) as PatientTagValue[];

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function initial(name: string) {
  return name.trim()[0] ?? "";
}

function isMinor(dob: string | undefined): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age < 18;
}

type PatientsPageProps = {
  // Doctors have patient.view only -- no create or tag, so hide controls
  // that would just 403 for them.
  currentDoctor?: { id: string };
};

export function PatientsPage({ currentDoctor }: PatientsPageProps = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PatientDuplicate[] | null>(null);
  const [form, setForm] = useState<PatientCreate>(emptyForm);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [tagsByPatient, setTagsByPatient] = useState<Record<string, PatientTagValue[]>>({});
  const [addingTagFor, setAddingTagFor] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");

  const load = (phone?: string) => {
    setLoading(true);
    setError(null);
    listPatients(phone)
      .then((list) => {
        setPatients(list);
        list.forEach((p) => {
          listPatientTags(p.id)
            .then((tags) => setTagsByPatient((prev) => ({ ...prev, [p.id]: tags.map((t) => t.tag) })))
            .catch(() => {});
        });
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    load(phoneSearch.trim() || undefined);
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) return;
    if (isMinor(form.date_of_birth) && !guardianName.trim()) {
      setError("المريض قاصر — يجب إدخال اسم ولي الأمر");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: PatientCreate = { ...form, date_of_birth: form.date_of_birth || undefined };
    if (isMinor(form.date_of_birth)) {
      payload.guardian = { full_name: guardianName, phone: guardianPhone || undefined };
    }
    createPatient(payload)
      .then((result) => {
        setPatients((prev) => [...prev, result.patient]);
        setForm(emptyForm);
        setGuardianName("");
        setGuardianPhone("");
        setNotice(result.potential_duplicates.length > 0 ? result.potential_duplicates : null);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const handleAddTag = (patientId: string, tag: PatientTagValue) => {
    addPatientTag(patientId, tag)
      .then(() => {
        setTagsByPatient((prev) => ({ ...prev, [patientId]: [...(prev[patientId] ?? []), tag] }));
        setAddingTagFor(null);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleRemoveTag = (patientId: string, tag: PatientTagValue) => {
    removePatientTag(patientId, tag)
      .then(() => setTagsByPatient((prev) => ({ ...prev, [patientId]: (prev[patientId] ?? []).filter((t) => t !== tag) })))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const nq = nameFilter.trim().toLowerCase();
  const filteredPatients = nq
    ? patients.filter((p) => p.full_name.toLowerCase().includes(nq) || (p.phone ?? "").includes(nq))
    : patients;
  const taggedCount = patients.filter((p) => (tagsByPatient[p.id] ?? []).length > 0).length;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">سجلات المرضى</p>
          <p className="page-header-subtitle">كل مرضى العيادة، تصنيفاتهم، وسجل بياناتهم الأساسي.</p>
        </div>
      </div>

      {!loading && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{patients.length}</div>
            <div className="stat-card-label">إجمالي المرضى</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{taggedCount}</div>
            <div className="stat-card-label">لديهم تصنيف</div>
          </div>
        </div>
      )}

      {notice && (
        <div className="error">
          <strong>تنبيه: احتمال وجود سجلات مكررة</strong>
          <ul>
            {notice.map((d) => (
              <li key={d.id}>
                يشبه "{d.patient_b_name}" ({d.patient_b_phone}) بنسبة {d.match_score}% — راجع صفحة "السجلات المكررة"
              </li>
            ))}
          </ul>
          <button onClick={() => setNotice(null)}>إخفاء</button>
        </div>
      )}

      <form className="data-form" onSubmit={handleSearch}>
        <input
          placeholder="ابحث برقم الهاتف — يشمل مرضى الفروع الأخرى (لزيارة أول مرة مثلاً)"
          value={phoneSearch}
          onChange={(e) => setPhoneSearch(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <button type="submit">بحث</button>
        {phoneSearch && (
          <button
            type="button"
            onClick={() => {
              setPhoneSearch("");
              load();
            }}
          >
            مسح البحث
          </button>
        )}
      </form>

      {!currentDoctor && (
      <form className="data-form" onSubmit={handleCreate}>
        <input
          placeholder="الاسم الكامل"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <input
          placeholder="رقم الهاتف"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          required
        />
        <input
          type="date"
          placeholder="تاريخ الميلاد"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
        <input
          placeholder="الإيميل"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="ملاحظات"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <button type="submit" disabled={saving}>
          {saving ? "..." : "إضافة مريض"}
        </button>
      </form>
      )}

      {!currentDoctor && isMinor(form.date_of_birth) && (
        <div className="data-form settings-hint">
          <strong style={{ width: "100%" }}>المريض قاصر — بيانات ولي الأمر إلزامية (BR-011)</strong>
          <input placeholder="اسم ولي الأمر" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required />
          <input placeholder="رقم هاتف ولي الأمر" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
        </div>
      )}

      {!loading && patients.length > 0 && (
        <div className="table-toolbar">
          <div className="search-input">
            <input
              placeholder="فلترة سريعة بالاسم أو الهاتف (ضمن القائمة المحمّلة)..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
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
              <th>الهاتف</th>
              <th>الإيميل</th>
              <th>ملاحظات</th>
              <th>التصنيفات</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient) => (
              <tr key={patient.id}>
                <td>
                  <div className="avatar-row">
                    <span className="avatar" style={{ background: avatarColor(patient.full_name) }}>
                      {initial(patient.full_name)}
                    </span>
                    {patient.full_name}
                  </div>
                </td>
                <td>{patient.phone}</td>
                <td>{patient.email}</td>
                <td>{patient.notes}</td>
                <td>
                  {(tagsByPatient[patient.id] ?? []).map((tag) => (
                    <span key={tag} className="badge active" style={{ marginInlineEnd: 4 }}>
                      {tagLabels[tag]}
                      {!currentDoctor && (
                        <button onClick={() => handleRemoveTag(patient.id, tag)} style={{ marginInlineStart: 4 }}>
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {/* patient.tag isn't in the doctor role's grant -- read-only for them. */}
                  {!currentDoctor &&
                    (addingTagFor === patient.id ? (
                      <select autoFocus onChange={(e) => e.target.value && handleAddTag(patient.id, e.target.value as PatientTagValue)}>
                        <option value="">اختر تصنيفاً</option>
                        {allTags
                          .filter((t) => !(tagsByPatient[patient.id] ?? []).includes(t))
                          .map((t) => (
                            <option key={t} value={t}>
                              {tagLabels[t]}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <button onClick={() => setAddingTagFor(patient.id)}>+ تصنيف</button>
                    ))}
                </td>
              </tr>
            ))}
            {filteredPatients.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  ما في مرضى مطابقين للفلترة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
