import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { StaffMe } from "../api/auth";
import { BotPerformancePage } from "./BotPerformancePage";
import { WeeklyReportPage } from "./WeeklyReportPage";
import { AiIcon, ReportIcon } from "../icons";
import { Card, EmptyState, PageBody, PageHeader, SideTabs } from "../ui";

const SECTIONS = [
  {
    key: "bot",
    label: "أداء المساعد الذكي",
    description: "معدل الردود، التحويل للموظفين، وجودة المحادثات.",
    requires: "bot_performance.view",
    Icon: AiIcon,
    render: () => <BotPerformancePage />,
  },
  {
    key: "weekly",
    label: "التقرير الأسبوعي",
    description: "ملخص أسبوع العيادة: الحجوزات، الإلغاءات والتحصيل.",
    requires: "bot_performance.view",
    Icon: ReportIcon,
    render: () => <WeeklyReportPage />,
  },
] as const;

export function ReportsHubPage({ staff }: { staff: StaffMe }) {
  const { section } = useParams();
  const navigate = useNavigate();

  const allowed = useMemo(
    () => SECTIONS.filter((s) => staff.permissions.includes(s.requires)),
    [staff.permissions],
  );
  const active = allowed.find((s) => s.key === section) ?? allowed[0];

  return (
    <PageBody>
      <PageHeader
        title="التقارير والأداء"
        description="كيف يسير أسبوع العيادة، وكيف يتصرف المساعد الذكي نيابة عنك."
      />
      {!active ? (
        <Card>
          <EmptyState
            icon={<ReportIcon />}
            title="لا توجد تقارير متاحة لك"
            description="صلاحياتك الحالية لا تشمل عرض التقارير."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
          <Card padded={false} className="p-2 lg:sticky lg:top-24">
            <SideTabs
              items={allowed.map((s) => ({ key: s.key, label: s.label, icon: <s.Icon /> }))}
              value={active.key}
              onChange={(key) => navigate(`/reports/${key}`)}
            />
          </Card>
          <Card>
            <div className="mb-4 border-b border-line pb-3">
              <h2 className="text-[15px] font-bold text-heading">{active.label}</h2>
            </div>
            <div className="embedded-page">{active.render()}</div>
          </Card>
        </div>
      )}
    </PageBody>
  );
}
