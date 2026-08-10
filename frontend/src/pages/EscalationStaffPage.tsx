import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listStaff } from "../api/staff";
import type { Staff } from "../api/staff";
import { addEscalationStaff, listEscalationStaff, removeEscalationStaff } from "../api/escalationStaff";
import type { EscalationCategory, EscalationStaffMember } from "../api/escalationStaff";

export function EscalationStaffPage() {
  const [pool, setPool] = useState<EscalationStaffMember[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffId, setStaffId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [handles, setHandles] = useState<"" | EscalationCategory>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listEscalationStaff(), listStaff(), listBranches()])
      .then(([poolList, staffList, branchList]) => {
        setPool(poolList);
        setStaff(staffList);
        setBranches(branchList);
        if (staffList.length > 0) setStaffId((cur) => cur || staffList[0].id);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? "—" : "كل الفروع");

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!staffId) return;
    addEscalationStaff(staffId, branchId || undefined, handles || undefined)
      .then((member) => setPool((prev) => [...prev, member]))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleRemove = (id: string) => {
    removeEscalationStaff(id)
      .then(() => setPool((prev) => prev.filter((p) => p.id !== id)))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const staffLinked = (id: string) => staff.find((s) => s.id === id)?.telegram_linked ?? false;

  /** Mirrors the backend's fallback (escalation.py::_handles) so the table
   * shows what will actually happen rather than a blank for the common
   * unconfigured case. */
  const handlesLabel = (p: EscalationStaffMember) => {
    if (p.handles) return p.handles === "medical" ? "الحالات الطبية" : "الأمور الإدارية";
    const role = staff.find((s) => s.id === p.staff_id)?.role;
    return role === "doctor" ? "الحالات الطبية (حسب الوظيفة)" : "الأمور الإدارية (حسب الوظيفة)";
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">فريق التصعيد</p>
          <p className="page-header-subtitle">
            لما تتصعّد محادثة (البوت حوّلها لموظف)، بتنحوّل تلقائياً لأقل موظف مناسب عنده محادثات مفتوحة
            حالياً. المساعد بيحدد نوع التصعيد: السؤال الطبي بيروح لطبيب، وأي شي إداري (دفعات، فواتير،
            مواعيد، شكاوى) بيروح للاستقبال. بشكل افتراضي بينحدد من وظيفة الموظف، وبتقدري تغيّريه من عمود
            "بيستقبل". لازم الموظف يربط حساب تيليجرام تبعه (من صفحة "حسابي") حتى يوصله تنبيه فعلي.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <form className="data-form" onSubmit={handleAdd}>
        <p className="data-form-title">إضافة موظف لفريق التصعيد</p>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} {s.telegram_linked ? "✓ مربوط" : "— غير مربوط"}
            </option>
          ))}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">كل الفروع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={handles} onChange={(e) => setHandles(e.target.value as "" | EscalationCategory)}>
          <option value="">حسب الوظيفة (افتراضي)</option>
          <option value="medical">الحالات الطبية</option>
          <option value="administrative">الأمور الإدارية</option>
        </select>
        <button type="submit">إضافة للفريق</button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : pool.length === 0 ? (
        <p className="section-empty">ما في موظفين بفريق التصعيد بعد — التحويل التلقائي ما رح يشتغل لحد ما تضيفي واحد على الأقل.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الفرع</th>
              <th>بيستقبل</th>
              <th>ربط تيليجرام</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pool.map((p) => (
              <tr key={p.id}>
                <td>{p.staff_name}</td>
                <td>{branchName(p.branch_id)}</td>
                <td>{handlesLabel(p)}</td>
                <td>
                  <span className={staffLinked(p.staff_id) ? "badge active" : "badge inactive"}>
                    {staffLinked(p.staff_id) ? "مربوط" : "غير مربوط بعد"}
                  </span>
                </td>
                <td>
                  <button onClick={() => handleRemove(p.id)}>إزالة</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
