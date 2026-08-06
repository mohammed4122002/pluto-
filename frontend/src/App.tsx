import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { HomePage } from "./pages/HomePage";
import { AlertsPage } from "./pages/AlertsPage";
import { InboxPage } from "./pages/InboxPage";
import { BranchesPage } from "./pages/BranchesPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ServicesPage } from "./pages/ServicesPage";
import { StaffPage } from "./pages/StaffPage";
import { PatientsPage } from "./pages/PatientsPage";
import { AppointmentsPage } from "./pages/AppointmentsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AiSettingsPage } from "./pages/AiSettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { WaitlistPage } from "./pages/WaitlistPage";
import { QueuePage } from "./pages/QueuePage";
import { PackagesPage } from "./pages/PackagesPage";
import { CouponsPage } from "./pages/CouponsPage";
import { CancellationPoliciesPage } from "./pages/CancellationPoliciesPage";
import { EscalationStaffPage } from "./pages/EscalationStaffPage";
import { BotPerformancePage } from "./pages/BotPerformancePage";
import { PatientDuplicatesPage } from "./pages/PatientDuplicatesPage";
import { SetupWizard } from "./pages/SetupWizard";
import { MyQueuePage } from "./pages/workspace/MyQueuePage";
import { MyCalendarPage } from "./pages/workspace/MyCalendarPage";
import { MyPatientsPage } from "./pages/workspace/MyPatientsPage";
import { MyServicesPage } from "./pages/workspace/MyServicesPage";
import { LoginPage } from "./pages/LoginPage";
import { getSetupStatus } from "./api/setup";
import { getMe } from "./api/auth";
import type { StaffMe } from "./api/auth";
import { getAttentionCount } from "./api/conversations";
import { StaffAlertsPage } from "./pages/StaffAlertsPage";
import { MyAccountPage } from "./pages/MyAccountPage";
import { getToken, setToken, setUnauthorizedHandler } from "./api/client";
import {
  InboxIcon,
  BranchIcon,
  ChannelIcon,
  ServiceIcon,
  StaffIcon,
  PatientIcon,
  AppointmentIcon,
  SettingsIcon,
  AiIcon,
  ImportIcon,
  PaymentIcon,
  CalendarIcon,
  WaitlistIcon,
  QueueIcon,
  PackageIcon,
  CouponIcon,
  DuplicatesIcon,
  AlertIcon,
  HomeIcon,
  MenuIcon,
} from "./icons";
import "./App.css";

type Tab = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
  requires: string;
};
type NavGroup = { label: string | null; items: readonly Tab[] };

const inboxTab: Tab = {
  key: "inbox",
  label: "المحادثات",
  Icon: InboxIcon,
  Component: InboxPage,
  requires: "conversation.view",
};

