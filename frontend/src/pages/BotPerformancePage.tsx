import { useEffect, useState } from "react";
import { getDashboardReport } from "../api/reports";
import type { DashboardReport } from "../api/reports";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export function BotPerformancePage() {
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30).slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getDashboardReport({ date_from: `${dateFrom}T00:00:00Z`, date_to: `${dateTo}T23:59:59Z` })
      .then(setReport)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const aiChannelCount = report?.breakdown?.by_channel?.find((c) => c.channel === "ai_chat")?.count ?? 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">أداء المساعد الذكي</p>
          <p className="page-header-subtitle">
            أداء المساعد الذكي بالمحادثات والحجوزات خلال الفترة المحددة — بيانات حقيقية من سجل المحادثات
            والحجوزات، مش تقديرية.
          </p>
        </div>
      </div>

      <div className="data-form">
        <label>
          من
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          إلى
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "..." : "تحديث"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">{report.ai_chat.total_conversations}</div>
              <div className="stat-card-label">إجمالي المحادثات</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{aiChannelCount || report.ai_chat.bookings}</div>
              <div className="stat-card-label">حجوزات عبر الشات بوت</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">
                {report.ai_chat.escalated_to_human} ({report.ai_chat.escalation_rate}%)
              </div>
              <div className="stat-card-label">محادثات تم تحويلها لموظف</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{report.ai_chat.provider_failures}</div>
              <div className="stat-card-label">فشل مزوّد الذكاء الاصطناعي</div>
            </div>
          </div>

          <p className="settings-hint">
            ملاحظة: "محادثات تم تحويلها لموظف" بتشمل أي سبب تحويل (كلمة تصعيد، وصول الحد الأقصى للردود، أو
            فشل تقني بالمزوّد) — لمعرفة السبب بالتحديد راجعي صفحة المحادثات.
          </p>
        </>
      )}
    </div>
  );
}
