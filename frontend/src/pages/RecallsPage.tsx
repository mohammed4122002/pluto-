import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { createRecall, listRecalls } from "../api/recalls";
import type { Recall, RecallCreate, RecallReasonType } from "../api/recalls";
import { PatientPicker } from "../components/PatientPicker";
import { recallReasonLabel, recallStatusBadgeClass, recallStatusLabel } from "../statusLabels";

const reasonTypes: RecallReasonType[] = [
  "periodic_checkup",
  "medical_result",
  "treatment_plan",
  "vaccination",
  "specific_date",
  "after_days",
];

/** Follow-up invitations (recalls).
 *
 * The backend and a daily scheduled job have existed all along -- invitations
 * were being sent and escalated every day with no screen anywhere showing it,
 * so the work was invisible to the staff meant to act on it. This is that
 * screen. */
export function RecallsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [patientId, setPatientId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reasonType, setReasonType] = useState<RecallReasonType>("periodic_checkup");
  const [reasonNotes, setReasonNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      listBranches(),
      listServices(),
      listRecalls(statusFilter ? { status: statusFilter } : {}),
    ])
      .then(([b, s, r]) => {
        setBranches(b);
        setServices(s);
        setRecalls(r);
        setBranchId((current) => current || b[0]?.id || "");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!patientId || !branchId || !dueDate) return;
    setSaving(true);
    setError(null);
    const payload: RecallCreate = {
      patient_id: patientId,
      branch_id: branchId,
      doctor_id: null,
      service_id: serviceId || null,
      due_date: dueDate,
      reason_type: reasonType,
      reason_notes: reasonNotes || null,
    };
    createRecall(payload)
      .then((created) => {
        setRecalls((prev) => [created, ...prev]);
        setPatientId("");
        setServiceId("");
        setDueDate("");
        setReasonNotes("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const serviceName = (id: string | null) =>
    id ? services.find((s) => s.id === id)?.name ?? id : "—";

  const overdue = (r: Recall) =>
    r.status === "escalated" || (r.status === "invited" && r.due_date < new Date().toISOString().slice(0, 10));

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">دعوات المراجعة</p>
          <p className="page-header-subtitle">
            متابعات مجدولة للمرضى — فحص دوري، نتيجة فحص، مطعوم. النظام بيرسل الدعوة تلقائياً
            بموعد استحقاقها، وبيصعّد اللي ما بيردّوا للاتصال الهاتفي.
          </p>
        </div>
      </div>

      <form className="data-form" onSubmit={add}>
        <p className="data-form-title">دعوة مراجعة جديدة</p>
        <PatientPicker value={patientId} onChange={setPatientId} />
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">بدون خدمة محددة</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={reasonType} onChange={(e) => setReasonType(e.target.value as RecallReasonType)}>
          {reasonTypes.map((t) => (
            <option key={t} value={t}>
              {recallReasonLabel[t]}
            </option>
          ))}
        </select>
        <label>
          تاريخ الاستحقاق
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>
        <input
          placeholder="ملاحظات (اختياري)"
          value={reasonNotes}
          onChange={(e) => setReasonNotes(e.target.value)}
        />
        <button type="submit" disabled={saving || !patientId}>
          {saving ? "..." : "إضافة دعوة"}
        </button>
      </form>

      <div className="data-form">
        <label>
          تصفية حسب الحالة
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">الكل</option>
            <option value="pending">بانتظار موعد الدعوة</option>
            <option value="invited">تم إرسال الدعوة</option>
            <option value="responded">المريض رد</option>
            <option value="booked">حجز موعد</option>
            <option value="escalated">محوّل للاتصال</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : recalls.length === 0 ? (
        <p>ما في دعوات مراجعة مطابقة.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>تاريخ الاستحقاق</th>
              <th>الفرع</th>
              <th>الخدمة</th>
              <th>السبب</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {recalls.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.due_date}
                  {overdue(r) && " ⚠️"}
                </td>
                <td>{branchName(r.branch_id)}</td>
                <td>{serviceName(r.service_id)}</td>
                <td>{recallReasonLabel[r.reason_type]}</td>
                <td>
                  <span className={`badge ${recallStatusBadgeClass[r.status]}`}>
                    {recallStatusLabel[r.status]}
                  </span>
                </td>
                <td>{r.reason_notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