const adminGroups: readonly NavGroup[] = [
  {
    label: null,
    items: [inboxTab],
  },
  {
    label: "إدارة العيادة",
    items: [
      { key: "alerts", label: "التنبيهات", Icon: AlertIcon, Component: AlertsPage, requires: "payment.view" },
      { key: "appointments", label: "المواعيد", Icon: AppointmentIcon, Component: AppointmentsPage, requires: "appointment.view" },
      { key: "calendar", label: "التقويم", Icon: CalendarIcon, Component: CalendarPage, requires: "slot.view" },
      { key: "queue", label: "الطابور والانتظار", Icon: QueueIcon, Component: QueuePage, requires: "queue.view" },
      { key: "waitlist", label: "قائمة الانتظار", Icon: WaitlistIcon, Component: WaitlistPage, requires: "waitlist.view" },
      { key: "payments", label: "المدفوعات", Icon: PaymentIcon, Component: PaymentsPage, requires: "payment.view" },
      { key: "packages", label: "الباقات", Icon: PackageIcon, Component: PackagesPage, requires: "package.view" },
      { key: "coupons", label: "الكوبونات", Icon: CouponIcon, Component: CouponsPage, requires: "coupon.view" },
      { key: "patients", label: "المرضى", Icon: PatientIcon, Component: PatientsPage, requires: "patient.view" },
      { key: "patient-duplicates", label: "السجلات المكررة", Icon: DuplicatesIcon, Component: PatientDuplicatesPage, requires: "patient.merge" },
      { key: "staff", label: "الموظفين", Icon: StaffIcon, Component: StaffPage, requires: "staff.view" },
      { key: "services", label: "الخدمات", Icon: ServiceIcon, Component: ServicesPage, requires: "service.view" },
      { key: "branches", label: "الفروع", Icon: BranchIcon, Component: BranchesPage, requires: "branch.view" },
      { key: "channels", label: "القنوات", Icon: ChannelIcon, Component: ChannelsPage, requires: "channel.view" },
    ],
  },
  {
    label: "النظام",
    items: [
      { key: "settings", label: "إعدادات العيادة", Icon: SettingsIcon, Component: SettingsPage, requires: "clinic_settings.view" },
      {
        key: "cancellation-policies",
        label: "سياسات الإلغاء",
        Icon: SettingsIcon,
        Component: CancellationPoliciesPage,
        requires: "clinic_settings.view",
      },
      {
        key: "escalation-staff",
        label: "فريق التصعيد",
        Icon: AlertIcon,
        Component: EscalationStaffPage,
        requires: "clinic_settings.view",
      },
      { key: "ai-settings", label: "إعدادات الذكاء الاصطناعي", Icon: AiIcon, Component: AiSettingsPage, requires: "ai_settings.view" },
      { key: "bot-performance", label: "أداء المساعد الذكي", Icon: AiIcon, Component: BotPerformancePage, requires: "appointment.view" },
      { key: "import", label: "استيراد بيانات", Icon: ImportIcon, Component: ImportPage, requires: "patient.create" },
    ],
  },
];

// Self-scoped roles (the mirror of SELF_SCOPED_ROLES in backend
// app/core/scoping.py) get a workspace of their own rather than a
// permission-filtered slice of the admin dashboard. The filtered-admin
// approach is what produced the 403 cascade in the first place: every admin
// screen opens with clinic-wide lookups (/branches, /staff, /patients) these
// roles can't call, so the first one to fail took the whole page with it.
// These four screens read from /me/* instead, which is scoped server-side and
// resolves its own names.
const SELF_SCOPED_ROLES = new Set(["doctor"]);

const workspaceGroups: readonly NavGroup[] = [
  {
    label: null,
    items: [inboxTab],
  },
  {
    label: "شغلي",
    items: [
      { key: "my-queue", label: "طابوري", Icon: QueueIcon, Component: MyQueuePage, requires: "queue.view" },
      { key: "my-calendar", label: "تقويمي", Icon: CalendarIcon, Component: MyCalendarPage, requires: "slot.view" },
      { key: "my-patients", label: "مرضاي", Icon: PatientIcon, Component: MyPatientsPage, requires: "patient.view" },
      { key: "my-services", label: "خدماتي", Icon: ServiceIcon, Component: MyServicesPage, requires: "service.view" },
    ],
  },
];

// Not permission-gated like every other tab -- it's a light, graceful-
// degrading summary (each section hides itself if the viewer lacks that
// section's permission, same pattern as AlertsPage). Only shown to admin-
// style roles: self-scoped roles land straight in their workspace instead,
// since Home calls clinic-wide endpoints (/appointments, /payments, ...)
// that self-scoped roles can't call.
// HomePage needs staffName/onNavigate, unlike every other tab's
// no-props Component -- it never renders through the generic <Active />
// path below (that branch is skipped for key === "home"), so the cast is
// safe: nothing ever mounts HomePage without those props.
const homeTab: Tab = {
  key: "home",
  label: "الرئيسية",
  Icon: HomeIcon,
  Component: HomePage as unknown as ComponentType,
  requires: "",
};

