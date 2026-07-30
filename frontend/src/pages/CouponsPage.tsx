import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createCoupon, deactivateCoupon, listCoupons } from "../api/coupons";
import type { Coupon } from "../api/coupons";

const emptyForm = { code: "", discount_type: "fixed" as Coupon["discount_type"], discount_value: 0, max_uses: "" };

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    setError(null);
    listCoupons()
      .then(setCoupons)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || form.discount_value <= 0) return;
    createCoupon({
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      max_uses: form.max_uses ? Number(form.max_uses) : undefined,
    })
      .then((coupon) => {
        setCoupons((prev) => [...prev, coupon]);
        setForm(emptyForm);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleDeactivate = (id: string) => {
    deactivateCoupon(id)
      .then((updated) => setCoupons((prev) => prev.map((c) => (c.id === id ? updated : c))))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <form className="data-form" onSubmit={handleCreate}>
        <input
          placeholder="كود الكوبون"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
        <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as Coupon["discount_type"] })}>
          <option value="fixed">مبلغ ثابت</option>
          <option value="percentage">نسبة مئوية</option>
        </select>
        <input
          type="number"
          placeholder={form.discount_type === "fixed" ? "قيمة الخصم" : "نسبة الخصم %"}
          value={form.discount_value}
          onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
        />
        <input
          type="number"
          placeholder="أقصى عدد استخدام (اختياري)"
          value={form.max_uses}
          onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
        />
        <button type="submit">إنشاء كوبون</button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : coupons.length === 0 ? (
        <p className="inbox-empty">لا يوجد كوبونات بعد.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>نوع الخصم</th>
              <th>القيمة</th>
              <th>الاستخدام</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.discount_type === "fixed" ? "مبلغ ثابت" : "نسبة مئوية"}</td>
                <td>{c.discount_value}{c.discount_type === "percentage" ? "%" : ""}</td>
                <td>
                  {c.used_count} / {c.max_uses ?? "∞"}
                </td>
                <td>
                  <span className={c.is_active ? "badge active" : "badge inactive"}>{c.is_active ? "مفعّل" : "غير مفعّل"}</span>
                </td>
                <td>{c.is_active && <button onClick={() => handleDeactivate(c.id)}>إيقاف</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
