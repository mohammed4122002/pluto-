import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { bulkBookAppointments, listVisitTypes } from "../api/appointments";
import type { BulkBookingItem, BulkBookingLinkMode, BulkBookingResult, VisitType } from "../api/appointments";
import { PatientPicker } from "../components/PatientPicker";

// FR-BKT-009/010/011/012/013/014: group sessions, family bookings, several
// services in one visit, plain sequential appointments, recurring visits, and
// screening campaigns all reduce to the same action -- several bookings
// created together, laid out one of three ways. One screen instead of six.
const modeLabels: Record<BulkBookingLinkMode, string> = {
  sequential: "متتابع (كل مريض بعد الي قبله — عائلة أو عدة خدمات لنفس الزيارة)",
  same_time: "نفس الوقت (جلسة جماعية)",
  recurring_weekly: "متكرر أسبوعياً",
  recurring_biweekly: "متكرر كل أسبوعين",
  recurring_monthly: "متكرر شهرياً",
};

const emptyItem: BulkBookingItem = { patient_id: "" };

export function LinkedBookingPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [branchId, setBranchId] = useState("");
  const [linkMode, setLinkMode] = useState<BulkBookingLinkMode>("sequential");
  const [startAt, setStartAt] = useState("");
  const [occurrences, setOccurrences] = useState(4);
  const [visitTypeId, setVisitTypeId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [items, setItems] = useState<BulkBookingItem[]>([{ ...emptyItem }]);
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BulkBookingResult | null>(null);

  useEffect(() => {
    Promise.all([listBranches(), listServices(), listStaffDirectory(), listVisitTypes()])
      .then(([branchList, serviceList, staffList, visitTypeList]) => {
        setBranches(branchList);
        setServices(serviceList);
        setStaff(staffList.filter((s) => s.role === "doctor"));
        setVisitTypes(visitTypeList);
        if (branchList.length > 0) setBranchId(branchList[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const isRecurring = linkMode.startsWith("recurring");
  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id?: string) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const updateItem = (i: number, patch: Partial<BulkBookingItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!branchId || !startAt || items.some((it) => !it.patient_id)) return;
    setSaving(true);
    setError(null);
    setResult(null);
    bulkBookAppointments({
      branch_id: branchId,
      link_mode: linkMode,
      start_at: startAt,
      items: isRecurring ? [items[0]] : items,
      occurrences: isRecurring ? occurrences : undefined,
      visit_type_id: visitTypeId || undefined,
      campaign_name: campaignName || undefined,
    })
      .then(setResult)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">حجز مرتبط</p>
          <p className="page-header-subtitle">
            حجز جلسة جماعية، عائلة بمواعيد متتابعة، عدة خدمات بنفس الزيارة، أو مواعيد متكررة — كلها بخطوة وحدة.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <form className="data-form" onSubmit={submit} style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 720 }}>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select value={linkMode} onChange={(e) => setLinkMode(e.target.value as BulkBookingLinkMode)}>
            {Object.entries(modeLabels).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>

          <label>
            {isRecurring ? "أول موعد" : "وقت البداية"}
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </label>

          {isRecurring && (
            <label>
              عدد المرات
              <input
                type="number"
                min={2}
                max={52}
                value={occurrences}
                onChange={(e) => setOccurrences(Number(e.target.value))}
              />
            </label>
          )}

          <select value={visitTypeId} onChange={(e) => setVisitTypeId(e.target.value)}>
            <option value="">حضوري (افتراضي)</option>
            {visitTypes
              .filter((v) => v.code !== "in_person")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name_ar}
                </option>
              ))}
          </select>

          <input
            placeholder="اسم الحملة (اختياري — لحجوزات الفحص الجماعي)"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />

          <div className="checkbox-group" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <PatientPicker
                  value={item.patient_id}
                  onChange={(id, patient) => {
                    updateItem(i, { patient_id: id });
                    if (patient) setPatientNames((prev) => ({ ...prev, [id]: patient.full_name }));
                  }}
                />
                <select value={item.service_id ?? ""} onChange={(e) => updateItem(i, { service_id: e.target.value || undefined })}>
                  <option value="">بدون خدمة محددة</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select value={item.staff_id ?? ""} onChange={(e) => updateItem(i, { staff_id: e.target.value || undefined })}>
                  <option value="">بدون طبيب محدد</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                {!isRecurring && items.length > 1 && (
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                    حذف
                  </button>
                )}
              </div>
            ))}
            {!isRecurring && (
              <button type="button" onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}>
                + إضافة مريض
              </button>
            )}
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "..." : "تنفيذ الحجز"}
          </button>
        </form>
      )}

      {result && (
        <table className="data-table" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>المريض</th>
              <th>الخدمة</th>
              <th>الطبيب</th>
              <th>النتيجة</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((r, i) => (
              <tr key={i}>
                <td>{r.appointment ? patientNames[r.appointment.patient_id] ?? r.appointment.patient_id : "—"}</td>
                <td>{r.appointment?.service_id ? nameOf(services, r.appointment.service_id) : "—"}</td>
                <td>{r.appointment?.staff_id ? nameOf(staff, r.appointment.staff_id) : "—"}</td>
                <td>
                  {r.ok ? (
                    <span className="badge active">تم — {r.appointment?.appointment_number}</span>
                  ) : (
                    <span className="badge danger">فشل: {r.error}</span>
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
