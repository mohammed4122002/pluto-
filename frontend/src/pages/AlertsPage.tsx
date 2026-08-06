import { useEffect, useState } from "react";
import { listPayments } from "../api/payments";
import type { Payment } from "../api/payments";
import { listConversations } from "../api/conversations";
import type { ConversationSummary } from "../api/conversations";
import { listPatientPackages } from "../api/packages";
import type { PatientPackage } from "../api/packages";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";

const EXPIRING_WITHIN_DAYS = 3;

export function AlertsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [expiringPackages, setExpiringPackages] = useState<PatientPackage[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Each section needs a different permission (payment.view/conversation.view/
    // package.view) -- a staff member missing one of those shouldn't blank the
    // whole page, just show fewer sections.
    Promise.all([
      listPayments("receipt_submitted").catch(() => []),
      listConversations(true).catch(() => []),
      listPatientPackages({ expiring_within_days: EXPIRING_WITHIN_DAYS }).catch(() => []),
      listPatients().catch(() => []),
    ])
      .then(([paymentList, conversationList, packageList, patientList]) => {
        setPayments(paymentList);
        setConversations(conversationList);
        setExpiringPackages(packageList);
        setPatients(patientList);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      <p className="settings-hint">لمحة سريعة على كل شي محتاج انتباهك الآن — بدون ما تتنقلي بين الصفحات.</p>

      <h2>دفعات بانتظار المراجعة ({payments.length})</h2>
      {payments.length === 0 ? (
        <p className="inbox-empty">ولا دفعة بانتظار المراجعة.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>المبلغ</th>
              <th>أُرسلت بتاريخ</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.patient_name ?? patientName(p.patient_id)}</td>
                <td>
                  {p.amount} {p.currency}
                </td>
                <td>{p.submitted_at ? new Date(p.submitted_at).toLocaleString("ar-JO") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>محادثات محتاجة موظف ({conversations.length})</h2>
      {conversations.length === 0 ? (
        <p className="inbox-empty">ولا محادثة محتاجة تدخّل بشري الآن.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>القناة</th>
              <th>آخر رسالة</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id}>
                <td>{c.patient_name}</td>
                <td>{c.channel_type}</td>
                <td>{c.last_message_preview ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>باقات قاربت على الانتهاء (خلال {EXPIRING_WITHIN_DAYS} أيام) ({expiringPackages.length})</h2>
      {expiringPackages.length === 0 ? (
        <p className="inbox-empty">ولا باقة قاربت على الانتهاء.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>الجلسات المتبقية</th>
              <th>تنتهي بتاريخ</th>
            </tr>
          </thead>
          <tbody>
            {expiringPackages.map((pp) => (
              <tr key={pp.id}>
                <td>{patientName(pp.patient_id)}</td>
                <td>{pp.sessions_remaining}</td>
                <td>{new Date(pp.expires_at).toLocaleDateString("ar-JO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
