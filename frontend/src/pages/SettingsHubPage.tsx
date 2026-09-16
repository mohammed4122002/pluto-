import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { StaffMe } from "../api/auth";
import { SettingsPage } from "./SettingsPage";
import { CancellationPoliciesPage } from "./CancellationPoliciesPage";
import { EscalationStaffPage } from "./EscalationStaffPage";
import { StaffBotSettingsPage } from "./StaffBotSettingsPage";
import { NotificationSettingsPage } from "./NotificationSettingsPage";
import { ImportPage } from "./ImportPage";
import { AlertIcon, BellIcon, ImportIcon, SettingsIcon, StaffIcon, XCircleIcon } from "../icons";
import { Card, EmptyState, PageBody, PageHeader, SideTabs } from "../ui";
import type { TabItem } from "../ui";

/** The ten former "النظام" nav rows, gathered into one screen.
 *
 * Each section is the page that used to own a nav entry, rendered unchanged
 * -- this is a navigation change, not a rewrite of what configuring a clinic
 * involves. What it buys: a 22-row sidebar drops to 14, and the settings
 * that belong together are now one URL apart instead of scattered down a
 * list that also holds the daily work. */
type Section = {
  key: string;
  label: string;
  description: string;
  requires: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  render: (staff: StaffMe) => React.ReactNode;
};

const SECTIONS: readonly Section[] = [
  {
    key: "clinic",
    label: "إعدادات العيادة",
    description: "الاسم، ساعات العمل، الحجز وقواعد المواعيد.",
    requires: "clinic_settings.view",
    Icon: SettingsIcon,
    render: () => <SettingsPage />,
  },
  {
    key: "cancellation",
    label: "سياسات الإلغاء",
    description: "مهل الإلغاء والرسوم المترتبة عليها.",
    requires: "clinic_settings.view",
    Icon: XCircleIcon,
    render: () => <CancellationPoliciesPage />,
  },
  {
    key: "escalation",
    label: "فريق التصعيد",
    description: "من يستلم الحالات التي يحوّلها المساعد الذكي.",
    requires: "clinic_settings.view",
    Icon: AlertIcon,
    render: () => <EscalationStaffPage />,
  },
  {
    key: "staff-bot",
    label: "بوت التنبيهات",
    description: "تنبيهات الموظفين على واتساب وقنوات العمل.",
    requires: "clinic_settings.update",
    Icon: StaffIcon,
    render: () => <StaffBotSettingsPage />,
  },
  {
    key: "notifications",
    label: "رسائل وتنبيهات آلية",
    description: "التذكيرات والرسائل التي ترسل للمرضى تلقائياً.",
    requires: "clinic_settings.update",
    Icon: BellIcon,
    render: () => <NotificationSettingsPage />,
  },
  {
    key: "import",
    label: "استيراد بيانات",
    description: "رفع المرضى والمواعيد من ملف خارجي.",
    requires: "import.execute",
    Icon: ImportIcon,
    render: () => <ImportPage />,
  },
];

export function SettingsHubPage({ staff }: { staff: StaffMe }) {
  const { section } = useParams();
  const navigate = useNavigate();

  const allowed = useMemo(
    () => SECTIONS.filter((s) => staff.permissions.includes(s.requires)),
    [staff.permissions],
  );

  const active = allowed.find((s) => s.key === section) ?? allowed[0];
  const items: TabItem[] = allowed.map((s) => ({
    key: s.key,
    label: s.label,
    icon: <s.Icon />,
  }));

  return (
    <PageBody>
      <PageHeader
        title="الإعدادات"
        description="كل ما يضبط سلوك العيادة في مكان واحد — المواعيد، السياسات، الرسائل الآلية والبيانات."
      />
      {!active ? (
        <Card>
          <EmptyState
            icon={<SettingsIcon />}
            title="لا توجد إعدادات متاحة لك"
            description="صلاحياتك الحالية لا تشمل أي قسم من أقسام الإعدادات. تواصل مع مدير النظام."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
          <Card padded={false} className="p-2 lg:sticky lg:top-24">
            <SideTabs
              items={items}
              value={active.key}
              onChange={(key) => navigate(`/settings/${key}`)}
            />
          </Card>
          <Card>
            <div className="mb-4 border-b border-line pb-3">
              <h2 className="text-[15px] font-bold text-heading">{active.label}</h2>
            </div>
            <div className="embedded-page">{active.render(staff)}</div>
          </Card>
        </div>
      )}
    </PageBody>
  );
}
