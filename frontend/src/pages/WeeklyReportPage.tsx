import { useEffect, useState } from "react";
import { getDashboardReport } from "../api/reports";
import type { DashboardReport } from "../api/reports";
import { BarChart, Donut, Meter } from "../components/Charts";
import type { BarDatum, DonutSlice } from "../components/Charts";
import { formatDayMonth } from "../format";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "تيليجرام",
  whatsapp: "واتساب",
  instagram: "إنستجرام",
  messenger: "ماسنجر",
  web: "الموقع",
  phone: "هاتف",
  walk_in: "حضور مباشر",
  dashboard: "لوحة العيادة",
};

type StatProps = { value: string | number; label: string; tone: "violet" | "teal" | "amber" | "rose" };

function Stat({ value, label, tone }: StatProps) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

export function WeeklyReportPage() {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getDashboardReport({ date_from: daysAgoIso(7), date_to: new Date().toISOString() })
      .then(setReport)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const money = (amount: number) => `${amount} ${report?.financial.currency ?? ""}`;

  // The three outcomes a week's appointments actually land in. "Everything
  // else" is the remainder rather than a fourth query -- rescheduled, still
  // upcoming, no-show and the rest all belong to "not settled either way".
  const outcomeSlices = (r: DashboardReport): DonutSlice[] => {
    const other = Math.max(r.appointments.total - r.appointments.completed - r.appointments.cancelled, 0);
    return [
      { label: "مكتملة", value: r.appointments.completed, color: "var(--tone-teal)" },
      { label: "ملغاة", value: r.appointments.cancelled, color: "var(--tone-rose)" },
      { label: "غير ذلك", value: other, color: "var(--tone-violet)" },
    ];
  };

  const channelBars = (r: DashboardReport): BarDatum[] =>
    r.breakdown.by_channel.map((c) => ({
      label: CHANNEL_LABEL[c.channel] ?? c.channel,
      value: c.count,
      title: `${CHANNEL_LABEL[c.channel] ?? c.channel}: ${c.count}`,
    }));

  return (
    <div className="page dashboard">
      <div className="page-header">
        <div>
          <p className="page-header-title">التقرير الأسبوعي</p>
          <p className="page-header-subtitle">
            نفس التقرير اللي بينبعت تلقائياً كل أحد الساعة 8 صباحاً لبوت التنبيهات الشخصي لكل مدير — آخر 7
            أيام حتى الآن.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "..." : "تحديث"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !report && <p className="section-empty">...جاري تحميل التقرير</p>}

      {report && (
        <>
          <p className="settings-hint">
            الفترة: {formatDayMonth(report.period.date_from)} — {formatDayMonth(report.period.date_to)}
          </p>

          {/* Twelve numbers in three unlabelled rows read as one undifferentiated
              wall. Money, appointments and the assistant are separate questions
              and get separate cards. */}
          <div className="dash-split">
            <section className="dash-card" style={{ animationDelay: "0ms" }}>
              <header className="dash-card-header">
                <h2>المواعيد</h2>
                <span className="dash-card-note">{report.appointments.total} موعد بالفترة</span>
              </header>
              <Donut slices={outcomeSlices(report)} centerValue={report.appointments.total} centerLabel="موعد" />
            </section>

            <section className="dash-card" style={{ animationDelay: "60ms" }}>
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

          <section className="dash-card" style={{ animationDelay: "120ms" }}>
            <header className="dash-card-header">
              <h2>المال</h2>
              <span className="dash-card-note">بعملة {report.financial.currency}</span>
            </header>
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              <Stat value={money(report.financial.revenue)} label="الإيرادات" tone="teal" />
              <Stat value={money(report.financial.deposits)} label="العرابين" tone="violet" />
              <Stat value={money(report.financial.refunds)} label="مبالغ مُرجعة" tone="rose" />
              <Stat value={money(report.financial.cancellation_fees)} label="رسوم إلغاء" tone="amber" />
            </div>
          </section>

          <div className="dash-split">
            <section className="dash-card" style={{ animationDelay: "180ms" }}>
              <header className="dash-card-header">
                <h2>المحادثات حسب القناة</h2>
              </header>
              <BarChart data={channelBars(report)} emptyText="ما في محادثات بهاي الفترة." />
            </section>

            <section className="dash-card" style={{ animationDelay: "240ms" }}>
              <header className="dash-card-header">
                <h2>المساعد الذكي والمرضى</h2>
              </header>
              <div className="stat-grid" style={{ marginBottom: 14 }}>
                <Stat value={report.ai_chat.total_conversations} label="محادثات" tone="violet" />
                <Stat value={report.ai_chat.bookings} label="حجوزات عبر المساعد" tone="teal" />
                <Stat value={report.breakdown.new_patients} label="مرضى جدد" tone="amber" />
              </div>
              <Meter
                label="تحويل لموظف بشري"
                percent={report.ai_chat.escalation_rate}
                invert
                note={`${report.ai_chat.escalated_to_human} محادثة من ${report.ai_chat.total_conversations}`}
              />
              {report.ai_chat.provider_failures > 0 && (
                <p className="settings-hint" style={{ marginTop: 12 }}>
                  {report.ai_chat.provider_failures} مرة فشل فيها مزوّد الذكاء الاصطناعي — المحادثة بتتحوّل
                  لموظف تلقائياً بهاي الحالة.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
