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

  const aiChannelCount = report?.breakdown.by_channel.find((c) => c.channel === "ai_chat")?.count ?? 0;

  return (
    <div className="page">
      <p className="settings-hint">
        أداء المساعد الذكي بالمحادثات والحجوزات خلال الفترة المحددة — بيانات حقيقية من سجل المحادثات
        والحجوزات، مش تقديرية.
      </p>
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
          <table className="data-table">
            <tbody>
              <tr>
                <td>إجمالي المحادثات</td>
                <td>{report.ai_chat.total_conversations}</td>
              </tr>
              <tr>
                <td>حجوزات عبر الشات بوت</td>
                <td>{aiChannelCount || report.ai_chat.bookings}</td>
              </tr>
              <tr>
                <td>محادثات تم تحويلها لموظف</td>
                <td>
                  {report.ai_chat.escalated_to_human} ({report.ai_chat.escalation_rate}%)
                </td>
              </tr>
              <tr>
                <td>فشل مزوّد الذكاء الاصطناعي (OpenAI/Gemini)</td>
                <td>{report.ai_chat.provider_failures}</td>
              </tr>
            </tbody>
          </table>

          <p className="settings-hint">
            ملاحظة: "محادثات تم تحويلها لموظف" بتشمل أي سبب تحويل (كلمة تصعيد، وصول الحد الأقصى للردود، أو
            فشل تقني بالمزوّد) — لمعرفة السبب بالتحديد راجعي صفحة المحادثات.
          </p>
        </>
      )}
    </div>
  );
}
