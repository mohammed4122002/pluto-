import { useEffect, useState } from "react";
import { listAppointments } from "../api/appointments";
import type { Appointment } from "../api/appointments";
import { listPayments } from "../api/payments";
import { listConversations } from "../api/conversations";
import { listPatientPackages } from "../api/packages";

type HomePageProps = {
  staffName: string;
  onNavigate: (key: string) => void;
};

type QuickLink = { key: string; label: string; requires?: string };

const QUICK_LINKS: QuickLink[] = [
  { key: "inbox", label: "المحادثات" },
  { key: "appointments", label: "المواعيد" },
  { key: "payments", label: "المدفوعات" },
  { key: "patients", label: "المرضى" },
  { key: "queue", label: "الطابور والانتظار" },
  { key: "alerts", label: "كل التنبيهات" },
];

export function HomePage({ staffName, onNavigate }: HomePageProps) {
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState<number | null>(null);
  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [expiringPackagesCount, setExpiringPackagesCount] = useState<number | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // Each stat needs a different permission -- a staff member missing one
    // just sees fewer cards, same graceful-degradation approach as AlertsPage.
    listAppointments()
      .then((all) => {
        const today = all.filter((a) => new Date(a.scheduled_at).toDateString() === new Date().toDateString());
        setTodayCount(today.length);
        setTodayAppointments(today.slice(0, 6));
      })
      .catch(() => {});
    listPayments("receipt_submitted")
      .then((p) => setPendingPaymentsCount(p.length))
      .catch(() => {});
    listConversations(true)
      .then((c) => setAttentionCount(c.length))
      .catch(() => {});
    listPatientPackages({ expiring_within_days: 3 })
      .then((p) => setExpiringPackagesCount(p.length))
      .catch(() => {});
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "صباح الخير";
    if (hour < 17) return "مساء الخير";
    return "مساء الخير";
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">
            {greeting()}، {staffName.split(" ")[0]}
          </p>
          <p className="page-header-subtitle">لمحة سريعة على وضع العيادة اليوم.</p>
        </div>
      </div>

      <div className="stat-grid">
        {todayCount !== null && (
          <button className="stat-card" onClick={() => onNavigate("appointments")} style={{ cursor: "pointer", textAlign: "start" }}>
            <div className="stat-card-value">{todayCount}</div>
            <div className="stat-card-label">مواعيد اليوم</div>
          </button>
        )}
        {pendingPaymentsCount !== null && (
          <button className="stat-card" onClick={() => onNavigate("payments")} style={{ cursor: "pointer", textAlign: "start" }}>
            <div className="stat-card-value">{pendingPaymentsCount}</div>
            <div className="stat-card-label">دفعات بانتظار المراجعة</div>
          </button>
        )}
        {attentionCount !== null && (
          <button className="stat-card" onClick={() => onNavigate("inbox")} style={{ cursor: "pointer", textAlign: "start" }}>
            <div className="stat-card-value">{attentionCount}</div>
            <div className="stat-card-label">محادثات محتاجة موظف</div>
          </button>
        )}
        {expiringPackagesCount !== null && (
          <button className="stat-card" onClick={() => onNavigate("packages")} style={{ cursor: "pointer", textAlign: "start" }}>
            <div className="stat-card-value">{expiringPackagesCount}</div>
            <div className="stat-card-label">باقات قاربت على الانتهاء</div>
          </button>
        )}
      </div>

      {todayAppointments.length > 0 && (
        <>
          <h2 style={{ marginBottom: 10 }}>أقرب مواعيد اليوم</h2>
          <table className="data-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>الموعد</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {todayAppointments.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.scheduled_at).toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <button onClick={() => onNavigate("appointments")}>عرض</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ marginBottom: 10 }}>روابط سريعة</h2>
      <div className="stat-grid">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.key}
            className="stat-card"
            onClick={() => onNavigate(link.key)}
            style={{ cursor: "pointer", textAlign: "start" }}
          >
            <div className="stat-card-label" style={{ margin: 0, fontWeight: 600, color: "var(--text-h)" }}>
              {link.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
