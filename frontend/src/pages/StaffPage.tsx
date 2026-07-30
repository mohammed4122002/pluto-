import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { createStaff, listStaff, updateStaff } from "../api/staff";
import type { Staff, StaffCreate, StaffRole } from "../api/staff";

const roles: StaffRole[] = ["admin", "doctor", "receptionist"];

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
              <tr key={member.id}>
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
                  <button onClick={() => toggleActive(member)}>
                    {member.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
