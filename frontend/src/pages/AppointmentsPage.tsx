import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { listServices } from "../api/services";
import type { Service } from "../api/services";
import {
  cancelAppointment,
  checkInAppointment,
  checkInByCode,
  createAppointment,
  listAppointments,
  listVisitTypes,
  markNoShow,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "../api/appointments";
import type { Appointment, AppointmentCreate, AppointmentStatus, VisitType } from "../api/appointments";
import { searchSlots } from "../api/slots";
import type { Slot } from "../api/slots";
import { PatientPicker } from "../components/PatientPicker";
import { QUEUE_OWNED_STATUSES, statusLabel, statusTone } from "../statusLabels";
import { branchTimeZoneMap, formatDateTimeShort } from "../format";
import {
  AppointmentIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  QueueIcon,
  SearchIcon,
  XCircleIcon,
} from "../icons";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
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

// Every status status_transitions can actually produce (confirmed against
// the live table) -- not just the handful this UI creates directly, since
// queue/check-in flows drive several of these (waiting, called,
// in_consultation...) without going through this page's own dropdown.
const statuses: AppointmentStatus[] = [
  "draft",
  "requested",
  "pending_review",
  "pending_approval",
  "pending_payment",
  "pending_insurance_verification",
  "pending_prior_authorization",
  "confirmed",
  "patient_confirmed",
  "waitlisted",
  "rescheduled",
  "checked_in",
  "arrived_late",
  "waiting",
  "called",
  "in_consultation",
  "procedure_started",
  "completed",
  "checked_out",
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "cancelled_by_doctor",
  "rejected",
  "no_show",
  "expired",
  "on_hold",
];

// Statuses that mean the visit is settled one way or another -- mirrors
// _FINISHED_STATUSES in backend app/routers/me.py.
const finishedStatuses = new Set<AppointmentStatus>([
  "completed",
  "checked_out",
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "cancelled_by_doctor",
  "no_show",
  "rejected",
  "expired",
]);

/** An appointment from a day that has already passed which nobody ever closed
 * out. Deliberately measured in whole days rather than minutes: a patient
 * turning up two hours late is an ordinary same-day arrival that staff still
 * need to check in, whereas one from a previous day needs resolving, not
 * checking in. */
const isOverdue = (appt: Appointment) => {
  if (finishedStatuses.has(appt.status)) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(appt.scheduled_at) < startOfToday;
};

type ActionDialog =
  | { kind: "reschedule"; appt: Appointment }
  | { kind: "cancel"; appt: Appointment }
  | { kind: "no_show"; appt: Appointment };

export function AppointmentsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  // A confirmed time is a real-world event at that branch, regardless of
  // which timezone the staff member viewing this table happens to be in --
  // see format.ts's TimeZoneOpt comment for the live incident this fixes.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AppointmentCreate | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    Promise.all([listBranches(), listPatients(), listStaffDirectory(), listServices(), listAppointments(), listVisitTypes()])
      .then(([branchList, patientList, staffList, serviceList, appointmentList, visitTypeList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setStaff(staffList);
        setServices(serviceList);
        setAppointments(appointmentList);
        setVisitTypes(visitTypeList);
        if (branchList.length > 0 && patientList.length > 0) {
          setForm((f) =>
            f ?? {
              branch_id: branchList[0].id,
              patient_id: patientList[0].id,
              scheduled_at: "",
              duration_minutes: 30,
            },
          );
        }
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form || !form.scheduled_at) return;
    setSaving(true);
    createAppointment(form)
      .then((appt) => {
        setAppointments((prev) => [...prev, appt]);
        setBookingOpen(false);
        toast.success(
          appt.meeting_link
            ? `تم الحجز — رابط الزيارة عن بعد: ${appt.meeting_link}`
            : "تم حجز الموعد.",
        );
      })
      .catch((err) => fail(err))
      .finally(() => setSaving(false));
  };

  const changeStatus = (appt: Appointment, status: AppointmentStatus) => {
    updateAppointmentStatus(appt.id, status)
      .then((updated) => {
        setAppointments((prev) => prev.map((a) => (a.id === appt.id ? updated : a)));
        toast.success(`تم تحديث الحالة إلى «${statusLabel[status]}».`);
      })
      .catch(fail);
  };

  const handleCheckIn = (appt: Appointment) => {
    checkInAppointment(appt.id)
      .then((result) => {
        toast.success(`تم تسجيل الحضور — رقم الدور: ${result.ticket.ticket_number}`);
        load();
      })
      .catch(fail);
  };

  if (!loading && (branches.length === 0 || patients.length === 0)) {
    return (
      <PageBody>
        <PageHeader title="المواعيد" description="حجز، متابعة، وإدارة كل مواعيد العيادة." />
        <Card>
          <EmptyState
            icon={<AppointmentIcon />}
            title="لسا ما في فرع أو مريض"
            description="لازم يكون عندك فرع واحد ومريض واحد على الأقل قبل ما تحجز أول موعد."
          />
        </Card>
      </PageBody>
    );
  }

  const q = search.trim().toLowerCase();
  const rows = appointments.filter((appt) => {
    if (statusFilter && appt.status !== statusFilter) return false;
    if (overdueOnly && !isOverdue(appt)) return false;
    if (!q) return true;
    const patientName = nameOf(patients, appt.patient_id).toLowerCase();
    const doctorName = nameOf(staff, appt.staff_id).toLowerCase();
    return patientName.includes(q) || doctorName.includes(q);
  });

  const todayCount = appointments.filter(
    (a) => new Date(a.scheduled_at).toDateString() === new Date().toDateString(),
  ).length;
  const confirmedCount = appointments.filter((a) => a.status === "confirmed" || a.status === "checked_in").length;
  const cancelledCount = appointments.filter((a) => a.status === "cancelled" || a.status === "no_show").length;
  const overdueCount = appointments.filter(isOverdue).length;

  const columns: Column<Appointment>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      sortValue: (a) => nameOf(patients, a.patient_id),
      cell: (a) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{nameOf(patients, a.patient_id)}</div>
          <div className="truncate text-xs text-muted">{nameOf(branches, a.branch_id)}</div>
        </div>
      ),
    },
    {
      key: "doctor",
      header: "الطبيب",
      sortValue: (a) => nameOf(staff, a.staff_id),
      cell: (a) => <span className="text-[13px]">{nameOf(staff, a.staff_id)}</span>,
    },
    {
      key: "service",
      header: "الخدمة",
      secondary: true,
      sortValue: (a) => nameOf(services, a.service_id),
      cell: (a) => <span className="text-[13px]">{nameOf(services, a.service_id)}</span>,
    },
    {
      key: "scheduled",
      header: "الموعد",
      sortValue: (a) => a.scheduled_at,
      cell: (a) => (
        <span className="text-[13px] whitespace-nowrap">
          {formatDateTimeShort(a.scheduled_at, branchTz[a.branch_id])}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (a) => statusLabel[a.status],
      cell: (a) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={statusTone[a.status]} dot>
            {statusLabel[a.status]}
          </Badge>
          {isOverdue(a) && <Badge tone="danger">متأخر — بحاجة إنهاء</Badge>}
        </div>
      ),
    },
    {
      key: "change-status",
      header: "تغيير الحالة",
      secondary: true,
      width: "170px",
      cell: (a) => (
        /* Queue-owned statuses stay listed so the dropdown shows the truth for
           an appointment the queue already moved, but they cannot be picked
           here -- choosing one would advance the appointment without creating
           its queue ticket. The current value is never disabled, so the select
           always has a matching option. */
        <Select
          className="h-8 text-[13px]"
          value={a.status}
          onChange={(e) => changeStatus(a, e.target.value as AppointmentStatus)}
          title="حالات الطابور تُضبط من زر «تسجيل حضور» ومن شاشة الطابور، مش من هون."
        >
          {statuses.map((s) => (
            <option key={s} value={s} disabled={s !== a.status && QUEUE_OWNED_STATUSES.has(s)}>
              {statusLabel[s]}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      align: "end",
      cell: (a) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* check_in/reschedule/cancel all need permissions doctors don't
              have -- only status and no_show (appointment.update) actually
              work for them.
              Checking someone in for a day that has already passed isn't a
              real action -- what an overdue row needs is "لم يحضر" or
              "مكتمل", which stay available. */}
          {!isOverdue(a) && (
            <Button size="sm" variant="soft" icon={<QueueIcon className="size-4" />} onClick={() => handleCheckIn(a)}>
              تسجيل حضور
            </Button>
          )}
          <Button size="sm" onClick={() => setDialog({ kind: "reschedule", appt: a })}>
            إعادة جدولة
          </Button>
          <Button size="sm" onClick={() => setDialog({ kind: "no_show", appt: a })}>
            لم يحضر
          </Button>
          <Button size="sm" variant="danger-soft" onClick={() => setDialog({ kind: "cancel", appt: a })}>
            إلغاء
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="المواعيد"
        description="حجز، متابعة، وإدارة كل مواعيد العيادة — من تسجيل الحضور حتى الإلغاء وإعادة الجدولة."
        actions={
          <>
            <Button
              variant="inverse-ghost"
              icon={<CheckCircleIcon className="size-4" />}
              onClick={() => setCheckInOpen(true)}
            >
              تسجيل حضور برمز
            </Button>
            <Button
              variant="inverse"
              icon={<PlusIcon className="size-4" />}
              onClick={() => setBookingOpen(true)}
              disabled={!form}
            >
              حجز موعد جديد
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="إجمالي المواعيد"
          value={appointments.length}
          icon={<AppointmentIcon />}
          tone="brand"
          loading={loading}
        />
        <StatCard label="مواعيد اليوم" value={todayCount} icon={<ClockIcon />} tone="teal" loading={loading} />
        <StatCard
          label="مؤكدة أو تم الحضور"
          value={confirmedCount}
          icon={<CheckCircleIcon />}
          tone="amber"
          loading={loading}
        />
        {overdueCount > 0 ? (
          <StatCard
            label="متأخرة — بحاجة إنهاء"
            value={overdueCount}
            icon={<ClockIcon />}
            tone="rose"
            loading={loading}
            hint={overdueOnly ? "اضغط للعودة لكل المواعيد" : "اضغط لعرضها وحدها"}
            onClick={() => setOverdueOnly((v) => !v)}
          />
        ) : (
          <StatCard
            label="ملغاة أو لم تحضر"
            value={cancelledCount}
            icon={<XCircleIcon />}
            tone="rose"
            loading={loading}
          />
        )}
      </StatGrid>

      <TableToolbar>
        <Input
          className="w-full sm:w-72"
          label="بحث"
          placeholder="بحث باسم المريض أو الطبيب..."
          icon={<SearchIcon />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Field label="الحالة" className="w-full sm:w-56">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}>
            <option value="">كل الحالات</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </Select>
        </Field>
        {overdueOnly && (
          <Button variant="soft" onClick={() => setOverdueOnly(false)}>
            المتأخرة فقط — إلغاء الفلتر
          </Button>
        )}
      </TableToolbar>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: "scheduled", dir: "desc" }}
        rowClassName={(a) => (isOverdue(a) ? "bg-danger-bg/40" : undefined)}
        empty={
          <EmptyState
            icon={<AppointmentIcon />}
            title={q || statusFilter || overdueOnly ? "ما في مواعيد مطابقة" : "ما في مواعيد بعد"}
            description={
              q || statusFilter || overdueOnly
                ? "جرّب تغيير البحث أو الفلتر لعرض مواعيد أخرى."
                : "ابدأ بحجز أول موعد من الزر بالأعلى."
            }
            action={
              q || statusFilter || overdueOnly ? (
                <Button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setOverdueOnly(false);
                  }}
                >
                  مسح الفلاتر
                </Button>
              ) : (
                <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setBookingOpen(true)}>
                  حجز موعد جديد
                </Button>
              )
            }
          />
        }
      />

      {bookingOpen && form && (
        <Drawer
          title="حجز موعد جديد"
          description="اختر الفرع والمريض والوقت — الباقي اختياري."
          width="lg"
          onClose={() => setBookingOpen(false)}
          footer={
            <>
              <Button onClick={() => setBookingOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                form="booking-form"
                type="submit"
                loading={saving}
                disabled={!form.scheduled_at || !form.patient_id}
              >
                حجز الموعد
              </Button>
            </>
          }
        >
          <form id="booking-form" onSubmit={handleCreate}>
            <FormGrid>
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
              <Input
                label="وقت الموعد"
                required
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
              <FormRow>
                <Field label="المريض" required>
                  <PatientPicker
                    value={form.patient_id}
                    onChange={(patientId) => setForm({ ...form, patient_id: patientId })}
                  />
                </Field>
              </FormRow>
              <Select
                label="الطبيب"
                value={form.staff_id ?? ""}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value || undefined })}
              >
                <option value="">بدون طبيب محدد</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
              <Select
                label="الخدمة"
                value={form.service_id ?? ""}
                onChange={(e) => setForm({ ...form, service_id: e.target.value || undefined })}
              >
                <option value="">بدون خدمة محددة</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                label="نوع الزيارة"
                value={form.visit_type_id ?? ""}
                onChange={(e) => setForm({ ...form, visit_type_id: e.target.value || undefined })}
              >
                <option value="">حضوري (افتراضي)</option>
                {visitTypes
                  .filter((v) => v.code !== "in_person")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name_ar}
                    </option>
                  ))}
              </Select>
              <Input
                label="مصدر الإحالة"
                hint="اختياري — مثال: إنستغرام، توصية مريض."
                value={form.referral_source ?? ""}
                onChange={(e) => setForm({ ...form, referral_source: e.target.value || undefined })}
              />
            </FormGrid>
          </form>
        </Drawer>
      )}

      {checkInOpen && (
        <CheckInDialog
          onClose={() => setCheckInOpen(false)}
          onDone={load}
          onFail={fail}
          toast={toast}
        />
      )}

      {dialog?.kind === "reschedule" && (
        <RescheduleDialog
          appt={dialog.appt}
          branchTz={branchTz}
          onClose={() => setDialog(null)}
          onDone={load}
          onFail={fail}
          toast={toast}
        />
      )}
      {dialog?.kind === "cancel" && (
        <CancelDialog
          appt={dialog.appt}
          onClose={() => setDialog(null)}
          onDone={load}
          onFail={fail}
          toast={toast}
        />
      )}
      {dialog?.kind === "no_show" && (
        <NoShowDialog
          appt={dialog.appt}
          onClose={() => setDialog(null)}
          onDone={load}
          onFail={fail}
          toast={toast}
        />
      )}
    </PageBody>
  );
}

