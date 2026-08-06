import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { createPackage, listPackages, listPatientPackages, sellPackage, usePackageSession } from "../api/packages";
import type { Package, PatientPackage } from "../api/packages";

const statusLabel: Record<PatientPackage["status"], string> = {
  pending_payment: "بانتظار الدفع",
  active: "مفعّلة",
  cancelled: "ملغاة",
  expired: "منتهية",
};

export function PackagesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newPkg, setNewPkg] = useState({
    name: "",
    service_ids: [] as string[],
    sessions_count: 5,
    price: 0,
    validity_days: 365,
  });
  const [sellForm, setSellForm] = useState<{ patient_id: string; package_id: string; branch_id: string } | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listPatients(), listServices(), listPackages(), listPatientPackages()])
      .then(([branchList, patientList, serviceList, packageList, patientPackageList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setServices(serviceList);
        setPackages(packageList);
        setPatientPackages(patientPackageList);
        if (branchList.length > 0 && patientList.length > 0 && packageList.length > 0) {
          setSellForm((f) => f ?? { patient_id: patientList[0].id, package_id: packageList[0].id, branch_id: branchList[0].id });
        }
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const handleCreatePackage = (e: FormEvent) => {
    e.preventDefault();
    if (!newPkg.name.trim() || newPkg.price <= 0 || newPkg.sessions_count <= 0) return;
    createPackage(newPkg)
      .then((pkg) => {
        setPackages((prev) => [...prev, pkg]);
        setNewPkg({ name: "", service_ids: [], sessions_count: 5, price: 0, validity_days: 365 });
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const toggleNewPkgService = (serviceId: string) => {
    setNewPkg((p) => ({
      ...p,
      service_ids: p.service_ids.includes(serviceId)
        ? p.service_ids.filter((id) => id !== serviceId)
        : [...p.service_ids, serviceId],
    }));
  };

  const handleSell = (e: FormEvent) => {
    e.preventDefault();
    if (!sellForm) return;
    sellPackage(sellForm)
      .then(() => {
        setNotice("تم إنشاء الباقة للمريض — بانتظار تأكيد الدفع من صفحة المدفوعات.");
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleUseSession = (id: string) => {
    usePackageSession(id)
      .then((pp) => {
        setNotice(`تم تسجيل استخدام جلسة — الجلسات المتبقية: ${pp.sessions_remaining}`);
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="settings-hint">
          {notice} <button onClick={() => setNotice(null)}>إخفاء</button>
        </p>
      )}

      <h2>تعريف باقة جديدة</h2>
      <form className="data-form" onSubmit={handleCreatePackage}>
        <input placeholder="اسم الباقة" value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} required />
        <input
          type="number"
          placeholder="عدد الجلسات"
          value={newPkg.sessions_count}
          onChange={(e) => setNewPkg({ ...newPkg, sessions_count: Number(e.target.value) })}
        />
        <input
          type="number"
          placeholder="السعر"
          value={newPkg.price}
          onChange={(e) => setNewPkg({ ...newPkg, price: Number(e.target.value) })}
        />
        <input
          type="number"
          placeholder="مدة الصلاحية (يوم)"
          value={newPkg.validity_days}
          onChange={(e) => setNewPkg({ ...newPkg, validity_days: Number(e.target.value) })}
        />
        <button type="submit">إنشاء باقة</button>
      </form>

      {services.length > 0 && (
        <div className="checkbox-group">
          <span className="settings-hint">الخدمات المشمولة (اتركيها فاضية لتشمل أي خدمة):</span>
          {services.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={newPkg.service_ids.includes(s.id)}
                onChange={() => toggleNewPkgService(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}

      {sellForm && (
        <>
          <h2>بيع باقة لمريض</h2>
          <form className="data-form" onSubmit={handleSell}>
            <select value={sellForm.patient_id} onChange={(e) => setSellForm({ ...sellForm, patient_id: e.target.value })}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <select value={sellForm.package_id} onChange={(e) => setSellForm({ ...sellForm, package_id: e.target.value })}>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — {pkg.price} ({pkg.sessions_count} جلسات)
                </option>
              ))}
            </select>
            <select value={sellForm.branch_id} onChange={(e) => setSellForm({ ...sellForm, branch_id: e.target.value })}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button type="submit">بيع الباقة</button>
          </form>
        </>
      )}

      <h2>باقات المرضى</h2>
      {loading ? (
        <p>جاري التحميل...</p>
      ) : patientPackages.length === 0 ? (
        <p className="inbox-empty">لا توجد باقات مباعة بعد.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>الباقة</th>
              <th>الجلسات المتبقية</th>
              <th>الحالة</th>
              <th>تنتهي في</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patientPackages.map((pp) => (
              <tr key={pp.id}>
                <td>{nameOf(patients, pp.patient_id)}</td>
                <td>{nameOf(packages, pp.package_id)}</td>
                <td>{pp.sessions_remaining}</td>
                <td>
                  <span className="badge active">{statusLabel[pp.status]}</span>
                </td>
                <td>{new Date(pp.expires_at).toLocaleDateString("ar-JO")}</td>
                <td>
                  {pp.status === "active" && pp.sessions_remaining > 0 && (
                    <button onClick={() => handleUseSession(pp.id)}>تسجيل استخدام جلسة</button>
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
