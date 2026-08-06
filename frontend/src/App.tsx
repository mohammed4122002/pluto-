import { useEffect, useState } from "react";
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
import { LoginPage } from "./pages/LoginPage";
import { getSetupStatus } from "./api/setup";
import { getMe } from "./api/auth";
import type { StaffMe } from "./api/auth";
import { getAttentionCount } from "./api/conversations";
import { StaffAlertsPage } from "./pages/StaffAlertsPage";
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

// Not permission-gated like every other tab -- it's a light, graceful-
// degrading summary (each section hides itself if the viewer lacks that
// section's permission, same pattern as AlertsPage), so everyone lands
// somewhere useful regardless of role.
const homeTab = { key: "home", label: "الرئيسية", Icon: HomeIcon, Component: HomePage, requires: null } as const;

const groups = [
  {
    label: null,
    items: [{ key: "inbox", label: "المحادثات", Icon: InboxIcon, Component: InboxPage, requires: "conversation.view" }],
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
] as const;

const allTabs = groups.map((g) => g.items).flat();
type TabKey = (typeof allTabs)[number]["key"] | "home";

function Dashboard({ staff, onLogout }: { staff: StaffMe; onLogout: () => void }) {
  const visible = allTabs.filter((t) => staff.permissions.includes(t.requires));
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((t) => staff.permissions.includes(t.requires)) }))
    .filter((g) => g.items.length > 0);

  // A doctor's queue is the one thing they actually need every day -- land
  // them there directly instead of on whatever tab happens to be first.
  // Everyone else lands on the home summary instead of an arbitrary tab.
  const isDoctor = staff.role === "doctor";
  const defaultTab: TabKey = isDoctor && visible.some((t) => t.key === "queue") ? "queue" : "home";
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const active = tab === "home" ? homeTab : visible.find((t) => t.key === tab) ?? homeTab;

  const [showStaffAlerts, setShowStaffAlerts] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectTab = (key: TabKey) => {
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

  // Derived only from `visible` (never homeTab) so every member shares the
  // same no-required-props shape -- home renders through its own explicit
  // branch below instead, since it needs staffName/onNavigate.
  const Active = active.key === "home" ? null : visible.find((t) => t.key === active.key)?.Component ?? null;

  return (
    <div className={mobileMenuOpen ? "app-shell menu-open" : "app-shell"}>
      <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">ع</span>
          <span className="brand-name">لوحة العيادة</span>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <button className={active.key === "home" ? "nav-item active" : "nav-item"} onClick={() => selectTab("home")}>
              <HomeIcon className="nav-icon" />
              {homeTab.label}
            </button>
          </div>
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
        ) : (
          <>
            <header className="topbar">
              <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="القائمة">
                <MenuIcon />
              </button>
              <h1>{active.label}</h1>
            </header>
            <main>
              {/* Doctors see only their own queue/appointments/patients/services --
                  everyone else keeps managing everything exactly as before. */}
              {active.key === "home" && (
                <HomePage staffName={staff.full_name} onNavigate={(key) => setTab(key as TabKey)} />
              )}
              {active.key === "queue" && <QueuePage currentDoctor={isDoctor ? { id: staff.id } : undefined} />}
              {active.key === "appointments" && (
                <AppointmentsPage currentDoctor={isDoctor ? { id: staff.id } : undefined} />
              )}
              {active.key === "patients" && <PatientsPage currentDoctor={isDoctor ? { id: staff.id } : undefined} />}
              {active.key === "services" && <ServicesPage currentDoctor={isDoctor ? { id: staff.id } : undefined} />}
              {active.key === "inbox" && <InboxPage currentStaffId={staff.id} />}
              {active.key !== "home" &&
                active.key !== "queue" &&
                active.key !== "appointments" &&
                active.key !== "patients" &&
                active.key !== "services" &&
                active.key !== "inbox" &&
                Active && <Active />}
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
