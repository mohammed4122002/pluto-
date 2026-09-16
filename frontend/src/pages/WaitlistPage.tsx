import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { addToWaitlist, cancelWaitlistEntry, listWaitlist } from "../api/waitlist";
import type { WaitlistCreate, WaitlistEntry } from "../api/waitlist";
import { PatientPicker } from "../components/PatientPicker";
import { waitlistStatusBadgeClass, waitlistStatusLabel } from "../statusLabels";
import { formatDateTimeShort } from "../format";
import { CheckCircleIcon, PlusIcon, WaitlistIcon, XCircleIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormGrid,
  FormRow,
  PageBody,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  useToast,
} from "../ui";
import type { BadgeTone, Column } from "../ui";

const TONE: Record<string, BadgeTone> = {
  active: "warning",
  inactive: "neutral",
  danger: "danger",
  warning: "warning",
};

export function WaitlistPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<WaitlistCreate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listBranches(), listPatients(), listServices(), listWaitlist()])
      .then(([branchList, patientList, serviceList, waitlistList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setServices(serviceList);
        setEntries(waitlistList);
        if (branchList.length > 0 && patientList.length > 0) {
          setForm((f) => f ?? { patient_id: patientList[0].id, branch_id: branchList[0].id });
        }
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    addToWaitlist(form)
      .then((entry) => {
        setEntries((prev) => [...prev, entry]);
        setFormOpen(false);
        toast.success("تمت الإضافة لقائمة الانتظار.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const handleCancel = (entry: WaitlistEntry) =>
    cancelWaitlistEntry(entry.id)
      .then((updated) => {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
        toast.success("تم إلغاء الإدخال.");
      })
      .catch(fail);

  if (!loading && (branches.length === 0 || patients.length === 0)) {
    return (
      <PageBody>
        <PageHeader eyebrow="التشغيل اليومي" title="قائمة الانتظار" />
        <Card>
          <EmptyState
            icon={<WaitlistIcon />}
            title="لسا ما في فرع أو مريض"
            description="لازم يكون عندك فرع ومريض واحد على الأقل قبل إضافة أحد لقائمة الانتظار."
          />
        </Card>
      </PageBody>
    );
  }

  const activeCount = entries.filter((e) => e.status === "active" || e.status === "offered").length;
  const offeredCount = entries.filter((e) => e.status === "offered").length;
  const bookedCount = entries.filter((e) => e.status === "booked").length;

  const columns: Column<WaitlistEntry>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      sortValue: (e) => nameOf(patients, e.patient_id),
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{nameOf(patients, e.patient_id)}</div>
          <div className="truncate text-xs text-muted">{nameOf(branches, e.branch_id)}</div>
        </div>
      ),
    },
    {
      key: "service",
      header: "الخدمة",
      sortValue: (e) => (e.service_id ? nameOf(services, e.service_id) : "أي خدمة"),
      cell: (e) => (
        <span className="whitespace-nowrap">{e.service_id ? nameOf(services, e.service_id) : "أي خدمة"}</span>
      ),
    },
    {
      key: "flex",
      header: "المرونة",
      secondary: true,
      cell: (e) => (
        <div className="flex flex-wrap gap-1">
          {e.accepts_alternative_doctor && <Badge tone="teal">يقبل طبيباً بديلاً</Badge>}
          {e.accepts_alternative_branch && <Badge tone="teal">يقبل فرعاً بديلاً</Badge>}
          {!e.accepts_alternative_doctor && !e.accepts_alternative_branch && (
            <span className="text-xs text-faint">بدون مرونة</span>
          )}
        </div>
      ),
    },
    {
      key: "created",
      header: "بالقائمة منذ",
      secondary: true,
      sortValue: (e) => e.created_at,
      cell: (e) => <span className="whitespace-nowrap tabular-nums">{formatDateTimeShort(e.created_at)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (e) => waitlistStatusLabel[e.status],
      cell: (e) => (
        <Badge tone={TONE[waitlistStatusBadgeClass[e.status]] ?? "neutral"} dot>
          {waitlistStatusLabel[e.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "100px",
      cell: (e) =>
        e.status === "active" || e.status === "offered" ? (
          <Button size="sm" variant="danger-soft" icon={<XCircleIcon className="size-4" />} onClick={() => handleCancel(e)}>
            إلغاء
          </Button>
        ) : null,
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="التشغيل اليومي"
        title="قائمة الانتظار"
        description="عند فتح موعد مناسب، يرسل النظام عرضاً تلقائياً لأول مريض مناسب عبر قناة تواصله بمهلة محدودة — وإذا ما رد، ينتقل العرض للتالي."
        actions={
          <Button
            variant="inverse"
            icon={<PlusIcon className="size-4" />}
            onClick={() => setFormOpen(true)}
            disabled={!form}
          >
            إضافة للقائمة
          </Button>
        }
      />

      <StatGrid>
        <StatCard index={0} label="إجمالي القائمة" value={entries.length} icon={<WaitlistIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="بانتظار دورهم" value={activeCount} icon={<WaitlistIcon />} tone="amber" loading={loading} />
        <StatCard index={2} label="معروض عليهم الآن" value={offeredCount} icon={<WaitlistIcon />} tone="teal" loading={loading} />
        <StatCard index={3} label="تم حجزهم" value={bookedCount} icon={<CheckCircleIcon />} tone="rose" loading={loading} />
      </StatGrid>

      <DataTable
        rows={entries}
        columns={columns}
        getRowKey={(e) => e.id}
        loading={loading}
        initialSort={{ key: "created", dir: "asc" }}
        empty={
          <EmptyState
            icon={<WaitlistIcon />}
            title="ما في أحد بقائمة الانتظار"
            description="ضيف مريضاً هنا لما يكون الجدول ممتلئ — النظام بيعرض عليه أول موعد بينفتح."
            action={
              <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)} disabled={!form}>
                إضافة للقائمة
              </Button>
            }
          />
        }
      />

      {formOpen && form && (
        <Dialog
          title="إضافة مريض لقائمة الانتظار"
          description="كل ما يكون المريض أكثر مرونة، كل ما زادت فرصته يلحق أول موعد بينفتح."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="waitlist-form" loading={saving} disabled={!form.patient_id}>
                إضافة للقائمة
              </Button>
            </>
          }
        >
          <form id="waitlist-form" onSubmit={submit}>
            <FormGrid>
              <FormRow>
                <Field label="المريض" required>
                  <PatientPicker
                    value={form.patient_id}
                    onChange={(patientId) => setForm({ ...form, patient_id: patientId })}
                  />
                </Field>
              </FormRow>
              <Select
                label="الفرع"
                required
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select
                label="الخدمة"
                value={form.service_id ?? ""}
                onChange={(e) => setForm({ ...form, service_id: e.target.value || undefined })}
              >
                <option value="">أي خدمة</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <FormRow>
                <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2/50 p-3">
                  <Checkbox
                    label="يقبل طبيباً بديلاً"
                    checked={form.accepts_alternative_doctor ?? false}
                    onChange={(e) => setForm({ ...form, accepts_alternative_doctor: e.target.checked })}
                  />
                  <Checkbox
                    label="يقبل فرعاً بديلاً"
                    checked={form.accepts_alternative_branch ?? false}
                    onChange={(e) => setForm({ ...form, accepts_alternative_branch: e.target.checked })}
                  />
                </div>
              </FormRow>
            </FormGrid>
          </form>
        </Dialog>
      )}
    </PageBody>
  );
}
