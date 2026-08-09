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
import { BarChart, Donut, Sparkline } from "../components/Charts";
import type { DonutSlice } from "../components/Charts";
import { bucketLabel, statusBadgeClass, statusBucket, statusLabel } from "../statusLabels";

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

function dayKey(d: Date) {
  // Local calendar day. toISOString() would shift across midnight in Amman.
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" });
}

/** Icons are inline so the dashboard adds no network requests and the strokes
 *  inherit currentColor along with the card's accent. */
function Icon({ name }: { name: "calendar" | "wallet" | "chat" | "package" }) {
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
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

type KpiProps = {
  icon: "calendar" | "wallet" | "chat" | "package";
  tone: "violet" | "teal" | "amber" | "rose";
  value: number;
  label: string;
  hint?: string;
  trend?: number[];
  onClick: () => void;
  delay: number;
};

function KpiCard({ icon, tone, value, label, hint, trend, onClick, delay }: KpiProps) {
  return (
    <button className={`kpi-card tone-${tone}`} onClick={onClick} style={{ animationDelay: `${delay}ms` }}>
      <span className="kpi-icon">
        <Icon name={icon} />
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {trend && trend.length > 1 && <Sparkline values={trend} color={`var(--tone-${tone})`} label={`${label}: اتجاه آخر ${TREND_DAYS} أيام`} />}
      {hint && <span className="kpi-hint">{hint}</span>}
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
  }, []);

  const { today, week, buckets, weekTotal } = useMemo(() => {
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
        title: `${d.toLocaleDateString("ar-JO", { day: "numeric", month: "long" })}: ${count} موعد`,
      });
    }

    const counts = { upcoming: 0, inClinic: 0, done: 0, lost: 0 };
    for (const a of todayList) counts[statusBucket(a.status)] += 1;

    return {
      today: todayList,
      week: days,
      buckets: counts,
      weekTotal: days.reduce((sum, d) => sum + d.value, 0),
    };
  }, [appointments]);

  const greeting = new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير";
  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";
  const doctorName = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.full_name ?? "—") : "—");

  const donutSlices: DonutSlice[] = [
    { label: bucketLabel.upcoming, value: buckets.upcoming, color: "var(--tone-violet)" },
    { label: bucketLabel.inClinic, value: buckets.inClinic, color: "var(--tone-amber)" },
    { label: bucketLabel.done, value: buckets.done, color: "var(--tone-teal)" },
    { label: bucketLabel.lost, value: buckets.lost, color: "var(--tone-rose)" },
  ];

  const loading = appointments === null;

  return (
    <div className="page dashboard">
      <div className="page-header">
        <div>
          <p className="page-header-title">
            {greeting}، {staffName}
          </p>
          <p className="page-header-subtitle">
            {new Date().toLocaleDateString("ar-JO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        {!loading && (
          <KpiCard
            icon="calendar"
            tone="violet"
            value={today.length}
            label="مواعيد اليوم"
            hint={`${weekTotal} خلال آخر ${TREND_DAYS} أيام`}
            trend={week.map((d) => d.value)}
            onClick={() => onNavigate("appointments")}
            delay={0}
          />
        )}
        {pendingPayments !== null && (
          <KpiCard
            icon="wallet"
            tone="teal"
            value={pendingPayments}
            label="دفعات بانتظار المراجعة"
            hint={pendingPayments > 0 ? "بحاجة تأكيد منك" : "ما في شي معلّق"}
            onClick={() => onNavigate("payments")}
            delay={60}
          />
        )}
        {attention !== null && (
          <KpiCard
            icon="chat"
            tone="amber"
            value={attention}
            label="محادثات محتاجة موظف"
            hint={attention > 0 ? "المريض مستني رد" : "كل المحادثات مغطّاة"}
            onClick={() => onNavigate("inbox")}
            delay={120}
          />
        )}
        {expiringPackages !== null && (
          <KpiCard
            icon="package"
            tone="rose"
            value={expiringPackages}
            label="باقات قاربت على الانتهاء"
            hint="خلال ٣ أيام"
            onClick={() => onNavigate("packages")}
            delay={180}
          />
        )}
      </div>

      <div className="dash-split">
        <section className="dash-card" style={{ animationDelay: "220ms" }}>
          <header className="dash-card-header">
            <h2>حركة المواعيد</h2>
            <span className="dash-card-note">آخر {TREND_DAYS} أيام</span>
          </header>
          <BarChart data={week} emptyText="ما في مواعيد مسجّلة بهذه الفترة." />
        </section>

        <section className="dash-card" style={{ animationDelay: "280ms" }}>
          <header className="dash-card-header">
            <h2>حالات مواعيد اليوم</h2>
          </header>
          <Donut slices={donutSlices} centerValue={today.length} centerLabel="موعد" />
        </section>
      </div>

      <section className="dash-card" style={{ animationDelay: "340ms" }}>
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
