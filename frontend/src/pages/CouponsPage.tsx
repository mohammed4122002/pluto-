import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { createCoupon, deactivateCoupon, listCoupons } from "../api/coupons";
import type { Coupon, CouponCustomerScope, CouponDiscountType } from "../api/coupons";

const discountTypeLabels: Record<CouponDiscountType, string> = {
  fixed: "مبلغ ثابت",
  percentage: "نسبة مئوية",
  free_session: "جلسة مجانية",
  free_consultation: "كشف مجاني",
  service_upgrade: "ترقية خدمة",
};

const scopeLabels: Record<CouponCustomerScope, string> = {
  all: "الجميع",
  new: "عملاء جدد فقط",
  existing: "عملاء حاليين فقط",
};

const needsValue = (t: CouponDiscountType) => t === "fixed" || t === "percentage";

const emptyForm = {
  code: "",
  discount_type: "fixed" as CouponDiscountType,
  discount_value: 0,
  max_uses: "",
  branch_id: "",
  service_id: "",
  customer_scope: "all" as CouponCustomerScope,
  per_customer_limit: "",
};

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listCoupons(), listBranches(), listServices()])
      .then(([couponList, branchList, serviceList]) => {
        setCoupons(couponList);
        setBranches(branchList);
        setServices(serviceList);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    id ? list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—" : "كل الفروع/الخدمات";

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) return;
    if (needsValue(form.discount_type) && form.discount_value <= 0) return;
    createCoupon({
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: needsValue(form.discount_type) ? form.discount_value : undefined,
      max_uses: form.max_uses ? Number(form.max_uses) : undefined,
      branch_id: form.branch_id || undefined,
      service_id: form.service_id || undefined,
      customer_scope: form.customer_scope,
      per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : undefined,
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
        <select
          value={form.discount_type}
          onChange={(e) => setForm({ ...form, discount_type: e.target.value as CouponDiscountType })}
        >
          {(Object.keys(discountTypeLabels) as CouponDiscountType[]).map((t) => (
            <option key={t} value={t}>
              {discountTypeLabels[t]}
            </option>
          ))}
        </select>
        {needsValue(form.discount_type) && (
          <input
            type="number"
            placeholder={form.discount_type === "fixed" ? "قيمة الخصم" : "نسبة الخصم % (حتى 100)"}
            value={form.discount_value}
            max={form.discount_type === "percentage" ? 100 : undefined}
            onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
          />
        )}
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
        <select
          value={form.customer_scope}
          onChange={(e) => setForm({ ...form, customer_scope: e.target.value as CouponCustomerScope })}
        >
          {(Object.keys(scopeLabels) as CouponCustomerScope[]).map((s) => (
            <option key={s} value={s}>
              {scopeLabels[s]}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="أقصى استخدام لكل عميل (اختياري)"
          value={form.per_customer_limit}
          onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })}
        />
        <input
          type="number"
          placeholder="أقصى عدد استخدام إجمالي (اختياري)"
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
              <th>الفرع</th>
              <th>الخدمة</th>
              <th>الفئة</th>
              <th>الاستخدام</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{discountTypeLabels[c.discount_type]}</td>
                <td>{c.discount_value != null ? `${c.discount_value}${c.discount_type === "percentage" ? "%" : ""}` : "—"}</td>
                <td>{nameOf(branches, c.branch_id)}</td>
                <td>{nameOf(services, c.service_id)}</td>
                <td>{scopeLabels[c.customer_scope]}</td>
                <td>
                  {c.used_count} / {c.max_uses ?? "∞"}
                  {c.per_customer_limit ? ` (حد ${c.per_customer_limit}/عميل)` : ""}
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
