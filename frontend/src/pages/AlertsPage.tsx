import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { branchTimeZoneMap, formatDateShort, formatDateTimeShort, formatMoney, formatNumber } from "../format";
import { AlertIcon, CheckCircleIcon, InboxIcon, PackageIcon, PaymentIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageBody,
  PageHeader,
  StatCard,
  StatGrid,
} from "../ui";
import type { Column } from "../ui";

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
  // Router navigation, not a location assignment: these links stay inside the
  // app shell instead of reloading the whole bundle.
  const navigate = useNavigate();
  // A submitted receipt or an expiring package is tied to its own branch's
  // calendar, not the viewer's -- see format.ts's TimeZoneOpt comment.
  const branchTz = useMemo(() => branchTimeZoneMap(branches), [branches]);

  useEffect(() => {
    setLoading(true);
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
      .finally(() => setLoading(false));
  }, []);

  const patientName = (id: string) => patients.find((p) => p.id === id)?.full_name ?? "—";
  const total = payments.length + conversations.length + expiringPackages.length;

  const paymentColumns: Column<Payment>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      cell: (p) => <span className="font-semibold text-heading">{p.patient_name ?? patientName(p.patient_id)}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      align: "end",
      sortValue: (p) => p.amount,
      cell: (p) => <span className="font-bold text-heading tabular-nums">{formatMoney(p.amount, p.currency)}</span>,
    },
    {
      key: "submitted",
      header: "أُرسلت بتاريخ",
      sortValue: (p) => p.submitted_at,
      cell: (p) => (
        <span className="whitespace-nowrap tabular-nums">
          {p.submitted_at ? formatDateTimeShort(p.submitted_at, branchTz[p.branch_id ?? ""]) : "—"}
        </span>
      ),
    },
  ];

  const conversationColumns: Column<ConversationSummary>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      cell: (c) => <span className="font-semibold text-heading">{c.patient_name}</span>,
    },
    {
      key: "channel",
      header: "القناة",
      cell: (c) => <Badge tone="brand">{channelLabel[c.channel_type] ?? c.channel_type}</Badge>,
    },
    {
      key: "last",
      header: "آخر رسالة",
      cell: (c) => <span className="line-clamp-1 text-[13px] text-muted">{c.last_message_preview ?? "—"}</span>,
    },
  ];

  const packageColumns: Column<PatientPackage>[] = [
    {
      key: "patient",
      header: "المريض",
      primary: true,
      cell: (pp) => <span className="font-semibold text-heading">{patientName(pp.patient_id)}</span>,
    },
    {
      key: "remaining",
      header: "الجلسات المتبقية",
      align: "end",
      sortValue: (pp) => pp.sessions_remaining,
      cell: (pp) => <span className="font-bold text-heading tabular-nums">{formatNumber(pp.sessions_remaining)}</span>,
    },
    {
      key: "expires",
      header: "تنتهي بتاريخ",
      sortValue: (pp) => pp.expires_at,
      cell: (pp) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateShort(pp.expires_at, branchTz[pp.branch_id])}
        </span>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="التشغيل اليومي"
        title="التنبيهات"
        description="لمحة سريعة على كل شي محتاج انتباهك الآن — بدون ما تتنقل بين الصفحات."
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard
          index={0}
          label="دفعات بانتظار المراجعة"
          value={payments.length}
          icon={<PaymentIcon />}
          tone="amber"
          loading={loading}
        />
        <StatCard
          index={1}
          label="محادثات محتاجة موظف"
          value={conversations.length}
          icon={<InboxIcon />}
          tone="rose"
          loading={loading}
        />
        <StatCard
          index={2}
          label="باقات قاربت على الانتهاء"
          value={expiringPackages.length}
          icon={<PackageIcon />}
          tone="teal"
          loading={loading}
          hint={`خلال ${EXPIRING_WITHIN_DAYS} أيام`}
        />
      </StatGrid>

      {!loading && total === 0 && (
        <Card>
          <EmptyState
            icon={<CheckCircleIcon />}
            title="ما في شي محتاج انتباهك"
            description="كل الدفعات مراجَعة، ما في محادثة محوّلة، وولا باقة قاربت على الانتهاء."
          />
        </Card>
      )}

      {(loading || payments.length > 0) && (
        <section className="flex flex-col gap-3">
          <CardHeader
            icon={<PaymentIcon />}
            title="دفعات بانتظار المراجعة"
            subtitle={`${formatNumber(payments.length)} دفعة`}
            actions={
              <Button size="sm" onClick={() => navigate("/payments")}>
                فتح المدفوعات
              </Button>
            }
          />
          <DataTable
            rows={payments}
            columns={paymentColumns}
            getRowKey={(p) => p.id}
            loading={loading}
            skeletonRows={3}
            initialSort={{ key: "submitted", dir: "asc" }}
          />
        </section>
      )}

      {(loading || conversations.length > 0) && (
        <section className="flex flex-col gap-3">
          <CardHeader
            icon={<InboxIcon />}
            title="محادثات محتاجة موظف"
            subtitle={`${formatNumber(conversations.length)} محادثة`}
            actions={
              <Button size="sm" onClick={() => navigate("/inbox")}>
                فتح المحادثات
              </Button>
            }
          />
          <DataTable
            rows={conversations}
            columns={conversationColumns}
            getRowKey={(c) => c.id}
            loading={loading}
            skeletonRows={3}
          />
        </section>
      )}

      {(loading || expiringPackages.length > 0) && (
        <section className="flex flex-col gap-3">
          <CardHeader
            icon={<PackageIcon />}
            title={`باقات قاربت على الانتهاء خلال ${EXPIRING_WITHIN_DAYS} أيام`}
            subtitle={`${formatNumber(expiringPackages.length)} باقة`}
            actions={
              <Button size="sm" onClick={() => navigate("/packages")}>
                فتح الباقات
              </Button>
            }
          />
          <DataTable
            rows={expiringPackages}
            columns={packageColumns}
            getRowKey={(pp) => pp.id}
            loading={loading}
            skeletonRows={3}
            initialSort={{ key: "expires", dir: "asc" }}
          />
        </section>
      )}

      {!loading && total > 0 && (
        <p className="px-1 text-center text-xs text-faint">
          <AlertIcon className="mb-0.5 inline size-3.5" /> التنبيهات بتتحدّث كل ما تفتح الصفحة.
        </p>
      )}
    </PageBody>
  );
}
