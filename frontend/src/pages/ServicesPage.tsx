import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addServiceDoctor, createService, listServices, removeServiceDoctor, updateService } from "../api/services";
import type { Service, ServiceCreate } from "../api/services";
import { listSpecialties } from "../api/specialties";
import type { Specialty } from "../api/specialties";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { formatMoney, formatNumber } from "../format";
import { CheckCircleIcon, ClockIcon, EditIcon, PlusIcon, SearchIcon, ServiceIcon, XCircleIcon } from "../icons";
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
  TableToolbar,
  Textarea,
  useToast,
} from "../ui";
import type { Column } from "../ui";

const emptyForm: ServiceCreate = {
  name: "",
  description: "",
  duration_minutes: 30,
  price: undefined,
  specialty_id: undefined,
  doctor_ids: [],
  deposit_amount: undefined,
  prep_instructions: "",
  required_documents: "",
  min_age: undefined,
  patient_gender_restriction: undefined,
  approval_requirement: "none",
};

const approvalLabels: Record<string, string> = {
  none: "بدون موافقة مسبقة",
  doctor: "موافقة الطبيب",
  admin: "موافقة الإدارة",
  previous_visit: "نتيجة تحليل/زيارة سابقة",
};

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<StaffDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ServiceCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  /** null = closed, "" = creating, an id = editing that service. One form for
   * both: the page used to carry two copies of eleven fields, and they had
   * already drifted apart. */
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listServices(), listSpecialties(), listStaffDirectory()])
      .then(([serviceList, specialtyList, staffList]) => {
        setServices(serviceList);
        setSpecialties(specialtyList);
        setDoctors(staffList.filter((s) => s.role === "doctor"));
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const q = search.trim().toLowerCase();
  const rows = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;

  const specialtyName = (id: string | null) => specialties.find((s) => s.id === id)?.name_ar ?? "—";

  const openCreate = () => {
    setForm(emptyForm);
    setEditing("");
  };

  const openEdit = (service: Service) => {
    setForm({
      name: service.name,
      description: service.description ?? "",
      duration_minutes: service.duration_minutes,
      price: service.price ?? undefined,
      specialty_id: service.specialty_id ?? undefined,
      doctor_ids: service.doctor_ids,
      deposit_amount: service.deposit_amount ?? undefined,
      prep_instructions: service.prep_instructions ?? "",
      required_documents: service.required_documents ?? "",
      min_age: service.min_age ?? undefined,
      patient_gender_restriction: service.patient_gender_restriction ?? undefined,
      approval_requirement: service.approval_requirement,
    });
    setEditing(service.id);
  };

  const toggleFormDoctor = (staffId: string) =>
    setForm((f) => ({
      ...f,
      doctor_ids: (f.doctor_ids ?? []).includes(staffId)
        ? (f.doctor_ids ?? []).filter((id) => id !== staffId)
        : [...(f.doctor_ids ?? []), staffId],
    }));

  /** Doctors are a separate endpoint per assignment, so an edit diffs the two
   * lists and sends only what actually changed. */
  const syncDoctors = async (service: Service, next: string[]) => {
    const added = next.filter((id) => !service.doctor_ids.includes(id));
    const removed = service.doctor_ids.filter((id) => !next.includes(id));
    for (const id of added) await addServiceDoctor(service.id, id);
    for (const id of removed) await removeServiceDoctor(service.id, id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const existing = editing ? services.find((s) => s.id === editing) : undefined;
    const request = existing
      ? updateService(existing.id, form).then(async (updated) => {
          await syncDoctors(existing, form.doctor_ids ?? []);
          return { ...updated, doctor_ids: form.doctor_ids ?? [] };
        })
      : createService(form);
    request
      .then((service) => {
        setServices((prev) =>
          existing
            ? prev.map((s) => (s.id === existing.id ? service : s))
            : [...prev, service].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditing(null);
        toast.success(existing ? "تم حفظ الخدمة." : "تمت إضافة الخدمة.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const toggleActive = (service: Service) =>
    updateService(service.id, { is_active: !service.is_active })
      .then((updated) => {
        setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
        toast.success(updated.is_active ? "تم تفعيل الخدمة." : "تم إيقاف الخدمة.");
      })
      .catch(fail);

  const activeCount = services.filter((s) => s.is_active).length;
  const avgDuration = services.length
    ? Math.round(services.reduce((sum, s) => sum + s.duration_minutes, 0) / services.length)
    : 0;
  const priced = services.filter((s) => s.price != null);

  const columns: Column<Service>[] = [
    {
      key: "name",
      header: "الخدمة",
      primary: true,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{s.name}</div>
          {s.description && <div className="truncate text-xs text-muted">{s.description}</div>}
        </div>
      ),
    },
    {
      key: "duration",
      header: "المدة",
      sortValue: (s) => s.duration_minutes,
      cell: (s) => <span className="whitespace-nowrap tabular-nums">{formatNumber(s.duration_minutes)} دقيقة</span>,
    },
    {
      key: "price",
      header: "السعر",
      align: "end",
      sortValue: (s) => s.price ?? null,
      cell: (s) => (
        <div className="text-end">
          <div className="font-bold text-heading tabular-nums">
            {s.price != null ? formatMoney(s.price) : "—"}
          </div>
          {s.deposit_amount != null && (
            <div className="text-xs text-muted">عربون {formatNumber(s.deposit_amount)}</div>
          )}
        </div>
      ),
    },
    {
      key: "specialty",
      header: "التخصص",
      secondary: true,
      sortValue: (s) => specialtyName(s.specialty_id),
      cell: (s) => <Badge>{specialtyName(s.specialty_id)}</Badge>,
    },
    {
      key: "doctors",
      header: "الأطباء",
      secondary: true,
      cell: (s) =>
        s.doctor_ids.length === 0 ? (
          <span className="text-[13px] text-faint">كل الأطباء</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {s.doctor_ids.slice(0, 2).map((id) => (
              <Badge key={id} tone="brand">
                {doctors.find((d) => d.id === id)?.full_name ?? "—"}
              </Badge>
            ))}
            {s.doctor_ids.length > 2 && <Badge>+{s.doctor_ids.length - 2}</Badge>}
          </div>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (s) => (s.is_active ? 1 : 0),
      cell: (s) => (
        <Badge tone={s.is_active ? "success" : "neutral"} dot>
          {s.is_active ? "فعّالة" : "متوقفة"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "170px",
      cell: (s) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" icon={<EditIcon className="size-4" />} onClick={() => openEdit(s)}>
            تعديل
          </Button>
          <Button
            size="sm"
            variant={s.is_active ? "danger-soft" : "soft"}
            icon={s.is_active ? <XCircleIcon className="size-4" /> : <CheckCircleIcon className="size-4" />}
            onClick={() => toggleActive(s)}
          >
            {s.is_active ? "إيقاف" : "تفعيل"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="إعداد العيادة"
        title="الخدمات"
        description="كتالوج الخدمات، أسعارها ومدتها، والأطباء المسؤولين عن كل خدمة."
        actions={
          <Button variant="inverse" icon={<PlusIcon className="size-4" />} onClick={openCreate}>
            خدمة جديدة
          </Button>
        }
      />

      <StatGrid>
        <StatCard index={0} label="إجمالي الخدمات" value={services.length} icon={<ServiceIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="الخدمات الفعّالة" value={activeCount} icon={<CheckCircleIcon />} tone="teal" loading={loading} />
        <StatCard
          index={2}
          label="متوسط المدة"
          value={`${formatNumber(avgDuration)} د`}
          icon={<ClockIcon />}
          tone="amber"
          loading={loading}
        />
        <StatCard
          index={3}
          label="خدمات مسعّرة"
          value={priced.length}
          icon={<ServiceIcon />}
          tone="rose"
          loading={loading}
          hint={`من أصل ${services.length}`}
        />
      </StatGrid>

      <TableToolbar>
        <Input
          className="w-full sm:w-80"
          label="بحث"
          placeholder="بحث باسم الخدمة..."
          icon={<SearchIcon />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </TableToolbar>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(s) => s.id}
        loading={loading}
        empty={
          <EmptyState
            icon={<ServiceIcon />}
            title={q ? "ما في خدمات مطابقة" : "ما في خدمات بعد"}
            description={
              q
                ? "جرّب اسماً مختلفاً أو امسح البحث."
                : "الخدمة بتحدد مدة الموعد وسعره والعربون المطلوب — وبيستخدمها المساعد الذكي بالرد على المرضى."
            }
            action={
              q ? (
                <Button onClick={() => setSearch("")}>مسح البحث</Button>
              ) : (
                <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={openCreate}>
                  أضف أول خدمة
                </Button>
              )
            }
          />
        }
      />

      {editing !== null && (
        <Drawer
          title={editing ? "تعديل الخدمة" : "خدمة جديدة"}
          description="الاسم والمدة إلزاميان — الباقي بيضبط الحجز والتحضير والموافقات."
          width="lg"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={saving}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="service-form" loading={saving} disabled={!form.name.trim()}>
                {editing ? "حفظ التعديلات" : "إضافة الخدمة"}
              </Button>
            </>
          }
        >
          <form id="service-form" onSubmit={submit}>
            <FormGrid>
              <Input
                label="اسم الخدمة"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Select
                label="التخصص"
                value={form.specialty_id ?? ""}
                onChange={(e) => setForm({ ...form, specialty_id: e.target.value || undefined })}
              >
                <option value="">بدون تخصص محدد</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_ar}
                  </option>
                ))}
              </Select>
              <FormRow>
                <Textarea
                  label="الوصف"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </FormRow>
              <Input
                label="المدة (بالدقائق)"
                type="number"
                min={5}
                step={5}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              />
              <Input
                label="السعر"
                type="number"
                min={0}
                step="0.01"
                placeholder="بدون سعر ثابت"
                value={form.price ?? ""}
                onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })}
              />
              <Input
                label="العربون المطلوب"
                type="number"
                min={0}
                step="0.01"
                hint="لما يكون فيه عربون، بينشئ النظام دفعة تلقائياً عند التأكيد."
                value={form.deposit_amount ?? ""}
                onChange={(e) =>
                  setForm({ ...form, deposit_amount: e.target.value ? Number(e.target.value) : undefined })
                }
              />
              <Select
                label="الموافقة المسبقة"
                value={form.approval_requirement ?? "none"}
                onChange={(e) =>
                  setForm({ ...form, approval_requirement: e.target.value as ServiceCreate["approval_requirement"] })
                }
              >
                {Object.entries(approvalLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input
                label="الحد الأدنى للعمر"
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.min_age ?? ""}
                onChange={(e) => setForm({ ...form, min_age: e.target.value ? Number(e.target.value) : undefined })}
              />
              <Select
                label="تقييد الجنس"
                value={form.patient_gender_restriction ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    patient_gender_restriction: (e.target.value || undefined) as "male" | "female" | undefined,
                  })
                }
              >
                <option value="">بدون تقييد</option>
                <option value="male">ذكور فقط</option>
                <option value="female">إناث فقط</option>
              </Select>
              <FormRow>
                <Textarea
                  label="تعليمات التحضير قبل الموعد"
                  rows={2}
                  hint="بتوصل للمريض مع رسالة التأكيد."
                  value={form.prep_instructions}
                  onChange={(e) => setForm({ ...form, prep_instructions: e.target.value })}
                />
              </FormRow>
              <FormRow>
                <Input
                  label="المستندات المطلوبة"
                  value={form.required_documents}
                  onChange={(e) => setForm({ ...form, required_documents: e.target.value })}
                />
              </FormRow>
              {doctors.length > 0 && (
                <FormRow>
                  <Field
                    label="الأطباء اللي بيقدّموا هذه الخدمة"
                    hint="اتركها فاضية إذا كل الأطباء بيقدّموها."
                  >
                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-surface-2/50 p-3 sm:grid-cols-2">
                      {doctors.map((d) => (
                        <Checkbox
                          key={d.id}
                          label={d.full_name}
                          checked={(form.doctor_ids ?? []).includes(d.id)}
                          onChange={() => toggleFormDoctor(d.id)}
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
