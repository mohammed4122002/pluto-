import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { addToWaitlist, cancelWaitlistEntry, listWaitlist } from "../api/waitlist";
import type { WaitlistCreate, WaitlistEntry } from "../api/waitlist";

const statusLabel: Record<WaitlistEntry["status"], string> = {
  active: "بانتظار موعد",
  offered: "عُرض عليه موعد",
  booked: "تم الحجز",
  expired: "انتهت المهلة",
  cancelled: "ملغى",
};

const statusBadgeClass: Record<WaitlistEntry["status"], string> = {
  active: "warning",
  offered: "active",
  booked: "active",
  expired: "inactive",
  cancelled: "danger",
};

export function WaitlistPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WaitlistCreate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listPatients(), listServices(), listWaitlist()])
      .then(([branchList, patientList, serviceList, waitlistList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setServices(serviceList);
        setEntries(waitlistList);
        if (branchList.length > 0 && patientList.length > 0) {
          setForm((f) => f ?? { patient_id: patientList[0].id, branch_id: branchList[0].id });
        }
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    addToWaitlist(form)
      .then((entry) => setEntries((prev) => [...prev, entry]))
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const handleCancel = (id: string) => {
    cancelWaitlistEntry(id)
      .then((updated) => setEntries((prev) => prev.map((e) => (e.id === id ? updated : e))))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  if (!loading && (branches.length === 0 || patients.length === 0)) {
    return (
      <div className="page">
        <p>لازم يكون عندك فرع ومريض واحد على الأقل قبل إضافة أحد لقائمة الانتظار.</p>
      </div>
    );
  }

  const activeCount = entries.filter((e) => e.status === "active" || e.status === "offered").length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">قائمة الانتظار</p>
          <p className="page-header-subtitle">
            عند فتح موعد مناسب، النظام يرسل عرضاً تلقائياً لأول مريض مناسب بقائمة الانتظار عبر قناة التواصل الخاصة
            به، بمهلة محدودة — إذا لم يرد، ينتقل العرض تلقائياً للتالي.
          </p>
        </div>
      </div>

      {!loading && entries.length > 0 && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{entries.length}</div>
            <div className="stat-card-label">إجمالي القائمة</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{activeCount}</div>
            <div className="stat-card-label">بانتظار/معروض عليهم</div>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {form && (
        <form className="data-form" onSubmit={handleAdd}>
          <select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={form.service_id ?? ""}
            onChange={(e) => setForm({ ...form, service_id: e.target.value || undefined })}
          >
            <option value="">أي خدمة</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving}>
            {saving ? "..." : "إضافة لقائمة الانتظار"}
          </button>
        </form>
      )}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : entries.length === 0 ? (
        <p className="inbox-empty">لا يوجد أحد بقائمة الانتظار حالياً.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>الفرع</th>
              <th>الخدمة</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{nameOf(patients, entry.patient_id)}</td>
                <td>{nameOf(branches, entry.branch_id)}</td>
                <td>{entry.service_id ? nameOf(services, entry.service_id) : "أي خدمة"}</td>
                <td>
                  <span className={`badge ${statusBadgeClass[entry.status]}`}>{statusLabel[entry.status]}</span>
                </td>
                <td>
                  {(entry.status === "active" || entry.status === "offered") && (
                    <button onClick={() => handleCancel(entry.id)}>إلغاء</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
