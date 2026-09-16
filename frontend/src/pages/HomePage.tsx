import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { listAppointments } from "../api/appointments";
import type { Appointment } from "../api/appointments";
import { listPayments } from "../api/payments";
import { listConversations } from "../api/conversations";
import { listPatientPackages } from "../api/packages";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { getDashboardReport } from "../api/reports";
import type { DashboardReport } from "../api/reports";
import { BarChart, Donut, Funnel, Heatmap, Meter, RankedList, Sparkline } from "../components/Charts";
import type { DonutSlice, HeatmapCell } from "../components/Charts";
import { bookingSourceLabel, bucketLabel, statusBucket, statusLabel, statusTone } from "../statusLabels";
import { branchTimeZoneMap, formatAmount, formatDayMonth, formatFullDate, formatMoney, formatTime } from "../format";
import {
  AiIcon,
  AppointmentIcon,
  CheckCircleIcon,
  InboxIcon,
  PackageIcon,
  PatientIcon,
  PaymentIcon,
  QueueIcon,
  WaitlistIcon,
  WalletIcon,
} from "../icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageBody,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  cn,
} from "../ui";

type HomePageProps = {
  staffName: string;
  onNavigate: (key: string) => void;
};

const QUICK_LINKS = [
  { key: "inbox", label: "المحادثات", Icon: InboxIcon },
  { key: "appointments", label: "المواعيد", Icon: AppointmentIcon },
  { key: "calendar", label: "التقويم", Icon: AppointmentIcon },
  { key: "payments", label: "المدفوعات", Icon: PaymentIcon },
  { key: "patients", label: "المرضى", Icon: PatientIcon },
  { key: "queue", label: "الطابور والانتظار", Icon: QueueIcon },
  { key: "alerts", label: "كل التنبيهات", Icon: AiIcon },
];

const TREND_DAYS = 7;
const WEEKDAY = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

// The report's demand_heatmap follows Python's datetime.weekday() (0 = Monday
// ... 6 = Sunday). Re-ordered here to read Sunday-first, the week Jordan
// actually uses -- same convention WEEKDAY above already follows.
const HEATMAP_DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const HEATMAP_DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const PERIODS = [
  { key: "7", label: "٧ أيام" },
  { key: "30", label: "٣٠ يوم" },
  { key: "90", label: "٩٠ يوم" },
] as const;

function dayKey(d: Date) {
  // Local calendar day. toISOString() would shift across midnight in Amman.
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function clockTime(iso: string, timeZone?: string) {
  return formatTime(iso, timeZone);
}

/** Up/down/flat vs. the same-length period right before this one. null when
 *  there's nothing honest to compare against (no prior data at all). */
function KpiDelta({
  curr,
  prev,
  invert = false,
  isPoints = false,
}: {
  curr: number;
  prev: number | null;
  invert?: boolean;
  isPoints?: boolean;
}) {
  if (prev === null) return null;
  let dir: "up" | "down" | "flat";
  let text: string;
  if (isPoints) {
    const diff = Math.round((curr - prev) * 10) / 10;
    if (diff === 0) {
      dir = "flat";
      text = "بلا تغيير";
    } else {
      dir = diff > 0 ? "up" : "down";
      text = `${diff > 0 ? "+" : ""}${diff} نقطة`;
    }
  } else if (prev === 0) {
    if (curr === 0) return null;
    dir = "up";
    text = "جديد";
  } else {
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct === 0) {
      dir = "flat";
      text = "0%";
    } else {
      dir = pct > 0 ? "up" : "down";
      text = `${pct > 0 ? "+" : ""}${pct}%`;
    }
  }
  // More bookings is good; more no-shows is not. `invert` is what tells the
  // two apart -- the arrow direction alone can't.
  const good = dir === "flat" ? null : invert ? dir === "down" : dir === "up";
  const tone =
    good === null ? "bg-surface-2 text-muted" : good ? "bg-success-bg text-success" : "bg-danger-bg text-danger";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  return (
    // dir="ltr": an arrow glued to a number ("▲ +12%") has no strong RTL
    // character to anchor it, so the bidi algorithm reorders the arrow to
    // the wrong side of the number -- confirmed live, it rendered as "0% –"
    // for what was written as "– 0%". Isolating it in LTR keeps the arrow
    // where it was typed regardless of where the badge itself sits in the
    // surrounding RTL layout.
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", tone)}
      dir="ltr"
      title="مقارنة بنفس طول الفترة السابقة"
    >
      {arrow} {text}
    </span>
  );
}

