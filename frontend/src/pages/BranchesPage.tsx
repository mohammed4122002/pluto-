import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createBranch, listBranches, updateBranch } from "../api/branches";
import type { Branch, BranchCreate } from "../api/branches";

const emptyForm: BranchCreate = {
  name: "",
  address: "",
  phone: "",
  timezone: "Asia/Amman",
  working_hours_note: "",
};

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<BranchCreate>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BranchCreate>(emptyForm);

  const load = () => {
    setLoading(true);
    setError(null);
    listBranches()
      .then(setBranches)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    createBranch(form)
      .then((branch) => {
        setBranches((prev) => [...prev, branch].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(emptyForm);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const startEdit = (branch: Branch) => {
    setEditingId(branch.id);
    setEditForm({
      name: branch.name,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      timezone: branch.timezone,
      working_hours_note: branch.working_hours_note ?? "",
    });
  };

  const saveEdit = (id: string) => {
    updateBranch(id, editForm)
      .then((updated) => {
        setBranches((prev) => prev.map((b) => (b.id === id ? updated : b)));
        setEditingId(null);
      })
      .catch((err) => setError(err.message));
  };

  const toggleActive = (branch: Branch) => {
    updateBranch(branch.id, { is_active: !branch.is_active })
      .then((updated) => {
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
      })
      .catch((err) => setError(err.message));
  };

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">الفروع</p>
          <p className="page-header-subtitle">فروع العيادة، عناوينها، ومواعيد دوامها.</p>
        </div>
      </div>

      <form className="data-form" onSubmit={handleCreate}>
        <input
          placeholder="اسم الفرع"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="العنوان"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input
          placeholder="الهاتف"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          placeholder="Timezone"
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        />
        <input
          placeholder="مواعيد الدوام (مثلاً: الأحد-الخميس 9ص-5م)"
          value={form.working_hours_note}
          onChange={(e) => setForm({ ...form, working_hours_note: e.target.value })}
        />
        <button type="submit" disabled={saving}>
          {saving ? "..." : "إضافة فرع"}
        </button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>العنوان</th>
              <th>الهاتف</th>
              <th>Timezone</th>
              <th>مواعيد الدوام</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) =>
              editingId === branch.id ? (
                <tr key={branch.id}>
                  <td>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.timezone}
                      onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.working_hours_note}
                      onChange={(e) => setEditForm({ ...editForm, working_hours_note: e.target.value })}
                    />
                  </td>
                  <td>{branch.is_active ? "فعّال" : "متوقف"}</td>
                  <td>
                    <button onClick={() => saveEdit(branch.id)}>حفظ</button>
                    <button onClick={() => setEditingId(null)}>إلغاء</button>
                  </td>
                </tr>
              ) : (
                <tr key={branch.id}>
                  <td>{branch.name}</td>
                  <td>{branch.address}</td>
                  <td>{branch.phone}</td>
                  <td>{branch.timezone}</td>
                  <td>{branch.working_hours_note}</td>
                  <td>
                    <span className={branch.is_active ? "badge active" : "badge inactive"}>
                      {branch.is_active ? "فعّال" : "متوقف"}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => startEdit(branch)}>تعديل</button>
                    <button onClick={() => toggleActive(branch)}>
                      {branch.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
