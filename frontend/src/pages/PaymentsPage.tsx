import { useEffect, useState } from "react";
import { applyCoupon, listPayments, refundPayment, rejectPayment, verifyPayment } from "../api/payments";
import type { Payment, PaymentStatus } from "../api/payments";
import { createInvoice } from "../api/invoices";

const tabs: { key: PaymentStatus; label: string }[] = [
  { key: "receipt_submitted", label: "بانتظار المراجعة" },
  { key: "pending", label: "بانتظار الإيصال" },
  { key: "verified", label: "مقبولة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "partially_refunded", label: "مسترجعة جزئياً" },
  { key: "refunded", label: "مسترجعة بالكامل" },
];

type Panel = { paymentId: string; kind: "reject" | "coupon" | "refund" };

export function PaymentsPage() {
  const [tab, setTab] = useState<PaymentStatus>("receipt_submitted");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [textValue, setTextValue] = useState("");
  const [amountValue, setAmountValue] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    listPayments(tab)
      .then(setPayments)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  const closePanel = () => {
    setPanel(null);
    setTextValue("");
    setAmountValue("");
  };

  const handleVerify = (id: string) => {
    verifyPayment(id)
      .then(load)
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleReject = (id: string) => {
    if (!textValue.trim()) return;
    rejectPayment(id, textValue)
      .then(() => {
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleApplyCoupon = (id: string) => {
    if (!textValue.trim()) return;
    applyCoupon(id, textValue.trim())
      .then((p) => {
        setNotice(`تم تطبيق الكوبون — المبلغ الجديد: ${p.amount}`);
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleRefund = (id: string) => {
    const amount = parseFloat(amountValue);
    if (!amount || !textValue.trim()) return;
    refundPayment(id, amount, textValue)
      .then(() => {
        setNotice("تم تسجيل الاسترجاع.");
        closePanel();
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleIssueInvoice = (p: Payment) => {
    if (!p.appointment_id) return;
    createInvoice(p.appointment_id)
      .then((inv) => setNotice(`تم إصدار فاتورة رقم ${inv.invoice_number} — الإجمالي ${inv.total}`))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <p className="settings-hint">
        عند تأكيد أي حجز له خدمة بسعر أو عربون محدد، بينشئ النظام تلقائياً سجل دفعة ويرسل تعليمات الدفع للمريض. هون
        بتقدر تراجع الإيصالات المرسلة وتعتمدها أو ترفضها، وتطبّق كوبونات، وتسترجع مبالغ، وتصدر فواتير.
      </p>

      <div className="inbox-filter">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "nav-item active" : "nav-item"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="settings-hint">
          {notice} <button onClick={() => setNotice(null)}>إخفاء</button>
        </p>
      )}
      {loading ? (
        <p>...جاري التحميل</p>
      ) : payments.length === 0 ? (
        <p className="inbox-empty">ما في دفعات بهاي الحالة حالياً.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>المريض</th>
              <th>رقم الحجز</th>
              <th>موعد الزيارة</th>
              <th>النوع</th>
              <th>المبلغ</th>
              <th>الإيصال</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <>
                <tr key={p.id}>
                  <td>
                    {p.patient_name}
                    <div className="import-hint">{p.patient_phone}</div>
                  </td>
                  <td>{p.appointment_number ?? (p.patient_package_id ? "باقة" : "—")}</td>
                  <td>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("ar") : "—"}</td>
                  <td>{p.payment_type}</td>
                  <td>
                    {p.amount} {p.currency}
                    {p.coupon_id && <div className="import-hint">بعد كوبون</div>}
                  </td>
                  <td>
                    {p.receipt_image_url ? (
                      <a href={p.receipt_image_url} target="_blank" rel="noreferrer">
                        عرض الإيصال
                      </a>
                    ) : (
                      "لم يُرسل بعد"
                    )}
                  </td>
                  <td>
                    {p.status === "pending" && (
                      <button onClick={() => setPanel({ paymentId: p.id, kind: "coupon" })}>تطبيق كوبون</button>
                    )}
                    {p.status === "receipt_submitted" && (
                      <>
                        <button onClick={() => handleVerify(p.id)}>قبول</button>
                        <button onClick={() => setPanel({ paymentId: p.id, kind: "reject" })}>رفض</button>
                      </>
                    )}
                    {p.status === "verified" && (
                      <>
                        <span className="badge active">تم القبول</span>
                        <button onClick={() => setPanel({ paymentId: p.id, kind: "refund" })}>استرجاع</button>
                        {p.appointment_id && <button onClick={() => handleIssueInvoice(p)}>إصدار فاتورة</button>}
                      </>
                    )}
                    {p.status === "partially_refunded" && (
                      <>
                        <span className="badge active">استرجاع جزئي</span>
                        <button onClick={() => setPanel({ paymentId: p.id, kind: "refund" })}>استرجاع إضافي</button>
                      </>
                    )}
                    {p.status === "refunded" && <span className="badge inactive">مسترجعة بالكامل</span>}
                    {p.status === "rejected" && <span className="badge inactive">{p.rejection_reason}</span>}
                  </td>
                </tr>
                {panel?.paymentId === p.id && (
                  <tr>
                    <td colSpan={7}>
                      <div className="data-form">
                        {panel.kind === "reject" && (
                          <>
                            <input placeholder="سبب الرفض" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
                            <button onClick={() => handleReject(p.id)}>تأكيد الرفض</button>
                          </>
                        )}
                        {panel.kind === "coupon" && (
                          <>
                            <input placeholder="كود الكوبون" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
                            <button onClick={() => handleApplyCoupon(p.id)}>تطبيق</button>
                          </>
                        )}
                        {panel.kind === "refund" && (
                          <>
                            <input
                              type="number"
                              placeholder="المبلغ"
                              value={amountValue}
                              onChange={(e) => setAmountValue(e.target.value)}
                            />
                            <input placeholder="السبب" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
                            <button onClick={() => handleRefund(p.id)}>تأكيد الاسترجاع</button>
                          </>
                        )}
                        <button onClick={closePanel}>إلغاء</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
