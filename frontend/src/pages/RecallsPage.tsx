import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import { createRecall, listRecalls } from "../api/recalls";
import type { Recall, RecallCreate, RecallReasonType } from "../api/recalls";
import { PatientPicker } from "../components/PatientPicker";
import { recallReasonLabel, recallStatusBadgeClass, recallStatusLabel } from "../statusLabels";
import { formatDate } from "../format";
import { CheckCircleIcon, ClockIcon, PlusIcon, WaitlistIcon } from "../icons";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
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
import type { BadgeTone, Column } from "../ui";

const reasonTypes: RecallReasonType[] = [
  "periodic_checkup",
  "medical_result",
  "treatment_plan",
  "vaccination",
  "specific_date",
  "after_days",
];

const TONE: Record<string, BadgeTone> = { active: "success", warning: "warning", inactive: "neutral", danger: "danger" };

/** Follow-up invitations (recalls).
 *
 * The backend and a daily scheduled job have existed all along -- invitations
 * were being sent and escalated every day with no screen anywhere showing it,
 * so the work was invisible to the staff meant to act on it. This is that
 * screen. */
export function RecallsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reasonType, setReasonType] = useState<RecallReasonType>("periodic_checkup");
  const [reasonNotes, setReasonNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listBranches(), listServices(), listRecalls(statusFilter ? { status: statusFilter } : {})])
      .then(([b, s, r]) => {
        setBranches(b);
        setServices(s);
        setRecalls(r);
        setBranchId((current) => current || b[0]?.id || "");
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [statusFilter]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!patientId || !branchId || !dueDate) return;
    setSaving(true);
    const payload: RecallCreate = {
      patient_id: patientId,
      branch_id: branchId,
      doctor_id: null,
      service_id: serviceId || null,
      due_date: dueDate,
      reason_type: reasonType,
      reason_notes: reasonNotes || null,
    };
    createRecall(payload)
      .then((created) => {
        setRecalls((prev) => [created, ...prev]);
        setPatientId("");
        setServiceId("");
        setDueDate("");
        setReasonNotes("");
        setFormOpen(false);
        toast.success("تمت جدولة دعوة المراجعة.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const serviceName = (id: string | null) => (id ? (services.find((s) => s.id === id)?.name ?? "—") : "أي خدمة");

  const dueToday = recalls.filter((r) => r.status === "pending" && new Date(r.due_date) <= new Date()).length;
  const invited = recalls.filter((r) => r.status === "invited").length;
  const booked = recalls.filter((r) => r.status === "booked").length;

  const columns: Column<Recall>[] = [
    {
      key: "due",
      header: "موعد الدعوة",
      primary: true,
      sortValue: (r) => r.due_date,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-semibold whitespace-nowrap text-heading tabular-nums">{formatDate(r.due_date)}</div>
          <div className="truncate text-xs text-muted">{branchName(r.branch_id)}</div>
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      sortValue: (r) => recallReasonLabel[r.reason_type],
      cell: (r) => (
        <div className="min-w-0">
          <Badge>{recallReasonLabel[r.reason_type]}</Badge>
          {r.reason_notes && <div className="mt-1 truncate text-xs text-muted">{r.reason_notes}</div>}
        </div>
      ),
    },
    {
      key: "service",
      header: "الخدمة",
      secondary: true,
      sortValue: (r) => serviceName(r.service_id),
      cell: (r) => <span className="whitespace-nowrap">{serviceName(r.service_id)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (r) => recallStatusLabel[r.status],
      cell: (r) => (
        <Badge tone={TONE[recallStatusBadgeClass[r.status]] ?? "neutral"} dot>
          {recallStatusLabel[r.status]}
        </Badge>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="التشغيل اليومي"
        title="دعوات المراجعة"
        description="دعوات المتابعة تُرسل تلقائياً في موعدها عبر قناة المريض — وتُصعَّد للاتصال إذا ما رد."
        actions={
          <Button variant="inverse" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
            دعوة جديدة
          </Button>
        }
      />

      <StatGrid>
        <StatCard index={0} label="إجمالي الدعوات" value={recalls.length} icon={<WaitlistIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="استحقت اليوم" value={dueToday} icon={<ClockIcon />} tone="amber" loading={loading} />
        <StatCard index={2} label="أُرسلت" value={invited} icon={<WaitlistIcon />} tone="teal" loading={loading} />
        <StatCard index={3} label="تحوّلت لحجز" value={booked} icon={<CheckCircleIcon />} tone="rose" loading={loading} />
      </StatGrid>

      <TableToolbar
        actions={
          statusFilter ? <Button onClick={() => setStatusFilter("")}>مسح الفلتر</Button> : undefined
        }
      >
        <Field label="الحالة" className="w-full sm:w-56">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(recallStatusLabel).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </TableToolbar>

      <DataTable
        rows={recalls}
        columns={columns}
        getRowKey={(r) => r.id}
        loading={loading}
        initialSort={{ key: "due", dir: "asc" }}
        empty={
          <EmptyState
            icon={<WaitlistIcon />}
            title={statusFilter ? "ما في دعوات بهذه الحالة" : "ما في دعوات مراجعة"}
            description="جدول دعوة لمريض خلص علاجه، والنظام بيتكفّل بإرسالها في وقتها ومتابعتها."
            action={
              <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
                دعوة جديدة
              </Button>
            }
          />
        }
      />

      {formOpen && (
        <Dialog
          title="دعوة مراجعة جديدة"
          description="بتنرسل تلقائياً بتاريخ الاستحقاق — ما في داعي لأي متابعة يدوية."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="recall-form"
                loading={saving}
                disabled={!patientId || !branchId || !dueDate}
              >
                جدولة الدعوة
              </Button>
            </>
          }
        >
          <form id="recall-form" onSubmit={submit}>
            <FormGrid>
              <FormRow>
                <Field label="المريض" required>
                  <PatientPicker value={patientId} onChange={setPatientId} />
                </Field>
              </FormRow>
              <Select label="الفرع" required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Input
                label="تاريخ الاستحقاق"
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <Select label="الخدمة" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">أي خدمة</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                label="سبب الدعوة"
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value as RecallReasonType)}
              >
                {reasonTypes.map((t) => (
                  <option key={t} value={t}>
                    {recallReasonLabel[t]}
                  </option>
                ))}
              </Select>
              <FormRow>
                <Textarea
                  label="ملاحظات"
                  rows={2}
                  hint="اختياري — بتظهر للموظف، مش للمريض."
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                />
              </FormRow>
            </FormGrid>
          </form>
        </Dialog>
      )}
    </PageBody>
  );
}