function Dashboard({ staff, onLogout }: { staff: StaffMe; onLogout: () => void }) {
  const isSelfScoped = SELF_SCOPED_ROLES.has(staff.role);
  const groups = isSelfScoped ? workspaceGroups : adminGroups;
  const allTabs = groups.flatMap((g) => g.items);

  const visible = allTabs.filter((t) => staff.permissions.includes(t.requires));
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((t) => staff.permissions.includes(t.requires)) }))
    .filter((g) => g.items.length > 0);

  // A doctor's queue is the one thing they actually need every day -- land
  // them there directly instead of on whatever tab happens to be first.
  // Everyone else lands on the home summary instead of an arbitrary tab.
  const defaultTab = isSelfScoped ? visible.find((t) => t.key === "my-queue")?.key ?? visible[0]?.key : "home";
  const [tab, setTab] = useState<string | undefined>(defaultTab);
  const active = !isSelfScoped && tab === "home" ? homeTab : visible.find((t) => t.key === tab) ?? visible[0];

  const [showStaffAlerts, setShowStaffAlerts] = useState(false);
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectTab = (key: string) => {
    setTab(key);
    setMobileMenuOpen(false);
  };

  const canSeeInbox = visible.some((t) => t.key === "inbox");
  const [attentionCount, setAttentionCount] = useState(0);
  useEffect(() => {
    if (!canSeeInbox) return;
    const poll = () => getAttentionCount().then(setAttentionCount).catch(() => {});
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [canSeeInbox]);

  if (!active) {
    return (
      <div className="app-shell">
        <main className="page">
          <p>لا توجد لديك أي صلاحية عرض بعد. تواصل مع مدير النظام.</p>
        </main>
      </div>
    );
  }
  const Active = active.key === "home" ? null : active.Component;

  return (
    <div className={mobileMenuOpen ? "app-shell menu-open" : "app-shell"}>
      <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">ع</span>
          <span className="brand-name">لوحة العيادة</span>
        </div>
        <nav className="nav">
          {!isSelfScoped && (
            <div className="nav-group">
              <button className={active.key === "home" ? "nav-item active" : "nav-item"} onClick={() => selectTab("home")}>
                <HomeIcon className="nav-icon" />
                {homeTab.label}
              </button>
            </div>
          )}
          {visibleGroups.map((group, i) => (
            <div className="nav-group" key={group.label ?? `g${i}`}>
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((t) => (
                <button
                  key={t.key}
                  className={active.key === t.key ? "nav-item active" : "nav-item"}
                  onClick={() => selectTab(t.key)}
                >
                  <t.Icon className="nav-icon" />
                  {t.label}
                  {t.key === "inbox" && attentionCount > 0 && <span className="nav-badge">{attentionCount}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="nav-group" style={{ marginTop: "auto" }}>
          <div className="nav-group-label">{staff.full_name}</div>
          <button
            className="nav-item"
            onClick={() => {
              setShowMyAccount(true);
              setMobileMenuOpen(false);
            }}
          >
            حسابي
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setShowStaffAlerts(true);
              setMobileMenuOpen(false);
            }}
          >
            ربط بوت التنبيهات
          </button>
          <button className="nav-item" onClick={onLogout}>
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <div className="content-area">
        {showStaffAlerts ? (
          <main>
            <StaffAlertsPage onBack={() => setShowStaffAlerts(false)} />
          </main>
        ) : showMyAccount ? (
          <main>
            <MyAccountPage onBack={() => setShowMyAccount(false)} />
          </main>
        ) : (
          <>
            <header className="topbar">
              <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="القائمة">
                <MenuIcon />
              </button>
              <h1>{active.label}</h1>
            </header>
            <main>
              {active.key === "home" ? (
                <HomePage staffName={staff.full_name} onNavigate={(key) => setTab(key)} />
              ) : active.key === "inbox" ? (
                <InboxPage currentStaffId={staff.id} />
              ) : (
                Active && <Active />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [staff, setStaff] = useState<StaffMe | null>(null);

  useEffect(() => {
    getSetupStatus()
      .then((s) => setInitialized(s.initialized))
      .catch(() => setInitialized(true)); // fail open — don't trap the user if the check itself errors
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setStaff(null));
    if (getToken()) {
      getMe()
        .then(setStaff)
        .catch(() => setToken(null))
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  if (initialized === null || !authChecked) return null;
  if (!initialized) return <SetupWizard onDone={() => setInitialized(true)} />;
  if (!staff) return <LoginPage onLoggedIn={setStaff} />;
  return (
    <Dashboard
      staff={staff}
      onLogout={() => {
        setToken(null);
        setStaff(null);
      }}
    />
  );
}

export default App;
