import { useEffect, useMemo, useState } from "react";
import { applyCoupon, listPayments, refundPayment, rejectPayment, verifyPayment } from "../api/payments";
import type { Payment, PaymentStatus } from "../api/payments";
import { createInvoice } from "../api/invoices";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { branchTimeZoneMap, formatDateTimeShort } from "../format";
import { CheckCircleIcon, CouponIcon, PaymentIcon, ReceiptIcon, RefreshIcon, SearchIcon, WalletIcon } from "../icons";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageBody,
  PageHeader,
  SegmentedControl,
  StatCard,
  StatGrid,
  TableToolbar,
  Textarea,
  useToast,
} from "../ui";
import type { BadgeTone, Column } from "../ui";

const tabs: { key: PaymentStatus; label: string }[] = [
  { key: "receipt_submitted", label: "بانتظار المراجعة" },
  { key: "pending", label: "بانتظار الإيصال" },
  { key: "verified", label: "مقبولة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "partially_refunded", label: "مسترجعة جزئياً" },
  { key: "refunded", label: "مسترجعة بالكامل" },
];

const paymentTypeLabel: Record<Payment["payment_type"], string> = {
  deposit: "عربون",
  full: "دفعة كاملة",
  balance: "باقي المبلغ",
  package: "باقة",
};

const statusMeta: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "بانتظار الإيصال", tone: "warning" },
  receipt_submitted: { label: "بانتظار المراجعة", tone: "info" },
  verified: { label: "مقبولة", tone: "success" },
  rejected: { label: "مرفوضة", tone: "danger" },
  refunded: { label: "مسترجعة بالكامل", tone: "neutral" },
  partially_refunded: { label: "استرجاع جزئي", tone: "amber" },
  cancelled: { label: "ملغاة", tone: "neutral" },
};

/** What is open on top of the table, if anything. Each action used to expand
 * an extra row inside the table -- which pushed every row below it down and
 * left the form competing with the columns for width. */
type ActionDialog =
  | { kind: "reject"; payment: Payment }
  | { kind: "coupon"; payment: Payment }
  | { kind: "refund"; payment: Payment }
  | { kind: "verify"; payment: Payment };

