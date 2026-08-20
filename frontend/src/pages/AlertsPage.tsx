import { useEffect, useMemo, useState } from "react";
import { listPayments } from "../api/payments";
import type { Payment } from "../api/payments";
import { listConversations } from "../api/conversations";
import type { ConversationSummary } from "../api/conversations";
import { listPatientPackages } from "../api/packages";
import type { PatientPackage } from "../api/packages";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { branchTimeZoneMap, formatDateShort, formatDateTimeShort } from "../format";

const EXPIRING_WITHIN_DAYS = 3;

const channelLabel: Record<string, string> = {
  whatsapp: "واتساب",
  telegram: "تيليجرام",
  instagram: "إنستجرام",
  messenger: "ماسنجر",
  twilio: "Twilio",
  web: "دردشة الموقع",
};

export function AlertsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [expiringPackages, setExpiringPackages] = useState<PatientPackage[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A submitted receipt or an expiring package is tied to its own branch's
  // calendar, not the viewer's -- see format.ts's TimeZoneOpt comment.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);

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
      listBranches().catch(() => []),
    ])
      .then(([paymentList, conversationList, packageList, patientList, branchList]) => {
        setPayments(paymentList);
        setConversations(conversationList);
        setExpiringPackages(packageList);
        setPatients(patientList);
        setBranches(branchList);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">التنبيهات</p>
          <p className="page-header-subtitle">لمحة سريعة على كل شي محتاج انتباهك الآن — بدون ما تتنقلي بين الصفحات.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-value">{payments.length}</div>
          <div className="stat-card-label">دفعات بانتظار المراجعة</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{conversations.length}</div>
          <div className="stat-card-label">محادثات محتاجة موظف</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{expiringPackages.length}</div>
          <div className="stat-card-label">باقات قاربت على الانتهاء</div>
        </div>
      </div>

      <h2>دفعات بانتظار المراجعة ({payments.length})</h2>
      {payments.length === 0 ? (
        <p className="section-empty">ولا دفعة بانتظار المراجعة.</p>
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
                <td>
                  {p.submitted_at ? formatDateTimeShort(p.submitted_at, branchTz[p.branch_id ?? ""]) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>محادثات محتاجة موظف ({conversations.length})</h2>
      {conversations.length === 0 ? (
        <p className="section-empty">ولا محادثة محتاجة تدخّل بشري الآن.</p>
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
                <td>{channelLabel[c.channel_type] ?? c.channel_type}</td>
                <td>{c.last_message_preview ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>باقات قاربت على الانتهاء (خلال {EXPIRING_WITHIN_DAYS} أيام) ({expiringPackages.length})</h2>
      {expiringPackages.length === 0 ? (
        <p className="section-empty">ولا باقة قاربت على الانتهاء.</p>
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
                <td>{formatDateShort(pp.expires_at, branchTz[pp.branch_id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
