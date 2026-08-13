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
import { bookingSourceLabel, bucketLabel, statusBadgeClass, statusBucket, statusLabel } from "../statusLabels";
import { formatDayMonth, formatFullDate, formatTime } from "../format";

type HomePageProps = {
  staffName: string;
  onNavigate: (key: string) => void;
};

const QUICK_LINKS = [
  { key: "inbox", label: "المحادثات" },
  { key: "appointments", label: "المواعيد" },
  { key: "calendar", label: "التقويم" },
  { key: "payments", label: "المدفوعات" },
  { key: "patients", label: "المرضى" },
  { key: "queue", label: "الطابور والانتظار" },
  { key: "alerts", label: "كل التنبيهات" },
];

const TREND_DAYS = 7;
const WEEKDAY = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

// The report's demand_heatmap follows Python's datetime.weekday() (0 = Monday
// ... 6 = Sunday). Re-ordered here to read Sunday-first, the week Jordan
// actually uses -- same convention WEEKDAY above already follows.
const HEATMAP_DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const HEATMAP_DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const PERIODS = [
  { key: 7, label: "٧ أيام" },
  { key: 30, label: "٣٠ يوم" },
  { key: 90, label: "٩٠ يوم" },
];

function dayKey(d: Date) {
  // Local calendar day. toISOString() would shift across midnight in Amman.
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function clockTime(iso: string) {
  return formatTime(iso);
}

/** Icons are inline so the dashboard adds no network requests and the strokes
 *  inherit currentColor along with the card's accent. */
function Icon({ name }: { name: "calendar" | "wallet" | "chat" | "package" | "check" | "userAlert" }) {
  const paths: Record<string, ReactNode> = {
    calendar: (
      <>
        <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
        <path d="M3 8.5h14M6.5 2.5v3M13.5 2.5v3" />
      </>
    ),
    wallet: (
      <>
        <rect x="2.5" y="5" width="15" height="11" rx="2.5" />
        <path d="M2.5 9h15M13 12.5h1.5" />
      </>
    ),
    chat: <path d="M17 10.5c0 3.3-3.1 6-7 6-.9 0-1.8-.1-2.6-.4L3 17.5l1.3-3.2A5.7 5.7 0 0 1 3 10.5c0-3.3 3.1-6 7-6s7 2.7 7 6Z" />,
    package: (
      <>
        <path d="M10 2.8 17 6.4v7.2L10 17.2 3 13.6V6.4l7-3.6Z" />
        <path d="M3 6.4 10 10l7-3.6M10 10v7.2" />
      </>
    ),
    check: (
      <>
        <circle cx="10" cy="10" r="7.3" />
        <path d="M6.8 10.2 8.9 12.3 13.3 7.7" />
      </>
    ),
    userAlert: (
      <>
        <circle cx="8.2" cy="6.8" r="3" />
        <path d="M2.8 17c.4-3.4 2.8-5.2 5.4-5.2 1 0 1.9.25 2.7.7" />
        <circle cx="15" cy="14" r="3.6" />
        <path d="M15 12.2v2.1" />
        <circle cx="15" cy="16.3" r=".15" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** Up/down/flat vs. the same-length period right before this one. null when
 *  there's nothing honest to compare against (no prior data at all). */
function KpiDelta({ curr, prev, invert = false, isPoints = false }: { curr: number; prev: number | null; invert?: boolean; isPoints?: boolean }) {
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
  const good = dir === "flat" ? null : invert ? dir === "down" : dir === "up";
  const cls = dir === "flat" ? "flat" : good ? "positive" : "negative";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  return (
    // dir="ltr": an arrow glued to a number ("▲ +12%") has no strong RTL
    // character to anchor it, so the bidi algorithm reorders the arrow to
    // the wrong side of the number -- confirmed live, it rendered as "0% –"
    // for what was written as "– 0%". Isolating it in LTR keeps the arrow
    // where it was typed regardless of where the badge itself sits in the
    // surrounding RTL layout.
    <span className={`kpi-delta ${cls}`} dir="ltr" title="مقارنة بنفس طول الفترة السابقة">
      {arrow} {text}
    </span>
  );
}

type KpiProps = {
  icon: "calendar" | "wallet" | "chat" | "package" | "check" | "userAlert";
  tone: "violet" | "teal" | "amber" | "rose";
  value: ReactNode;
  label: string;
  hint?: string;
  trend?: number[];
  delta?: ReactNode;
  onClick: () => void;
  delay: number;
};

function KpiCard({ icon, tone, value, label, hint, trend, delta, onClick, delay }: KpiProps) {
  return (
    <button className={`kpi-card tone-${tone}`} onClick={onClick} style={{ animationDelay: `${delay}ms` }}>
      <span className="kpi-card-top">
        <span className="kpi-icon">
          <Icon name={icon} />
        </span>
        {delta}
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {trend && trend.length > 1 && <Sparkline values={trend} color={`var(--tone-${tone})`} label={`${label}: اتجاه آخر ${TREND_DAYS} أيام`} />}
      {hint && <span className="kpi-hint">{hint}</span>}
    </button>
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

export function HomePage({ staffName, onNavigate }: HomePageProps) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [attention, setAttention] = useState<number | null>(null);
  const [expiringPackages, setExpiringPackages] = useState<number | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

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
        title: `${formatDayMonth(d)}: ${count} موعد`,
      });
    }

    const counts = { upcoming: 0, inClinic: 0, done: 0, lost: 0 };
    for (const a of todayList) counts[statusBucket(a.status)] += 1;

    return { today: todayList, week: days, buckets: counts };
  }, [appointments]);

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

  const money = (amount: number) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${report?.financial.currency ?? ""}`.trim();

  const aiResolved = report ? Math.max(report.ai_chat.total_conversations - report.ai_chat.escalated_to_human - report.ai_chat.provider_failures, 0) : 0;
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
  const revenueTotal = report ? report.financial.revenue + report.financial.deposits + report.financial.cancellation_fees : 0;

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

  return (
    <div className="page dashboard">
      <div className="page-header">
        <div>
          <p className="page-header-title">
            {greeting}، {staffName}
          </p>
          <p className="page-header-subtitle">{formatFullDate(new Date())}</p>
        </div>
        <div className="dash-filters">
          <div className="period-pills">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={periodDays === p.key ? "period-pill active" : "period-pill"}
                onClick={() => setPeriodDays(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {branches.length > 1 && (
            <select className="branch-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {report && (
        <div className={reportLoading ? "kpi-grid loading" : "kpi-grid"}>
          <KpiCard
            icon="wallet"
            tone="teal"
            value={money(report.financial.revenue)}
            label="الإيرادات"
            delta={<KpiDelta curr={report.financial.revenue} prev={prevReport?.financial.revenue ?? null} />}
            onClick={() => onNavigate("payments")}
            delay={0}
          />
          <KpiCard
            icon="chat"
            tone="violet"
            value={report.ai_chat.total_conversations}
            label="المحادثات"
            delta={<KpiDelta curr={report.ai_chat.total_conversations} prev={prevReport?.ai_chat.total_conversations ?? null} />}
            onClick={() => onNavigate("inbox")}
            delay={60}
          />
          <KpiCard
            icon="userAlert"
            tone="rose"
            value={`${report.appointments.no_show_rate}%`}
            label="معدل عدم الحضور"
            delta={<KpiDelta curr={report.appointments.no_show_rate} prev={prevReport?.appointments.no_show_rate ?? null} invert isPoints />}
            onClick={() => onNavigate("appointments")}
            delay={120}
          />
          <KpiCard
            icon="check"
            tone="teal"
            value={report.appointments.confirmed}
            label="الحجوزات المؤكدة"
            delta={<KpiDelta curr={report.appointments.confirmed} prev={prevReport?.appointments.confirmed ?? null} />}
            onClick={() => onNavigate("appointments")}
            delay={180}
          />
          <KpiCard
            icon="calendar"
            tone="violet"
            value={report.appointments.total}
            label="إجمالي الحجوزات"
            delta={<KpiDelta curr={report.appointments.total} prev={prevReport?.appointments.total ?? null} />}
            onClick={() => onNavigate("appointments")}
            delay={240}
          />
        </div>
      )}

      <div className="live-strip">
        <button className="live-item" onClick={() => onNavigate("appointments")}>
          <span className="live-value">{inClinicNow}</span>
          <span className="live-label">مريض داخل العيادة الآن</span>
        </button>
        {attention !== null && (
          <button className="live-item" onClick={() => onNavigate("inbox")}>
            <span className="live-value">{attention}</span>
            <span className="live-label">محادثات محتاجة موظف</span>
          </button>
        )}
        {pendingPayments !== null && (
          <button className="live-item" onClick={() => onNavigate("payments")}>
            <span className="live-value">{pendingPayments}</span>
            <span className="live-label">دفعات بانتظار المراجعة</span>
          </button>
        )}
        {report && (
          <button className="live-item" onClick={() => onNavigate("waitlist")}>
            <span className="live-value">{report.waitlist.current_count}</span>
            <span className="live-label">بقائمة الانتظار</span>
          </button>
        )}
        {expiringPackages !== null && (
          <button className="live-item" onClick={() => onNavigate("packages")}>
            <span className="live-value">{expiringPackages}</span>
            <span className="live-label">باقات قاربت على الانتهاء</span>
          </button>
        )}
      </div>

      {report && (
        <div className="dash-triple">
          <section className="dash-card" style={{ animationDelay: "300ms" }}>
            <header className="dash-card-header">
              <h2>قمع الحجوزات</h2>
              <span className="dash-card-note">آخر {periodDays} يوم</span>
            </header>
            <Funnel
              stages={[
                { label: "محادثات", value: report.ai_chat.total_conversations },
                { label: "حجوزات بدأت", value: report.appointments.total },
                { label: "حجوزات مؤكدة", value: report.appointments.confirmed },
                { label: "حجوزات مكتملة", value: report.appointments.completed },
              ]}
            />
          </section>

          <section className="dash-card" style={{ animationDelay: "340ms" }}>
            <header className="dash-card-header">
              <h2>أداء المساعد الذكي</h2>
            </header>
            <Donut slices={aiChatSlices} centerValue={report.ai_chat.total_conversations ? Math.round((aiResolved / report.ai_chat.total_conversations) * 100) : 0} centerLabel="% تلقائي" />
          </section>

          <section className="dash-card" style={{ animationDelay: "380ms" }}>
            <header className="dash-card-header">
              <h2>مصادر الحجز</h2>
            </header>
            <RankedList items={bookingSources} color="var(--tone-violet)" emptyText="ما في حجوزات بهذه الفترة." />
          </section>
        </div>
      )}

      {report && (
        <div className="dash-split">
          <section className="dash-card" style={{ animationDelay: "420ms" }}>
            <header className="dash-card-header">
              <h2>أعلى الأطباء إشغالاً</h2>
              <span className="dash-card-note">حسب المواعيد المحجوزة بالفترة</span>
            </header>
            <RankedList items={topDoctors} color="var(--tone-teal)" emptyText="ما في بيانات إشغال بهذه الفترة." />
          </section>

          <section className="dash-card" style={{ animationDelay: "460ms" }}>
            <header className="dash-card-header">
              <h2>الخدمات الأكثر طلباً</h2>
            </header>
            <RankedList items={topServices} color="var(--tone-amber)" emptyText="ما في حجوزات بهذه الفترة." />
          </section>
        </div>
      )}

      {report && (
        <div className="dash-split">
          <section className="dash-card" style={{ animationDelay: "500ms" }}>
            <header className="dash-card-header">
              <h2>تفصيل الإيرادات</h2>
              <span className="dash-card-note">بعملة {report.financial.currency}</span>
            </header>
            <Donut slices={revenueSlices} centerValue={revenueTotal} centerLabel={report.financial.currency} />
            {report.financial.refunds > 0 && (
              <p className="revenue-refund-note">استُرجع {money(report.financial.refunds)} خلال هذه الفترة.</p>
            )}
          </section>

          <section className="dash-card" style={{ animationDelay: "540ms" }}>
            <header className="dash-card-header">
              <h2>المعدلات</h2>
            </header>
            <Meter
              label="معدل التأكيد"
              percent={report.appointments.confirmation_rate}
              note={`${report.appointments.confirmed} موعد مؤكد من ${report.appointments.total}`}
            />
            <Meter label="معدل عدم الحضور" percent={report.appointments.no_show_rate} invert />
            <Meter label="معدل إعادة الجدولة" percent={report.appointments.rescheduling_rate} invert color="var(--tone-amber)" />
          </section>
        </div>
      )}

      {report && (
        <section className="dash-card" style={{ animationDelay: "580ms" }}>
          <header className="dash-card-header">
            <h2>أفضل أوقات الحجز</h2>
            <span className="dash-card-note">كثافة الطلب حسب اليوم والساعة</span>
          </header>
          <Heatmap cells={heatmapCells} dayLabels={HEATMAP_DAY_LABELS} emptyText="ما في بيانات كافية لعرض الخريطة الحرارية." />
        </section>
      )}

      <div className="dash-split">
        <section className="dash-card" style={{ animationDelay: "620ms" }}>
          <header className="dash-card-header">
            <h2>حركة المواعيد</h2>
            <span className="dash-card-note">آخر {TREND_DAYS} أيام</span>
          </header>
          <BarChart data={week} emptyText="ما في مواعيد مسجّلة بهذه الفترة." />
        </section>

        <section className="dash-card" style={{ animationDelay: "660ms" }}>
          <header className="dash-card-header">
            <h2>حالات مواعيد اليوم</h2>
          </header>
          <Donut slices={donutSlices} centerValue={today.length} centerLabel="موعد" />
        </section>
      </div>

      <section className="dash-card" style={{ animationDelay: "700ms" }}>
        <header className="dash-card-header">
          <h2>جدول اليوم</h2>
          {today.length > 0 && (
            <button className="link-button" onClick={() => onNavigate("appointments")}>
              عرض الكل
            </button>
          )}
        </header>
        {loading ? (
          <p className="chart-empty">...جاري التحميل</p>
        ) : today.length === 0 ? (
          <p className="chart-empty">ما في مواعيد اليوم.</p>
        ) : (
          <ul className="agenda">
            {today.slice(0, 8).map((a) => (
              <li key={a.id} className="agenda-row">
                <span className="agenda-time">{clockTime(a.scheduled_at)}</span>
                <span className="agenda-avatar" aria-hidden>
                  {doctorInitial(a.staff_id)}
                </span>
                <span className="agenda-main">
                  <strong>{patientName(a.patient_id)}</strong>
                  <span className="agenda-sub">{doctorName(a.staff_id)}</span>
                </span>
                <span className={`badge ${statusBadgeClass[a.status]}`}>{statusLabel[a.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="quick-links">
        {QUICK_LINKS.map((link) => (
          <button key={link.key} className="quick-link" onClick={() => onNavigate(link.key)}>
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}