function money(amount: number, currency: string | null) {
  return `${amount.toLocaleString("ar-JO", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

export function PaymentsPage() {
  const [tab, setTab] = useState<PaymentStatus>("receipt_submitted");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [search, setSearch] = useState("");
  const toast = useToast();
  // A payment's scheduled_at is its appointment's real-world time at that
  // branch, not whatever timezone the browser reviewing it happens to be in
  // -- see format.ts's TimeZoneOpt comment for the live incident this fixes.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);

  useEffect(() => {
    listBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  const load = () => {
    setLoading(true);
    listPayments(tab)
      .then(setPayments)
      .catch((err) => toast.error(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  // Reloads on every tab change; `toast` is stable, and adding it would only
  // re-run this for a reason the screen doesn't have.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab]);

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const handleVerify = (id: string) =>
    verifyPayment(id)
      .then(() => {
        toast.success("تم قبول الدفعة.");
        setDialog(null);
        load();
      })
      .catch(fail);

  const handleIssueInvoice = (p: Payment) => {
    if (!p.appointment_id) return;
    createInvoice(p.appointment_id)
      .then((inv) => toast.success(`تم إصدار فاتورة رقم ${inv.invoice_number} — الإجمالي ${inv.total}`))
      .catch(fail);
  };

  const q = search.trim().toLowerCase();
  const rows = q
    ? payments.filter(
        (p) =>
          (p.patient_name ?? "").toLowerCase().includes(q) || (p.patient_phone ?? "").includes(q),
      )
    : payments;

  const total = rows.reduce((sum, p) => sum + p.amount, 0);
  const currency = rows[0]?.currency ?? "";
  const withReceipt = rows.filter((p) => p.receipt_image_url).length;
  const couponed = rows.filter((p) => p.coupon_id).length;

  const columns: Column<Payment>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      sortValue: (p) => p.patient_name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{p.patient_name ?? "—"}</div>
          {p.patient_phone && (
            <div className="text-xs text-muted" dir="ltr">
              {p.patient_phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "appointment",
      header: "رقم الحجز",
      secondary: true,
      sortValue: (p) => p.appointment_number,
      cell: (p) => (
        <span className="text-[13px] tabular-nums">
          {p.appointment_number ?? (p.patient_package_id ? "باقة" : "—")}
        </span>
      ),
    },
    {
      key: "scheduled",
      header: "موعد الزيارة",
      sortValue: (p) => p.scheduled_at,
      cell: (p) => (
        <span className="text-[13px] whitespace-nowrap">
          {p.scheduled_at ? formatDateTimeShort(p.scheduled_at, branchTz[p.branch_id ?? ""]) : "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "النوع",
      secondary: true,
      sortValue: (p) => p.payment_type,
      cell: (p) => <Badge>{paymentTypeLabel[p.payment_type] ?? p.payment_type}</Badge>,
    },
    {
      key: "amount",
      header: "المبلغ",
      align: "end",
      sortValue: (p) => p.amount,
      cell: (p) => (
        <div className="text-end">
          <div className="font-bold text-heading tabular-nums">{money(p.amount, p.currency)}</div>
          {p.coupon_id && <div className="text-xs text-teal">بعد كوبون</div>}
        </div>
      ),
    },
    {
      key: "receipt",
      header: "الإيصال",
      cell: (p) =>
        p.receipt_image_url ? (
          <a
            href={p.receipt_image_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand no-underline hover:underline"
          >
            <ReceiptIcon className="size-4" />
            عرض الإيصال
          </a>
        ) : (
          <span className="text-[13px] text-faint">لم يُرسل بعد</span>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (p) => statusMeta[p.status]?.label,
      cell: (p) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={statusMeta[p.status]?.tone ?? "neutral"} dot>
            {statusMeta[p.status]?.label ?? p.status}
          </Badge>
          {p.status === "rejected" && p.rejection_reason && (
            <span className="text-xs text-muted">{p.rejection_reason}</span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "إجراء",
      align: "end",
      cell: (p) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {p.status === "pending" && (
            <Button size="sm" icon={<CouponIcon className="size-4" />} onClick={() => setDialog({ kind: "coupon", payment: p })}>
              تطبيق كوبون
            </Button>
          )}
          {p.status === "receipt_submitted" && (
            <>
              <Button
                size="sm"
                variant="primary"
                icon={<CheckCircleIcon className="size-4" />}
                onClick={() => setDialog({ kind: "verify", payment: p })}
              >
                قبول
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => setDialog({ kind: "reject", payment: p })}>
                رفض
              </Button>
            </>
          )}
          {(p.status === "verified" || p.status === "partially_refunded") && (
            <>
              <Button size="sm" onClick={() => setDialog({ kind: "refund", payment: p })}>
                {p.status === "verified" ? "استرجاع" : "استرجاع إضافي"}
              </Button>
              {p.appointment_id && p.status === "verified" && (
                <Button size="sm" variant="soft" icon={<ReceiptIcon className="size-4" />} onClick={() => handleIssueInvoice(p)}>
                  إصدار فاتورة
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="المدفوعات والفوترة"
        description="عند تأكيد أي حجز له خدمة بسعر أو عربون محدد، ينشئ النظام سجل دفعة ويرسل تعليمات الدفع للمريض. من هنا تراجع الإيصالات وتعتمدها أو ترفضها، وتطبّق الكوبونات، وتسجّل الاسترجاعات، وتصدر الفواتير."
        actions={
          <Button variant="inverse-ghost" icon={<RefreshIcon className="size-4" />} onClick={load} loading={loading}>
            تحديث
          </Button>
        }
      >
        <SegmentedControl items={tabs} value={tab} onChange={setTab} onBrand />
      </PageHeader>

      <StatGrid>
        <StatCard
          label="عدد الدفعات"
          value={rows.length}
          icon={<PaymentIcon />}
          tone="brand"
          loading={loading}
          hint={statusMeta[tab].label}
        />
        <StatCard
          label="إجمالي المبالغ"
          value={money(total, currency)}
          icon={<WalletIcon />}
          tone="teal"
          loading={loading}
        />
        <StatCard
          label="إيصالات مرفوعة"
          value={withReceipt}
          icon={<ReceiptIcon />}
          tone="amber"
          loading={loading}
          hint={`من أصل ${rows.length}`}
        />
        <StatCard
          label="دفعات عليها كوبون"
          value={couponed}
          icon={<CouponIcon />}
          tone="rose"
          loading={loading}
        />
      </StatGrid>

      <TableToolbar>
        <Input
          className="w-full sm:w-80"
          label="بحث"
          placeholder="بحث باسم المريض أو الهاتف..."
          icon={<SearchIcon />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </TableToolbar>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(p) => p.id}
        loading={loading}
        initialSort={{ key: "scheduled", dir: "desc" }}
        empty={
          <EmptyState
            icon={<PaymentIcon />}
            title={q ? "ما في دفعات مطابقة للبحث" : "ما في دفعات بهذه الحالة"}
            description={
              q
                ? "جرّب اسماً أو رقم هاتف مختلفاً، أو امسح البحث لعرض كل دفعات هذه الحالة."
                : "بمجرد ما يتأكد حجز له سعر أو عربون، بتظهر دفعته هنا للمراجعة."
            }
            action={q ? <Button onClick={() => setSearch("")}>مسح البحث</Button> : undefined}
          />
        }
      />

      {dialog?.kind === "verify" && (
        <ConfirmDialog
          title="قبول الدفعة"
          description={`سيتم اعتماد دفعة ${dialog.payment.patient_name ?? ""} بمبلغ ${money(dialog.payment.amount, dialog.payment.currency)}.`}
          confirmLabel="قبول الدفعة"
          tone="primary"
          onConfirm={() => handleVerify(dialog.payment.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reject" && (
        <RejectDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={load} onFail={fail} toast={toast} />
      )}
      {dialog?.kind === "coupon" && (
        <CouponDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={load} onFail={fail} toast={toast} />
      )}
      {dialog?.kind === "refund" && (
        <RefundDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={load} onFail={fail} toast={toast} />
      )}
    </PageBody>
  );
}

type DialogProps = {
  payment: Payment;
  onClose: () => void;
  onDone: () => void;
  onFail: (err: { response?: { data?: { detail?: string } }; message: string }) => void;
  toast: ReturnType<typeof useToast>;
};

function RejectDialog({ payment, onClose, onDone, onFail, toast }: DialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!reason.trim()) return;
    setBusy(true);
    rejectPayment(payment.id, reason)
      .then(() => {
        toast.success("تم رفض الدفعة وإبلاغ المريض.");
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="رفض الدفعة"
      description={`${payment.patient_name ?? "المريض"} — ${money(payment.amount, payment.currency)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={submit}>
            تأكيد الرفض
          </Button>
        </>
      }
    >
      <Textarea
        label="سبب الرفض"
        required
        autoFocus
        placeholder="مثال: الإيصال غير واضح، أو المبلغ المحوّل أقل من المطلوب."
        hint="السبب بينرسل للمريض مع طلب إعادة إرسال الإيصال."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}