type Fail = (err: { response?: { data?: { detail?: string } }; message: string }) => void;
type DialogProps = {
  appt: Appointment;
  onClose: () => void;
  onDone: () => void;
  onFail: Fail;
  toast: ReturnType<typeof useToast>;
};

/** "رسوم مطبّقة / تم استرجاع" -- the settlement the backend reports back for a
 * cancellation or a no-show, phrased for a toast. */
function settlementNotice(label: string, result: { fee_charged: number; refunded: number }) {
  const parts: string[] = [];
  if (result.fee_charged > 0) parts.push(`رسوم مطبّقة: ${result.fee_charged}`);
  if (result.refunded > 0) parts.push(`تم استرجاع: ${result.refunded}`);
  return parts.length ? `${label} — ${parts.join(" | ")}` : `${label} بدون رسوم.`;
}

function CheckInDialog({
  onClose,
  onDone,
  onFail,
  toast,
}: {
  onClose: () => void;
  onDone: () => void;
  onFail: Fail;
  toast: ReturnType<typeof useToast>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!code.trim()) return;
    setBusy(true);
    checkInByCode(code.trim())
      .then((result) => {
        toast.success(`تم تسجيل الحضور — رقم الدور: ${result.ticket.ticket_number}`);
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="تسجيل حضور برمز"
      description="امسح رمز QR الخاص بالمريض، أو اكتب رقم الحجز أو رمز التأكيد."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" loading={busy} disabled={!code.trim()} onClick={submit}>
            تسجيل الحضور
          </Button>
        </>
      }
    >
      <Input
        label="رقم الحجز أو رمز التأكيد"
        autoFocus
        placeholder="A-1042"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </Dialog>
  );
}