function periodWindow(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - days * 86400000);
  return {
    date_from: from.toISOString(),
    date_to: to.toISOString(),
    prev_date_from: prevFrom.toISOString(),
    prev_date_to: prevTo.toISOString(),
  };
}

/** One number from the live strip: what is happening in the clinic right now,
 *  as opposed to the period KPIs above it. Each one is the filter it
 *  describes, so "3 دفعات بانتظار المراجعة" is also the way to go review them. */
function LiveTile({
  value,
  label,
  icon,
  onClick,
  loading,
}: {
  value: ReactNode;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[9rem] flex-1 cursor-pointer appearance-none items-center gap-3 rounded-xl border-0 bg-transparent p-3 text-start font-sans transition hover:bg-surface-2"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-bg text-brand [&_svg]:size-[18px]">
        {icon}
      </span>
      <span className="min-w-0">
        {loading ? (
          <Skeleton className="h-5 w-10" />
        ) : (
          <span className="block text-lg leading-6 font-extrabold text-heading tabular-nums">{value}</span>
        )}
        <span className="block truncate text-xs text-muted">{label}</span>
      </span>
    </button>
  );
}

export function HomePage({ staffName, onNavigate }: HomePageProps) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [attention, setAttention] = useState<number | null>(null);
  const [expiringPackages, setExpiringPackages] = useState<number | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  // A dashboard appointment time is its own branch's real-world time, not
  // the viewer's -- see format.ts's TimeZoneOpt comment. The "today" header
  // and heatmap aggregate across branches, so they fall back to the first
  // branch's zone -- every branch currently shares one, and using any single
  // consistent zone beats the viewer's own for a clinic-wide label.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);
  const defaultTz = branches[0]?.timezone;

  const [periodDays, setPeriodDays] = useState(7);
  const [branchId, setBranchId] = useState<string>("");
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [prevReport, setPrevReport] = useState<DashboardReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    // Each stat needs a different permission -- a staff member missing one
    // just sees fewer cards, same graceful-degradation approach as AlertsPage.
    listAppointments()
      .then(setAppointments)
      .catch(() => setAppointments([]));
    listPayments("receipt_submitted")
      .then((p) => setPendingPayments(p.length))
      .catch(() => {});
    listConversations(true)
      .then((c) => setAttention(c.length))
      .catch(() => {});
    listPatientPackages({ expiring_within_days: 3 })
      .then((p) => setExpiringPackages(p.length))
      .catch(() => {});
    listPatients()
      .then(setPatients)
      .catch(() => {});
    listStaffDirectory()
      .then(setStaff)
      .catch(() => {});
    listBranches()
      .then(setBranches)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const w = periodWindow(periodDays);
    const params = (from: string, to: string) => ({
      date_from: from,
      date_to: to,
      ...(branchId ? { branch_id: branchId } : {}),
    });
    setReportLoading(true);
    Promise.all([
      getDashboardReport(params(w.date_from, w.date_to)).catch(() => null),
      getDashboardReport(params(w.prev_date_from, w.prev_date_to)).catch(() => null),
    ])
      .then(([curr, prev]) => {
        setReport(curr);
        setPrevReport(prev);
      })
      .finally(() => setReportLoading(false));
  }, [periodDays, branchId]);

  const { today, week, buckets } = useMemo(() => {
    const all = appointments ?? [];
    const now = new Date();
    const todayKey = dayKey(now);
    const todayList = all
      .filter((a) => dayKey(new Date(a.scheduled_at)) === todayKey)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    // Oldest first; the charts render right-to-left from this order.
    const days: { label: string; value: number; title: string }[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const count = all.filter((a) => dayKey(new Date(a.scheduled_at)) === key).length;
      days.push({
        label: i === 0 ? "اليوم" : WEEKDAY[d.getDay()],
        value: count,
        title: `${formatDayMonth(d, defaultTz)}: ${count} موعد`,
      });
    }

    const counts = { upcoming: 0, inClinic: 0, done: 0, lost: 0 };
    for (const a of todayList) counts[statusBucket(a.status)] += 1;

    return { today: todayList, week: days, buckets: counts };
  }, [appointments, defaultTz]);

  const greeting = new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير";
  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";
  const doctorName = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.full_name ?? "—") : "—");
  const doctorInitial = (id: string | null) => {
    const name = id ? staff.find((s) => s.id === id)?.full_name : null;
    return name ? name.replace(/^د\.\s*/, "").trim()[0] ?? "؟" : "؟";
  };

  const donutSlices: DonutSlice[] = [
    { label: bucketLabel.upcoming, value: buckets.upcoming, color: "var(--tone-violet)" },
    { label: bucketLabel.inClinic, value: buckets.inClinic, color: "var(--tone-amber)" },
    { label: bucketLabel.done, value: buckets.done, color: "var(--tone-teal)" },
    { label: bucketLabel.lost, value: buckets.lost, color: "var(--tone-rose)" },
  ];

  const loading = appointments === null;
  const inClinicNow = today.filter((a) => statusBucket(a.status) === "inClinic").length;

  const money = (amount: number) => formatMoney(amount, report?.financial.currency);
  /** The same amount for a KPI tile: the figure at full size, the currency
   * beside it at label size, so a long total doesn't wrap onto two lines. */
  const moneyTile = (amount: number) => (
    <>
      {formatAmount(amount)}
      <span className="ms-1 text-[14px] font-semibold text-muted">{report?.financial.currency}</span>
    </>
  );

  const aiResolved = report
    ? Math.max(report.ai_chat.total_conversations - report.ai_chat.escalated_to_human - report.ai_chat.provider_failures, 0)
    : 0;
  const aiChatSlices: DonutSlice[] = report
    ? [
        { label: "تم حلها بالذكاء الاصطناعي", value: aiResolved, color: "var(--tone-teal)" },
        { label: "تم تحويلها لموظف", value: report.ai_chat.escalated_to_human, color: "var(--tone-amber)" },
        ...(report.ai_chat.provider_failures > 0
          ? [{ label: "فشل تقني بالمزوّد", value: report.ai_chat.provider_failures, color: "var(--tone-rose)" }]
          : []),
      ]
    : [];

  const revenueSlices: DonutSlice[] = report
    ? [
        { label: "الإيرادات المحصّلة", value: report.financial.revenue, color: "var(--tone-teal)" },
        { label: "العرابين", value: report.financial.deposits, color: "var(--tone-violet)" },
        { label: "رسوم إلغاء", value: report.financial.cancellation_fees, color: "var(--tone-amber)" },
      ]
    : [];
  const revenueTotal = report
    ? report.financial.revenue + report.financial.deposits + report.financial.cancellation_fees
    : 0;

  const topDoctors = report
    ? [...report.utilization.occupancy_by_doctor]
        .sort((a, b) => b.booked - a.booked)
        .slice(0, 5)
        .map((d) => ({
          label: d.doctor_name ?? "—",
          value: d.booked,
          sublabel: `${d.rate}% إشغال من ${d.total} موعد متاح`,
        }))
    : [];

  const topServices = report
    ? [...report.breakdown.by_service]
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((s) => ({ label: s.service_name ?? "خدمة محذوفة", value: s.count }))
    : [];

  const bookingSources = report
    ? [...report.breakdown.by_channel]
        .sort((a, b) => b.count - a.count)
        .map((c) => ({ label: bookingSourceLabel[c.channel] ?? c.channel, value: c.count }))
    : [];

  const heatmapCells: HeatmapCell[] = report
    ? report.demand_heatmap.map((c) => ({ day: HEATMAP_DAY_ORDER.indexOf(c.day_of_week), hour: c.hour, count: c.count }))
    : [];

  const trend = week.map((d) => d.value);

  return (
    <PageBody>
      <PageHeader
        eyebrow="لوحة العيادة"
        title={`${greeting}، ${staffName}`}
        description={formatFullDate(new Date(), defaultTz)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            items={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
            value={String(periodDays)}
            onChange={(key) => setPeriodDays(Number(key))}
            onBrand
          />
          {branches.length > 1 && (
            <Select
              className="h-9 w-48 border-white/25 bg-white/12 text-white [&>option]:text-heading"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label="الفرع"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </PageHeader>

      <StatGrid className="xl:grid-cols-5">
        <StatCard
          index={0}
          label="الإيرادات"
          value={report ? moneyTile(report.financial.revenue) : "—"}
          icon={<WalletIcon />}
          tone="teal"
          loading={reportLoading}
          delta={report && <KpiDelta curr={report.financial.revenue} prev={prevReport?.financial.revenue ?? null} />}
          onClick={() => onNavigate("payments")}
        />
        <StatCard
          index={1}
          label="المحادثات"
          value={report?.ai_chat.total_conversations ?? "—"}
          icon={<InboxIcon />}
          tone="brand"
          loading={reportLoading}
          delta={
            report && (
              <KpiDelta
                curr={report.ai_chat.total_conversations}
                prev={prevReport?.ai_chat.total_conversations ?? null}
              />
            )
          }
          onClick={() => onNavigate("inbox")}
        />
        <StatCard
          index={2}
          label="معدل عدم الحضور"
          value={report ? `${report.appointments.no_show_rate}%` : "—"}
          icon={<PatientIcon />}
          tone="rose"
          loading={reportLoading}
          delta={
            report && (
              <KpiDelta
                curr={report.appointments.no_show_rate}
                prev={prevReport?.appointments.no_show_rate ?? null}
                invert
                isPoints
              />
            )
          }
          onClick={() => onNavigate("appointments")}
        />
        <StatCard
          index={3}
          label="الحجوزات المؤكدة"
          value={report?.appointments.confirmed ?? "—"}
          icon={<CheckCircleIcon />}
          tone="amber"
          loading={reportLoading}
          delta={
            report && (
              <KpiDelta curr={report.appointments.confirmed} prev={prevReport?.appointments.confirmed ?? null} />
            )
          }
          onClick={() => onNavigate("appointments")}
        />
        <StatCard
          index={4}
          label="إجمالي الحجوزات"
          value={report?.appointments.total ?? "—"}
          icon={<AppointmentIcon />}
          tone="brand"
          loading={reportLoading}
          delta={
            report && <KpiDelta curr={report.appointments.total} prev={prevReport?.appointments.total ?? null} />
          }
          chart={
            trend.length > 1 ? (
              <Sparkline values={trend} color="var(--tone-violet)" label={`إجمالي الحجوزات: اتجاه آخر ${TREND_DAYS} أيام`} />
            ) : undefined
          }
          onClick={() => onNavigate("appointments")}
        />
      </StatGrid>

      <Card padded={false} className="px-2 py-1">
        <div className="flex flex-wrap items-stretch divide-line sm:divide-x sm:divide-x-reverse">
          <LiveTile
            value={inClinicNow}
            label="مريض داخل العيادة الآن"
            icon={<QueueIcon />}
            loading={loading}
            onClick={() => onNavigate("appointments")}
          />
          {attention !== null && (
            <LiveTile
              value={attention}
              label="محادثات محتاجة موظف"
              icon={<InboxIcon />}
              onClick={() => onNavigate("inbox")}
            />
          )}
          {pendingPayments !== null && (
            <LiveTile
              value={pendingPayments}
              label="دفعات بانتظار المراجعة"
              icon={<PaymentIcon />}
              onClick={() => onNavigate("payments")}
            />
          )}
          {report && (
            <LiveTile
              value={report.waitlist.current_count}
              label="بقائمة الانتظار"
              icon={<WaitlistIcon />}
              onClick={() => onNavigate("waitlist")}
            />
          )}
          {expiringPackages !== null && (
            <LiveTile
              value={expiringPackages}
              label="باقات قاربت على الانتهاء"
              icon={<PackageIcon />}
              onClick={() => onNavigate("packages")}
            />
          )}
        </div>
      </Card>

      {report && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="قمع الحجوزات" subtitle={`آخر ${periodDays} يوم`} />
            <div className="mt-4">
              <Funnel
                stages={[
                  { label: "محادثات", value: report.ai_chat.total_conversations },
                  { label: "حجوزات بدأت", value: report.appointments.total },
                  { label: "حجوزات مؤكدة", value: report.appointments.confirmed },
                  { label: "حجوزات مكتملة", value: report.appointments.completed },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="أداء المساعد الذكي" subtitle="نسبة ما حُل تلقائياً" />
            <div className="mt-4">
              <Donut
                slices={aiChatSlices}
                centerValue={
                  report.ai_chat.total_conversations
                    ? Math.round((aiResolved / report.ai_chat.total_conversations) * 100)
                    : 0
                }
                centerLabel="% تلقائي"
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="مصادر الحجز" />
            <div className="mt-4">
              <RankedList items={bookingSources} color="var(--tone-violet)" emptyText="ما في حجوزات بهذه الفترة." />
            </div>
          </Card>
        </div>
      )}

      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="أعلى الأطباء إشغالاً" subtitle="حسب المواعيد المحجوزة بالفترة" />
            <div className="mt-4">
              <RankedList items={topDoctors} color="var(--tone-teal)" emptyText="ما في بيانات إشغال بهذه الفترة." />
            </div>
          </Card>

          <Card>
            <CardHeader title="الخدمات الأكثر طلباً" />
            <div className="mt-4">
              <RankedList items={topServices} color="var(--tone-amber)" emptyText="ما في حجوزات بهذه الفترة." />
            </div>
          </Card>
        </div>
      )}

      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="تفصيل الإيرادات" subtitle={`بعملة ${report.financial.currency}`} />
            <div className="mt-4">
              <Donut slices={revenueSlices} centerValue={revenueTotal} centerLabel={report.financial.currency} />
              {report.financial.refunds > 0 && (
                <p className="mt-3 text-center text-[13px] text-muted">
                  استُرجع {money(report.financial.refunds)} خلال هذه الفترة.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="المعدلات" subtitle="مقارنة بأهداف العيادة" />
            <div className="mt-4">
              <Meter
                label="معدل التأكيد"
                percent={report.appointments.confirmation_rate}
                note={`${report.appointments.confirmed} موعد مؤكد من ${report.appointments.total}`}
              />
              <Meter label="معدل عدم الحضور" percent={report.appointments.no_show_rate} invert />
              <Meter label="معدل إعادة الجدولة" percent={report.appointments.rescheduling_rate} invert color="var(--tone-amber)" />
            </div>
          </Card>
        </div>
      )}

      {report && (
        <Card>
          <CardHeader title="أفضل أوقات الحجز" subtitle="كثافة الطلب حسب اليوم والساعة" />
          {/* Capped: the heatmap's cells stretch to whatever width they are
              given, and on a wide screen a full-bleed grid of 7x12 squares
              reads as wallpaper rather than as data. */}
          <div className="mt-4 max-w-4xl">
            <Heatmap
              cells={heatmapCells}
              dayLabels={HEATMAP_DAY_LABELS}
              emptyText="ما في بيانات كافية لعرض الخريطة الحرارية."
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="حركة المواعيد" subtitle={`آخر ${TREND_DAYS} أيام`} />
          <div className="mt-4">
            <BarChart data={week} emptyText="ما في مواعيد مسجّلة بهذه الفترة." />
          </div>
        </Card>

        <Card>
          <CardHeader title="حالات مواعيد اليوم" />
          <div className="mt-4">
            <Donut slices={donutSlices} centerValue={today.length} centerLabel="موعد" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="جدول اليوم"
          subtitle={today.length > 0 ? `${today.length} موعد` : undefined}
          actions={
            today.length > 0 ? (
              <Button size="sm" onClick={() => onNavigate("appointments")}>
                عرض الكل
              </Button>
            ) : undefined
          }
        />
        {loading ? (
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : today.length === 0 ? (
          <EmptyState
            compact
            icon={<AppointmentIcon />}
            title="ما في مواعيد اليوم"
            description="يوم هادئ — أو وقت مناسب للاتصال بقائمة الانتظار."
            action={
              <Button size="sm" onClick={() => onNavigate("waitlist")}>
                فتح قائمة الانتظار
              </Button>
            }
          />
        ) : (
          <ul className="mt-3 flex list-none flex-col p-0">
            {today.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
              >
                <span className="w-16 shrink-0 text-[13px] font-bold text-muted tabular-nums">
                  {clockTime(a.scheduled_at, branchTz[a.branch_id])}
                </span>
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-bg text-[13px] font-bold text-brand"
                  aria-hidden="true"
                >
                  {doctorInitial(a.staff_id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-heading">
                    {patientName(a.patient_id)}
                  </span>
                  <span className="block truncate text-xs text-muted">{doctorName(a.staff_id)}</span>
                </span>
                <Badge tone={statusTone[a.status]} dot>
                  {statusLabel[a.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS.map((link) => (
          <Button key={link.key} icon={<link.Icon className="size-4" />} onClick={() => onNavigate(link.key)}>
            {link.label}
          </Button>
        ))}
      </div>
    </PageBody>
  );
}