function CouponDialog({ payment, onClose, onDone, onFail, toast }: DialogProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!code.trim()) return;
    setBusy(true);
    applyCoupon(payment.id, code.trim())
      .then((p) => {
        toast.success(`تم تطبيق الكوبون — المبلغ الجديد: ${money(p.amount, p.currency)}`);
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="تطبيق كوبون"
      description={`${payment.patient_name ?? "المريض"} — المبلغ الحالي ${money(payment.amount, payment.currency)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" loading={busy} disabled={!code.trim()} onClick={submit}>
            تطبيق الكوبون
          </Button>
        </>
      }
    >
      <Input
        label="كود الكوبون"
        required
        autoFocus
        placeholder="مثال: WELCOME20"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </Dialog>
  );
}

function RefundDialog({ payment, onClose, onDone, onFail, toast }: DialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = parseFloat(amount);
  const valid = parsed > 0 && parsed <= payment.amount && reason.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    setBusy(true);
    refundPayment(payment.id, parsed, reason)
      .then(() => {
        toast.success("تم تسجيل الاسترجاع.");
        onClose();
        onDone();
      })
      .catch(onFail)
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title="تسجيل استرجاع"
      description={`${payment.patient_name ?? "المريض"} — الدفعة الأصلية ${money(payment.amount, payment.currency)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>
            تأكيد الاسترجاع
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="المبلغ المسترجع"
          required
          autoFocus
          type="number"
          inputMode="decimal"
          min={0}
          max={payment.amount}
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={
            amount && (!(parsed > 0) || parsed > payment.amount)
              ? `المبلغ لازم يكون بين 0 و${payment.amount}`
              : undefined
          }
          hint={`الحد الأعلى: ${money(payment.amount, payment.currency)}`}
        />
        <Textarea
          label="سبب الاسترجاع"
          required
          rows={2}
          placeholder="مثال: إلغاء الموعد ضمن مهلة السياسة."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
