import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { consumePackageSession, createPackage, listPackages, listPatientPackages, sellPackage } from "../api/packages";
import type { Package, PatientPackage } from "../api/packages";
import { PatientPicker } from "../components/PatientPicker";
import { packageStatusBadgeClass, packageStatusLabel } from "../statusLabels";
import { branchTimeZoneMap, formatDateShort, formatMoney, formatNumber } from "../format";
import { CheckCircleIcon, ClockIcon, PackageIcon, PlusIcon } from "../icons";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormGrid,
  FormRow,
  Input,
  PageBody,
  PageHeader,
  SegmentedControl,
  Select,
  StatCard,
  StatGrid,
  useToast,
} from "../ui";
import type { BadgeTone, Column } from "../ui";

const TONE: Record<string, BadgeTone> = { active: "success", warning: "warning", inactive: "neutral", danger: "danger" };

type Tab = "sold" | "catalog";

export function PackagesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  // A package expires at midnight of its own branch's calendar, not the
  // viewer's -- see format.ts's TimeZoneOpt comment for the live incident
  // that motivated branch-aware formatting.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("sold");
  const [dialog, setDialog] = useState<"sell" | "create" | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const [newPkg, setNewPkg] = useState({
    name: "",
    service_ids: [] as string[],
    sessions_count: 5,
    price: 0,
    validity_days: 365,
  });
  const [sellForm, setSellForm] = useState<{ patient_id: string; package_id: string; branch_id: string } | null>(null);

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listBranches(), listPatients(), listServices(), listPackages(), listPatientPackages()])
      .then(([branchList, patientList, serviceList, packageList, patientPackageList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setServices(serviceList);
        setPackages(packageList);
        setPatientPackages(patientPackageList);
        if (branchList.length > 0 && patientList.length > 0 && packageList.length > 0) {
          setSellForm(
            (f) => f ?? { patient_id: patientList[0].id, package_id: packageList[0].id, branch_id: branchList[0].id },
          );
        }
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const submitPackage = (e: FormEvent) => {
    e.preventDefault();
    if (!newPkg.name.trim() || newPkg.price <= 0 || newPkg.sessions_count <= 0) return;
    setSaving(true);
    createPackage(newPkg)
      .then((pkg) => {
        setPackages((prev) => [...prev, pkg]);
        setNewPkg({ name: "", service_ids: [], sessions_count: 5, price: 0, validity_days: 365 });
        setDialog(null);
        toast.success("تمت إضافة الباقة للكتالوج.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const toggleNewPkgService = (serviceId: string) =>
    setNewPkg((p) => ({
      ...p,
      service_ids: p.service_ids.includes(serviceId)
        ? p.service_ids.filter((id) => id !== serviceId)
        : [...p.service_ids, serviceId],
    }));

  const submitSell = (e: FormEvent) => {
    e.preventDefault();
    if (!sellForm) return;
    setSaving(true);
    sellPackage(sellForm)
      .then(() => {
        toast.success("تم إنشاء الباقة للمريض — بانتظار تأكيد الدفع من صفحة المدفوعات.");
        setDialog(null);
        load();
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const useSession = (pp: PatientPackage) =>
    consumePackageSession(pp.id)
      .then((updated) => {
        toast.success(`تم تسجيل استخدام جلسة — المتبقي: ${formatNumber(updated.sessions_remaining)}`);
        load();
      })
      .catch(fail);

  const activeCount = patientPackages.filter((pp) => pp.status === "active").length;
  const pendingCount = patientPackages.filter((pp) => pp.status === "pending_payment").length;
  const sessionsLeft = patientPackages
    .filter((pp) => pp.status === "active")
    .reduce((sum, pp) => sum + pp.sessions_remaining, 0);

  const soldColumns: Column<PatientPackage>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      sortValue: (pp) => nameOf(patients, pp.patient_id),
      cell: (pp) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{nameOf(patients, pp.patient_id)}</div>
          <div className="truncate text-xs text-muted">{nameOf(branches, pp.branch_id)}</div>
        </div>
      ),
    },
    {
      key: "package",
      header: "الباقة",
      sortValue: (pp) => nameOf(packages, pp.package_id),
      cell: (pp) => <span className="whitespace-nowrap">{nameOf(packages, pp.package_id)}</span>,
    },
    {
      key: "remaining",
      header: "الجلسات المتبقية",
      align: "end",
      sortValue: (pp) => pp.sessions_remaining,
      cell: (pp) => <span className="font-bold text-heading tabular-nums">{formatNumber(pp.sessions_remaining)}</span>,
    },
    {
      key: "expires",
      header: "تنتهي في",
      secondary: true,
      sortValue: (pp) => pp.expires_at,
      cell: (pp) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateShort(pp.expires_at, branchTz[pp.branch_id])}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (pp) => packageStatusLabel[pp.status],
      cell: (pp) => (
        <Badge tone={TONE[packageStatusBadgeClass[pp.status]] ?? "neutral"} dot>
          {packageStatusLabel[pp.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "130px",
      cell: (pp) =>
        pp.status === "active" && pp.sessions_remaining > 0 ? (
          <Button size="sm" variant="soft" icon={<CheckCircleIcon className="size-4" />} onClick={() => useSession(pp)}>
            استخدام جلسة
          </Button>
        ) : null,
    },
  ];

  const catalogColumns: Column<Package>[] = [
    {
      key: "name",
      header: "الباقة",
      primary: true,
      sortValue: (p) => p.name,
      cell: (p) => <span className="font-semibold text-heading">{p.name}</span>,
    },
    {
      key: "sessions",
      header: "عدد الجلسات",
      align: "end",
      sortValue: (p) => p.sessions_count,
      cell: (p) => <span className="tabular-nums">{formatNumber(p.sessions_count)}</span>,
    },
    {
      key: "price",
      header: "السعر",
      align: "end",
      sortValue: (p) => p.price,
      cell: (p) => <span className="font-bold text-heading tabular-nums">{formatMoney(p.price)}</span>,
    },
    {
      key: "validity",
      header: "الصلاحية",
      secondary: true,
      sortValue: (p) => p.validity_days,
      cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatNumber(p.validity_days)} يوم</span>,
    },
    {
      key: "services",
      header: "الخدمات",
      secondary: true,
      cell: (p) =>
        p.service_ids.length === 0 ? (
          <span className="text-[13px] text-faint">كل الخدمات</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {p.service_ids.slice(0, 2).map((id) => (
              <Badge key={id}>{nameOf(services, id)}</Badge>
            ))}
            {p.service_ids.length > 2 && <Badge>+{p.service_ids.length - 2}</Badge>}
          </div>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (p) => (
        <Badge tone={p.is_active ? "success" : "neutral"} dot>
          {p.is_active ? "فعّالة" : "متوقفة"}
        </Badge>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="المرضى والمالية"
        title="الباقات"
        description="باقات الجلسات المتعددة: كتالوج الباقات، بيعها للمرضى، ومتابعة استهلاك الجلسات."
        actions={
          <>
            <Button variant="inverse-ghost" icon={<PlusIcon className="size-4" />} onClick={() => setDialog("create")}>
              باقة للكتالوج
            </Button>
            <Button
              variant="inverse"
              icon={<PlusIcon className="size-4" />}
              onClick={() => setDialog("sell")}
              disabled={!sellForm}
            >
              بيع باقة لمريض
            </Button>
          </>
        }
      >
        <SegmentedControl
          items={[
            { key: "sold", label: "باقات المرضى" },
            { key: "catalog", label: "كتالوج الباقات" },
          ]}
          value={tab}
          onChange={setTab}
          onBrand
        />
      </PageHeader>

      <StatGrid>
        <StatCard index={0} label="باقات المرضى" value={patientPackages.length} icon={<PackageIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="المفعّلة" value={activeCount} icon={<CheckCircleIcon />} tone="teal" loading={loading} />
        <StatCard index={2} label="بانتظار الدفع" value={pendingCount} icon={<ClockIcon />} tone="amber" loading={loading} />
        <StatCard index={3} label="جلسات متبقية" value={sessionsLeft} icon={<PackageIcon />} tone="rose" loading={loading} />
      </StatGrid>

      {tab === "sold" ? (
        <DataTable
          rows={patientPackages}
          columns={soldColumns}
          getRowKey={(pp) => pp.id}
          loading={loading}
          initialSort={{ key: "expires", dir: "asc" }}
          empty={
            <EmptyState
              icon={<PackageIcon />}
              title="ما في باقات مباعة"
              description="بِع باقة لمريض، وبيتم إنشاء دفعة تلقائياً بانتظار تأكيدها."
              action={
                <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setDialog("sell")} disabled={!sellForm}>
                  بيع باقة
                </Button>
              }
            />
          }
        />
      ) : (
        <DataTable
          rows={packages}
          columns={catalogColumns}
          getRowKey={(p) => p.id}
          loading={loading}
          empty={
            <EmptyState
              icon={<PackageIcon />}
              title="الكتالوج فاضي"
              description="أضف باقة — عدد جلسات بسعر واحد وصلاحية محددة."
              action={
                <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setDialog("create")}>
                  باقة جديدة
                </Button>
              }
            />
          }
        />
      )}

      {dialog === "create" && (
        <Dialog
          title="باقة جديدة للكتالوج"
          description="الباقة سعر واحد لعدد جلسات، بصلاحية زمنية محددة."
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)} disabled={saving}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="package-form"
                loading={saving}
                disabled={!newPkg.name.trim() || newPkg.price <= 0}
              >
                إضافة الباقة
              </Button>
            </>
          }
        >
          <form id="package-form" onSubmit={submitPackage}>
            <FormGrid>
              <FormRow>
                <Input
                  label="اسم الباقة"
                  required
                  autoFocus
                  placeholder="باقة 5 جلسات ليزر"
                  value={newPkg.name}
                  onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })}
                />
              </FormRow>
              <Input
                label="عدد الجلسات"
                required
                type="number"
                min={1}
                value={newPkg.sessions_count}
                onChange={(e) => setNewPkg({ ...newPkg, sessions_count: Number(e.target.value) })}
              />
              <Input
                label="السعر"
                required
                type="number"
                min={0}
                step="0.01"
                value={newPkg.price || ""}
                onChange={(e) => setNewPkg({ ...newPkg, price: Number(e.target.value) })}
              />
              <Input
                label="الصلاحية (بالأيام)"
                type="number"
                min={1}
                value={newPkg.validity_days}
                onChange={(e) => setNewPkg({ ...newPkg, validity_days: Number(e.target.value) })}
              />
              {services.length > 0 && (
                <FormRow>
                  <Field label="الخدمات المشمولة" hint="اتركها فاضية ليشمل كل الخدمات.">
                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-surface-2/50 p-3 sm:grid-cols-2">
                      {services.map((s) => (
                        <Checkbox
                          key={s.id}
                          label={s.name}
                          checked={newPkg.service_ids.includes(s.id)}
                          onChange={() => toggleNewPkgService(s.id)}
                        />
                      ))}
                    </div>
                  </Field>
                </FormRow>
              )}
            </FormGrid>
          </form>
        </Dialog>
      )}

      {dialog === "sell" && sellForm && (
        <Dialog
          title="بيع باقة لمريض"
          description="بينشئ النظام دفعة بانتظار التأكيد — الباقة بتتفعّل بعد اعتماد الدفع."
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)} disabled={saving}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="sell-form" loading={saving} disabled={!sellForm.patient_id}>
                بيع الباقة
              </Button>
            </>
          }
        >
          <form id="sell-form" onSubmit={submitSell}>
            <FormGrid>
              <FormRow>
                <Field label="المريض" required>
                  <PatientPicker
                    value={sellForm.patient_id}
                    onChange={(patientId) => setSellForm({ ...sellForm, patient_id: patientId })}
                  />
                </Field>
              </FormRow>
              <Select
                label="الباقة"
                required
                value={sellForm.package_id}
                onChange={(e) => setSellForm({ ...sellForm, package_id: e.target.value })}
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price)}
                  </option>
                ))}
              </Select>
              <Select
                label="الفرع"
                required
                value={sellForm.branch_id}
                onChange={(e) => setSellForm({ ...sellForm, branch_id: e.target.value })}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormGrid>
          </form>
        </Dialog>
      )}
    </PageBody>
  );
}
