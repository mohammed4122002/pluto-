import { useEffect, useState } from "react";
import { getDashboardReport } from "../api/reports";
import type { DashboardReport } from "../api/reports";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
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

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ar-JO", { day: "numeric", month: "long" });

  return (
    <div className="page">
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

      {report && (
        <>
          <p className="settings-hint">
            الفترة: {fmtDate(report.period.date_from)} — {fmtDate(report.period.date_to)}
          </p>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">{report.appointments.total}</div>
              <div className="stat-card-label">إجمالي المواعيد</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.appointments.completed}</div>
              <div className="stat-card-label">مكتملة</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.appointments.cancelled}</div>
              <div className="stat-card-label">ملغاة</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.appointments.confirmation_rate}%</div>
              <div className="stat-card-label">معدل التأكيد</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.appointments.no_show_rate}%</div>
              <div className="stat-card-label">معدل عدم الحضور</div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">
                {report.financial.revenue} {report.financial.currency}
              </div>
              <div className="stat-card-label">الإيرادات</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">
                {report.financial.deposits} {report.financial.currency}
              </div>
              <div className="stat-card-label">العرابين</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">
                {report.financial.refunds} {report.financial.currency}
              </div>
              <div className="stat-card-label">مبالغ مُرجعة</div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">{report.ai_chat.total_conversations}</div>
              <div className="stat-card-label">محادثات المساعد الذكي</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.ai_chat.bookings}</div>
              <div className="stat-card-label">حجوزات عبر المساعد الذكي</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">
                {report.ai_chat.escalated_to_human} ({report.ai_chat.escalation_rate}%)
              </div>
              <div className="stat-card-label">تحويل لموظف بشري</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.breakdown.new_patients}</div>
              <div className="stat-card-label">مرضى جدد</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
