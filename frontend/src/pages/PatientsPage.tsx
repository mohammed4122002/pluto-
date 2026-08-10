import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addPatientTag,
  createPatient,
  listPatientPage,
  removePatientTag,
} from "../api/patients";
import type { Patient, PatientCreate, PatientDuplicate, PatientTagValue } from "../api/patients";
import { errorMessage } from "../api/errors";

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

const PAGE_SIZE = 50;

export function PatientsPage() {
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // One page, tags included. This used to fetch every patient the caller could
  // see and then issue a separate request per row for that row's tags -- 74
  // requests today, one per patient at any size.
  const load = (phone?: string) => {
    setLoading(true);
    setError(null);
    const request = phone
      ? listPatientPage({ search: undefined, limit: PAGE_SIZE, offset: 0 }).then((page) => ({
          ...page,
          items: page.items.filter((p) => p.phone === phone),
        }))
      : listPatientPage({ search: search.trim() || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    request
      .then((result) => {
        setPatients(result.items);
        setTotal(result.total);
        setTagsByPatient(Object.fromEntries(result.items.map((p) => [p.id, p.tags])));
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  // Searching resets to the first page; paging keeps the term. Debounced so a
  // name typed letter by letter is one query, not eight.
  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

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

  const filteredPatients = patients;
  const taggedCount = patients.filter((p) => (tagsByPatient[p.id] ?? []).length > 0).length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            <div className="stat-card-value">{total}</div>
            <div className="stat-card-label">إجمالي المرضى</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{taggedCount}</div>
            <div className="stat-card-label">لديهم تصنيف (بهاي الصفحة)</div>
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
        <p className="data-form-title">بحث بالهاتف عبر كل الفروع</p>
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

    <form className="data-form" onSubmit={handleCreate}>
      <p className="data-form-title">مريض جديد</p>
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

      {isMinor(form.date_of_birth) && (
        <div className="data-form settings-hint">
          <strong style={{ width: "100%" }}>المريض قاصر — بيانات ولي الأمر إلزامية (BR-011)</strong>
          <input placeholder="اسم ولي الأمر" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required />
          <input placeholder="رقم هاتف ولي الأمر" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
        </div>
      )}

      <div className="table-toolbar">
        <div className="search-input">
          <input
            placeholder="ابحث بالاسم أو الهاتف — بكل السجلات، مش بالصفحة الحالية..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

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
                      <button onClick={() => handleRemoveTag(patient.id, tag)} style={{ marginInlineStart: 4 }}>
                        ×
                      </button>
                    </span>
                  ))}
                  {/* patient.tag isn't in the doctor role's grant -- read-only for them. */}
                  {(addingTagFor === patient.id ? (
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
                  {search ? "ما في مرضى مطابقين للبحث." : "ما في مرضى بعد."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="pager">
          <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
            السابق
          </button>
          <span className="pager-status">
            صفحة {page + 1} من {pageCount} · {total} مريض
          </span>
          <button
            className="btn-secondary"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((n) => n + 1)}
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
