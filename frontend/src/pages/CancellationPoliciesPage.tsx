import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { listStaff } from "../api/staff";
import type { Staff } from "../api/staff";
import {
  createCancellationPolicy,
  listCancellationPolicies,
  updateCancellationPolicy,
} from "../api/cancellationPolicies";
import type { CancellationPolicy, FeeType } from "../api/cancellationPolicies";

const feeTypeLabels: Record<FeeType, string> = {
  none: "بدون رسوم",
  fixed: "مبلغ ثابت",
  percentage: "نسبة مئوية",
};

const emptyForm = {
  branch_id: "",
  service_id: "",
  doctor_id: "",
  hours_before_threshold: 24,
  cancellation_fee_type: "none" as FeeType,
  cancellation_fee_value: 0,
  no_show_fee_type: "none" as FeeType,
  no_show_fee_value: 0,
};

export function CancellationPoliciesPage() {
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listCancellationPolicies(), listBranches(), listServices(), listStaff()])
      .then(([policyList, branchList, serviceList, staffList]) => {
        setPolicies(policyList);
        setBranches(branchList);
        setServices(serviceList);
        setDoctors(staffList.filter((s) => s.role === "doctor"));
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    id ? list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—" : "كل الحالات";

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    createCancellationPolicy({
      branch_id: form.branch_id || undefined,
      service_id: form.service_id || undefined,
      doctor_id: form.doctor_id || undefined,
      hours_before_threshold: form.hours_before_threshold,
      cancellation_fee_type: form.cancellation_fee_type,
      cancellation_fee_value: form.cancellation_fee_type === "none" ? 0 : form.cancellation_fee_value,
      no_show_fee_type: form.no_show_fee_type,
      no_show_fee_value: form.no_show_fee_type === "none" ? 0 : form.no_show_fee_value,
    })
      .then((policy) => {
        setPolicies((prev) => [...prev, policy]);
        setForm(emptyForm);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleToggleActive = (policy: CancellationPolicy) => {
    updateCancellationPolicy(policy.id, { is_active: !policy.is_active })
      .then((updated) => setPolicies((prev) => prev.map((p) => (p.id === policy.id ? updated : p))))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <p className="settings-hint">
        رسوم الإلغاء المتأخر وعدم الحضور اختيارية بالكامل — اتركي نوع الرسوم "بدون رسوم" إذا ما بدك أي
        رسوم إطلاقاً. أكثر سياسة تحديداً (طبيب أو خدمة أو فرع) هي اللي بتنطبق، وإذا ما في أي سياسة، ما
        في رسوم افتراضياً.
      </p>
      {error && <p className="error">{error}</p>}

      <form className="data-form" onSubmit={handleCreate}>
        <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
          <option value="">كل الفروع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
          <option value="">كل الخدمات</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
          <option value="">كل الأطباء</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <label>
          مهلة الإلغاء بدون رسوم (ساعة)
          <input
            type="number"
            value={form.hours_before_threshold}
            onChange={(e) => setForm({ ...form, hours_before_threshold: Number(e.target.value) })}
          />
        </label>
        <label>
          رسوم الإلغاء المتأخر
          <select
            value={form.cancellation_fee_type}
            onChange={(e) => setForm({ ...form, cancellation_fee_type: e.target.value as FeeType })}
          >
            {(Object.keys(feeTypeLabels) as FeeType[]).map((t) => (
              <option key={t} value={t}>
                {feeTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        {form.cancellation_fee_type !== "none" && (
          <input
            type="number"
            placeholder={form.cancellation_fee_type === "fixed" ? "قيمة الرسوم" : "نسبة الرسوم %"}
            value={form.cancellation_fee_value}
            onChange={(e) => setForm({ ...form, cancellation_fee_value: Number(e.target.value) })}
          />
        )}
        <label>
          رسوم عدم الحضور
          <select
            value={form.no_show_fee_type}
            onChange={(e) => setForm({ ...form, no_show_fee_type: e.target.value as FeeType })}
          >
            {(Object.keys(feeTypeLabels) as FeeType[]).map((t) => (
              <option key={t} value={t}>
                {feeTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        {form.no_show_fee_type !== "none" && (
          <input
            type="number"
            placeholder={form.no_show_fee_type === "fixed" ? "قيمة الرسوم" : "نسبة الرسوم %"}
            value={form.no_show_fee_value}
            onChange={(e) => setForm({ ...form, no_show_fee_value: Number(e.target.value) })}
          />
        )}
        <button type="submit">إضافة سياسة</button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : policies.length === 0 ? (
        <p className="inbox-empty">لا يوجد سياسات إلغاء بعد — بدون سياسة، الإلغاء وعدم الحضور بدون رسوم دائماً.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>الخدمة</th>
              <th>الطبيب</th>
              <th>المهلة (ساعة)</th>
              <th>رسوم الإلغاء</th>
              <th>رسوم عدم الحضور</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td>{nameOf(branches, p.branch_id)}</td>
                <td>{nameOf(services, p.service_id)}</td>
                <td>{nameOf(doctors, p.doctor_id)}</td>
                <td>{p.hours_before_threshold}</td>
                <td>
                  {feeTypeLabels[p.cancellation_fee_type]}
                  {p.cancellation_fee_type !== "none" &&
                    ` (${p.cancellation_fee_value}${p.cancellation_fee_type === "percentage" ? "%" : ""})`}
                </td>
                <td>
                  {feeTypeLabels[p.no_show_fee_type]}
                  {p.no_show_fee_type !== "none" &&
                    ` (${p.no_show_fee_value}${p.no_show_fee_type === "percentage" ? "%" : ""})`}
                </td>
                <td>
                  <span className={p.is_active ? "badge active" : "badge inactive"}>{p.is_active ? "مفعّلة" : "متوقفة"}</span>
                </td>
                <td>
                  <button onClick={() => handleToggleActive(p)}>{p.is_active ? "إيقاف" : "تفعيل"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
