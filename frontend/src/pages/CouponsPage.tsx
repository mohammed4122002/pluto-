import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { createCoupon, deactivateCoupon, listCoupons } from "../api/coupons";
import type { Coupon, CouponCustomerScope, CouponDiscountType } from "../api/coupons";
import { formatNumber } from "../format";
import { CheckCircleIcon, CouponIcon, PlusIcon, XCircleIcon } from "../icons";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  FormGrid,
  FormRow,
  Input,
  PageBody,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  useToast,
} from "../ui";
import type { Column } from "../ui";

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
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listCoupons(), listBranches(), listServices()])
      .then(([couponList, branchList, serviceList]) => {
        setCoupons(couponList);
        setBranches(branchList);
        setServices(serviceList);
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? "—" : "كل الفروع");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) return;
    if (needsValue(form.discount_type) && form.discount_value <= 0) return;
    setSaving(true);
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
        setFormOpen(false);
        toast.success("تم إنشاء الكوبون.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const handleDeactivate = (coupon: Coupon) =>
    deactivateCoupon(coupon.id)
      .then((updated) => {
        setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? updated : c)));
        toast.success("تم إيقاف الكوبون.");
      })
      .catch(fail);

  const toggleFormService = (id: string) =>
    setForm((f) => ({
      ...f,
      service_ids: f.service_ids.includes(id) ? f.service_ids.filter((s) => s !== id) : [...f.service_ids, id],
    }));

  const activeCount = coupons.filter((c) => c.is_active).length;
  const totalUses = coupons.reduce((sum, c) => sum + c.used_count, 0);

  const columns: Column<Coupon>[] = [
    {
      key: "code",
      header: "الكود",
      primary: true,
      sortValue: (c) => c.code,
      cell: (c) => (
        <span className="font-mono text-[13px] font-bold tracking-wide text-heading" dir="ltr">
          {c.code}
        </span>
      ),
    },
    {
      key: "discount",
      header: "الخصم",
      sortValue: (c) => c.discount_value ?? 0,
      cell: (c) => (
        <div>
          <div className="font-semibold text-heading tabular-nums">
            {needsValue(c.discount_type)
              ? c.discount_type === "percentage"
                ? `${formatNumber(c.discount_value ?? 0)}%`
                : formatNumber(c.discount_value ?? 0)
              : "—"}
          </div>
          <div className="text-xs text-muted">{discountTypeLabels[c.discount_type]}</div>
        </div>
      ),
    },
    {
      key: "scope",
      header: "النطاق",
      secondary: true,
      cell: (c) => {
        const names = serviceScopeNames(c, services);
        return (
          <div className="flex flex-col gap-1 text-[13px]">
            <span>{branchName(c.branch_id)}</span>
            <span className="text-xs text-muted">{names.length === 0 ? "كل الخدمات" : names.join("، ")}</span>
          </div>
        );
      },
    },
    {
      key: "customers",
      header: "الفئة",
      secondary: true,
      sortValue: (c) => scopeLabels[c.customer_scope],
      cell: (c) => <Badge>{scopeLabels[c.customer_scope]}</Badge>,
    },
    {
      key: "uses",
      header: "الاستخدام",
      align: "end",
      sortValue: (c) => c.used_count,
      cell: (c) => (
        <span className="tabular-nums">
          {formatNumber(c.used_count)}
          <span className="text-faint"> / {c.max_uses ? formatNumber(c.max_uses) : "∞"}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (c) => (c.is_active ? 1 : 0),
      cell: (c) => (
        <Badge tone={c.is_active ? "success" : "neutral"} dot>
          {c.is_active ? "مفعّل" : "متوقف"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "100px",
      cell: (c) =>
        c.is_active ? (
          <Button size="sm" variant="danger-soft" icon={<XCircleIcon className="size-4" />} onClick={() => handleDeactivate(c)}>
            إيقاف
          </Button>
        ) : null,
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="المرضى والمالية"
        title="الكوبونات"
        description="أكواد خصم يطبّقها المريض بنفسه أو يطبّقها الموظف على دفعة قائمة."
        actions={
          <Button variant="inverse" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
            كوبون جديد
          </Button>
        }
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard index={0} label="إجمالي الكوبونات" value={coupons.length} icon={<CouponIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="المفعّلة" value={activeCount} icon={<CheckCircleIcon />} tone="teal" loading={loading} />
        <StatCard index={2} label="مرات الاستخدام" value={totalUses} icon={<CouponIcon />} tone="amber" loading={loading} />
      </StatGrid>

      <DataTable
        rows={coupons}
        columns={columns}
        getRowKey={(c) => c.id}
        loading={loading}
        initialSort={{ key: "uses", dir: "desc" }}
        empty={
          <EmptyState
            icon={<CouponIcon />}
            title="ما في كوبونات بعد"
            description="الكوبون بينطبّق على الدفعة قبل إرسال تعليمات الدفع للمريض."
            action={
              <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
                أنشئ أول كوبون
              </Button>
            }
          />
        }
      />

      {formOpen && (
        <Drawer
          title="كوبون جديد"
          description="الكود بينحفظ بحروف كبيرة — والمريض بيكتبه بأي شكل."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="coupon-form" loading={saving} disabled={!form.code.trim()}>
                إنشاء الكوبون
              </Button>
            </>
          }
        >
          <form id="coupon-form" onSubmit={submit}>
            <FormGrid>
              <Input
                label="كود الكوبون"
                required
                autoFocus
                dir="ltr"
                placeholder="WELCOME20"
                className="font-mono tracking-wide uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Select
                label="نوع الخصم"
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value as CouponDiscountType })}
              >
                {Object.entries(discountTypeLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              {needsValue(form.discount_type) && (
                <Input
                  label={form.discount_type === "percentage" ? "نسبة الخصم (%)" : "قيمة الخصم"}
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.discount_value || ""}
                  onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                />
              )}
              <Select
                label="الفئة المستهدفة"
                value={form.customer_scope}
                onChange={(e) => setForm({ ...form, customer_scope: e.target.value as CouponCustomerScope })}
              >
                {Object.entries(scopeLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input
                label="أقصى عدد استخدامات"
                type="number"
                min={1}
                placeholder="بلا حد"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              />
              <Input
                label="أقصى استخدام لكل مريض"
                type="number"
                min={1}
                placeholder="بلا حد"
                value={form.per_customer_limit}
                onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })}
              />
              <FormRow>
                <Select
                  label="الفرع"
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                >
                  <option value="">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
              {services.length > 0 && (
                <FormRow>
                  <Field label="الخدمات المشمولة" hint="اتركها فاضية ليشمل الكوبون كل الخدمات.">
                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-surface-2/50 p-3 sm:grid-cols-2">
                      {services.map((s) => (
                        <Checkbox
                          key={s.id}
                          label={s.name}
                          checked={form.service_ids.includes(s.id)}
                          onChange={() => toggleFormService(s.id)}
                        />
                      ))}
                    </div>
                  </Field>
                </FormRow>
              )}
            </FormGrid>
          </form>
        </Drawer>
      )}
    </PageBody>
  );
}
