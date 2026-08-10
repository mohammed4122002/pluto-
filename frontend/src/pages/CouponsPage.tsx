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
  service_ids: [] as string[],
  customer_scope: "all" as CouponCustomerScope,
  per_customer_limit: "",
};

/** What a coupon actually covers, in words: every service, one, or a named
 *  group. service_id is folded in for coupons predating service groups. */
function serviceScopeNames(coupon: Coupon, services: Service[]): string[] {
  const ids = new Set(coupon.service_ids ?? []);
  if (coupon.service_id) ids.add(coupon.service_id);
  return [...ids].map((id) => services.find((s) => s.id === id)?.name ?? "—");
}

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

  const serviceScope = (c: Coupon) => {
    const names = serviceScopeNames(c, services);
    return names.length === 0 ? "كل الخدمات" : names.join("، ");
  };

  // Only branches go through this now that services have their own renderer.
  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? "—" : "كل الفروع");

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
      service_ids: form.service_ids,
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

  const activeCount = coupons.filter((c) => c.is_active).length;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">الكوبونات</p>
          <p className="page-header-subtitle">أكواد خصم قابلة للتطبيق الذاتي من قبل المريض أو من الموظف.</p>
        </div>
      </div>

      {!loading && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{coupons.length}</div>
            <div className="stat-card-label">إجمالي الكوبونات</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{activeCount}</div>
            <div className="stat-card-label">مفعّلة</div>
          </div>
        </div>
      )}

      <form className="data-form" onSubmit={handleCreate}>
        <p className="data-form-title">كوبون جديد</p>
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

      {/* Three kinds of coupon: leave every box unticked for one that works on
          anything, tick one service, or tick a group of them. */}
      {services.length > 0 && (
        <div className="checkbox-group">
          <p className="checkbox-group-title">
            الخدمات اللي بينفع عليها الكوبون — اتركيها كلها فاضية ليشمل كل الخدمات
          </p>
          {services.map((sv) => (
            <label key={sv.id}>
              <input
                type="checkbox"
                checked={form.service_ids.includes(sv.id)}
                onChange={() =>
                  setForm({
                    ...form,
                    service_ids: form.service_ids.includes(sv.id)
                      ? form.service_ids.filter((id) => id !== sv.id)
                      : [...form.service_ids, sv.id],
                  })
                }
              />
              {sv.name}
            </label>
          ))}
        </div>
      )}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : coupons.length === 0 ? (
        <p className="section-empty">لا يوجد كوبونات بعد.</p>
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
                <td>{branchName(c.branch_id)}</td>
                <td>{serviceScope(c)}</td>
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
