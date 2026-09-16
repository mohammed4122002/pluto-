import { useEffect, useState } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { callTicket, completeTicket, listQueues, listQueueTickets, skipTicket, startTicket } from "../api/queue";
import type { Queue, QueueTicket } from "../api/queue";
import { arrivalStatusLabel, priorityLabel, queueStatusBadgeClass, queueStatusLabel } from "../statusLabels";
import { formatTime } from "../format";
import { CheckCircleIcon, ClockIcon, PhoneIcon, QueueIcon, XCircleIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageBody,
  PageHeader,
  SegmentedControl,
  StatCard,
  StatGrid,
  Skeleton,
  cn,
  useToast,
} from "../ui";
import type { BadgeTone, StatTone } from "../ui";

const TONE: Record<string, BadgeTone> = { active: "success", warning: "warning", inactive: "neutral", danger: "danger" };

/** Tone per ticket status, so the board reads at a glance the way a real
 * clinic queue display does -- waiting patients warm/amber, someone actually
 * being seen teal, and closed-out tickets fading to neutral. */
const cardTone: Record<QueueTicket["status"], { rail: string; stat: StatTone }> = {
  waiting: { rail: "bg-amber", stat: "amber" },
  called: { rail: "bg-violet", stat: "brand" },
  in_progress: { rail: "bg-teal", stat: "teal" },
  done: { rail: "bg-line-strong", stat: "neutral" },
  skipped: { rail: "bg-rose", stat: "rose" },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function QueuePage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<StaffDirectoryEntry[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTicket, setBusyTicket] = useState<string | null>(null);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const loadQueues = () => {
    setLoading(true);
    // Scoped to today by default -- staff used to have to hunt through every
    // open queue ever created (yesterday's, the day before's...) to find
    // today's. Computed fresh on every load, so it's always "today" without
    // anyone having to pick a date.
    const today = todayIso();
    Promise.all([listBranches(), listPatients(), listStaffDirectory(), listQueues(undefined, today)])
      .then(([branchList, patientList, staffList, queueList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setDoctors(staffList.filter((s) => s.role === "doctor"));
        setQueues(queueList);
        setSelectedQueue(queueList[0]?.id || "");
      })
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadQueues, []);

  const loadTickets = () => {
    if (!selectedQueue) {
      setTickets([]);
      return;
    }
    listQueueTickets(selectedQueue).then(setTickets).catch(fail);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadTickets, [selectedQueue]);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const act = (fn: (id: string) => Promise<QueueTicket>, ticket: QueueTicket, done: string) => {
    setBusyTicket(ticket.id);
    fn(ticket.id)
      .then(() => {
        toast.success(done);
        loadTickets();
      })
      .catch(fail)
      .finally(() => setBusyTicket(null));
  };

  const waiting = tickets.filter((t) => t.status === "waiting").length;
  const called = tickets.filter((t) => t.status === "called").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const doneCount = tickets.filter((t) => t.status === "done").length;

  return (
    <PageBody>
      <PageHeader
        eyebrow="التشغيل اليومي"
        title="الطابور والانتظار"
        description="الطابور بينشأ تلقائياً عند أول تسجيل حضور لطبيب باليوم — ما في داعي لإنشائه يدوياً. سجّل الحضور من صفحة المواعيد أو من شاشة الاستقبال."
      >
        {queues.length > 1 && (
          <SegmentedControl
            items={queues.map((q) => ({
              key: q.id,
              // Each queue is scoped to one doctor at one branch on one day --
              // two doctors at the same branch today means two tabs that look
              // identical without the doctor's name.
              label: `${nameOf(branches, q.branch_id)} — ${q.doctor_id ? nameOf(doctors, q.doctor_id) : "بدون طبيب محدد"}`,
            }))}
            value={selectedQueue}
            onChange={setSelectedQueue}
            onBrand
          />
        )}
      </PageHeader>

      <StatGrid>
        <StatCard index={0} label="بالانتظار" value={waiting} icon={<ClockIcon />} tone="amber" loading={loading} />
        <StatCard index={1} label="تم نداؤهم" value={called} icon={<PhoneIcon />} tone="brand" loading={loading} />
        <StatCard index={2} label="داخل الكشف" value={inProgress} icon={<QueueIcon />} tone="teal" loading={loading} />
        <StatCard index={3} label="خلصوا اليوم" value={doneCount} icon={<CheckCircleIcon />} tone="rose" loading={loading} />
      </StatGrid>

      {loading ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : queues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<QueueIcon />}
            title="ما في طابور نشط اليوم"
            description="بيظهر هنا تلقائياً بعد أول تسجيل حضور — من شاشة الاستقبال أو من صفحة المواعيد."
          />
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState icon={<QueueIcon />} title="ما في أحد بالطابور حالياً" description="كل المرضى المسجّلين خلصوا." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {tickets.map((t, i) => {
            const tone = cardTone[t.status];
            const busy = busyTicket === t.id;
            return (
              <Card key={t.id} index={i} className="relative overflow-hidden ps-6">
                <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-1.5", tone.rail)} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-[26px] leading-8 font-bold tracking-[-0.03em] text-heading tabular-nums">
                      {t.ticket_number}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-heading">
                      {nameOf(patients, t.patient_id)}
                    </div>
                  </div>
                  <Badge tone={TONE[queueStatusBadgeClass[t.status]] ?? "neutral"} dot>
                    {queueStatusLabel[t.status]}
                  </Badge>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                  <div className="flex gap-1.5">
                    <dt className="text-muted">الأولوية:</dt>
                    <dd className="font-semibold text-heading">{priorityLabel[t.priority_level]}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted">الوصول:</dt>
                    <dd className="font-semibold text-heading">
                      {t.arrival_status ? arrivalStatusLabel[t.arrival_status] : "—"}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted">سجّل حضوره:</dt>
                    <dd className="font-semibold text-heading tabular-nums">{formatTime(t.checked_in_at)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {t.status === "waiting" && (
                    <>
                      <Button
                        size="sm"
                        icon={<PhoneIcon className="size-4" />}
                        loading={busy}
                        onClick={() => act(callTicket, t, "تم نداء المريض.")}
                      >
                        نداء
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy}
                        onClick={() => act(startTicket, t, "بدأ الكشف.")}
                      >
                        بدء الكشف
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        icon={<XCircleIcon className="size-4" />}
                        loading={busy}
                        onClick={() => act(skipTicket, t, "تم تخطي الدور.")}
                      >
                        تخطي
                      </Button>
                    </>
                  )}
                  {t.status === "called" && (
                    <>
                      <Button size="sm" variant="primary" loading={busy} onClick={() => act(startTicket, t, "بدأ الكشف.")}>
                        بدء الكشف
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        icon={<XCircleIcon className="size-4" />}
                        loading={busy}
                        onClick={() => act(skipTicket, t, "تم تخطي الدور.")}
                      >
                        تخطي
                      </Button>
                    </>
                  )}
                  {t.status === "in_progress" && (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<CheckCircleIcon className="size-4" />}
                      loading={busy}
                      onClick={() => act(completeTicket, t, "تم إنهاء الكشف.")}
                    >
                      إنهاء الكشف
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