function RescheduleDialog({ appt, branchTz, onClose, onDone, onFail, toast }: DialogProps & { branchTz: Record<string, string | undefined> }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(true);

  useEffect(() => {
    searchSlots({ branch_id: appt.branch_id, staff_id: appt.staff_id ?? undefined, status: "available" })
      .then(setSlots)
      .catch(onFail)
      .finally(() => setLoadingSlots(false));
    // Runs once for the appointment this dialog was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt.id]);

  const submit = () => {
    if (!slotId) return;
    setBusy(true);
    rescheduleAppointment(appt.id, slotId, crypto.randomUUID(), reason || undefined)
      .then(() => {
        toast.success("تمت إعادة جدولة الموعد.");
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="إعادة جدولة الموعد"
      description={`الموعد الحالي: ${formatDateTimeShort(appt.scheduled_at, branchTz[appt.branch_id])}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" loading={busy} disabled={!slotId} onClick={submit}>
            تأكيد الموعد الجديد
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="الموعد الجديد"
          required
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          disabled={loadingSlots}
          hint={
            loadingSlots
              ? "جاري تحميل الأوقات المتاحة..."
              : slots.length === 0
                ? "ما في أوقات متاحة لهذا الفرع/الطبيب حالياً."
                : undefined
          }
        >
          <option value="">اختر الموعد الجديد</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDateTimeShort(s.start_at, branchTz[s.branch_id])}
            </option>
          ))}
        </Select>
        <Input
          label="سبب إعادة الجدولة"
          hint="اختياري — بينحفظ مع سجل الموعد."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

function CancelDialog({ appt, onClose, onDone, onFail, toast }: DialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = (cancelledBy: "patient" | "clinic" | "doctor") => {
    if (!reason.trim()) return;
    setBusy(true);
    cancelAppointment(appt.id, reason, cancelledBy)
      .then((result) => {
        toast.success(settlementNotice("تم الإلغاء", result));
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="إلغاء الموعد"
      description="سياسة الإلغاء بتحدد إذا في رسوم أو استرجاع — بينطبّق تلقائياً حسب الجهة الملغية."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            تراجع
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => submit("clinic")}>
            إلغاء من العيادة
          </Button>
          <Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={() => submit("patient")}>
            إلغاء بطلب المريض
          </Button>
        </>
      }
    >
      <Textarea
        label="سبب الإلغاء"
        required
        autoFocus
        rows={2}
        placeholder="مثال: ظرف طارئ عند المريض."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}

function NoShowDialog({ appt, onClose, onDone, onFail, toast }: DialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!reason.trim()) return;
    setBusy(true);
    markNoShow(appt.id, reason)
      .then((result) => {
        toast.success(settlementNotice("تم تسجيل عدم الحضور", result));
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="تسجيل عدم حضور"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            تراجع
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={submit}>
            تأكيد عدم الحضور
          </Button>
        </>
      }
    >
      <Textarea
        label="سبب عدم الحضور"
        required
        autoFocus
        rows={2}
        placeholder="مثال: ما رد على الاتصال ولا حضر خلال مهلة الانتظار."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}
