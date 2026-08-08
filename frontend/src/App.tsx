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
import { LinkedBookingPage } from "./pages/LinkedBookingPage";
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
import { NotificationSettingsPage } from "./pages/NotificationSettingsPage";
import { EscalationStaffPage } from "./pages/EscalationStaffPage";
import { StaffBotSettingsPage } from "./pages/StaffBotSettingsPage";
import { BotPerformancePage } from "./pages/BotPerformancePage";
import { WeeklyReportPage } from "./pages/WeeklyReportPage";
import { PatientDuplicatesPage } from "./pages/PatientDuplicatesPage";
import { SetupWizard } from "./pages/SetupWizard";
import { MyQueuePage } from "./pages/workspace/MyQueuePage";
import { MyCalendarPage } from "./pages/workspace/MyCalendarPage";
import { MyPatientsPage } from "./pages/workspace/MyPatientsPage";
import { MyServicesPage } from "./pages/workspace/MyServicesPage";
import { TodayPage } from "./pages/workspace/TodayPage";
import { AccountPage } from "./pages/workspace/AccountPage";
import { ReceptionDeskPage } from "./pages/workspace/ReceptionDeskPage";
import { LoginPage } from "./pages/LoginPage";
import { getSetupStatus } from "./api/setup";
import { getMe } from "./api/auth";
import type { StaffMe } from "./api/auth";
import { getAttentionCount } from "./api/conversations";
import { GlobalSearchBar } from "./components/GlobalSearchBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
  UserIcon,
  ReportIcon,
} from "./icons";
import "./App.css";

type Tab = {
  key: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  // Omitted for the few screens that need context the nav table can't carry
  // (the signed-in staff member, or the ability to switch tabs). Those are
  // rendered by name below, next to the one place that has both.
  Component?: ComponentType;
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

// Available to every signed-in staff member -- "" means no permission gate.
// These two are the same screens for a doctor and for an admin, so both navs
// share the definitions rather than each declaring its own.
const todayTab: Tab = { key: "today", label: "يومي", Icon: HomeIcon, requires: "" };
const accountTab: Tab = { key: "account", label: "حسابي", Icon: UserIcon, requires: "" };

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

const adminGroups: readonly NavGroup[] = [
  {
    label: null,
    items: [homeTab, inboxTab],
  },
  {
    label: "إدارة العيادة",
    items: [
      { key: "alerts", label: "التنبيهات", Icon: AlertIcon, Component: AlertsPage, requires: "payment.view" },
      { key: "appointments", label: "المواعيد", Icon: AppointmentIcon, Component: AppointmentsPage, requires: "appointment.view" },
      { key: "linked-booking", label: "حجز مرتبط", Icon: AppointmentIcon, Component: LinkedBookingPage, requires: "appointment.create" },
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
      {
        key: "staff-bot-settings",
        label: "بوت التنبيهات",
        Icon: AlertIcon,
        Component: StaffBotSettingsPage,
        requires: "clinic_settings.update",
      },
      {
        key: "notification-settings",
        label: "رسائل وتنبيهات آلية",
        Icon: SettingsIcon,
        Component: NotificationSettingsPage,
        requires: "clinic_settings.update",
      },
      { key: "ai-settings", label: "إعدادات الذكاء الاصطناعي", Icon: AiIcon, Component: AiSettingsPage, requires: "ai_settings.view" },
      { key: "bot-performance", label: "أداء المساعد الذكي", Icon: AiIcon, Component: BotPerformancePage, requires: "bot_performance.view" },
      { key: "weekly-report", label: "التقرير الأسبوعي", Icon: ReportIcon, Component: WeeklyReportPage, requires: "bot_performance.view" },
      { key: "import", label: "استيراد بيانات", Icon: ImportIcon, Component: ImportPage, requires: "import.execute" },
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

const deskTab: Tab = {
  key: "desk",
  label: "الاستقبال",
  Icon: QueueIcon,
  Component: ReceptionDeskPage,
  requires: "appointment.view",
};

// Reception was the last role still living in a permission-filtered slice of
// the admin dashboard: a 22-item nav where most entries are configuration it
// never touches, and its actual day -- see who's due, check them in -- split
// across the appointments table and the queue screen. This is the same move
// the doctor workspace made, for the role that uses the system most.
const receptionGroups: readonly NavGroup[] = [
  {
    label: null,
    items: [deskTab, inboxTab],
  },
  {
    label: "الحجز والجدولة",
    items: [
      { key: "appointments", label: "المواعيد", Icon: AppointmentIcon, Component: AppointmentsPage, requires: "appointment.view" },
      { key: "linked-booking", label: "حجز مرتبط", Icon: AppointmentIcon, Component: LinkedBookingPage, requires: "appointment.create" },
      { key: "calendar", label: "التقويم", Icon: CalendarIcon, Component: CalendarPage, requires: "slot.view" },
      { key: "queue", label: "الطابور", Icon: QueueIcon, Component: QueuePage, requires: "queue.view" },
      { key: "waitlist", label: "قائمة الانتظار", Icon: WaitlistIcon, Component: WaitlistPage, requires: "waitlist.view" },
    ],
  },
  {
    label: "المرضى والدفع",
    items: [
      { key: "patients", label: "المرضى", Icon: PatientIcon, Component: PatientsPage, requires: "patient.view" },
      { key: "payments", label: "المدفوعات", Icon: PaymentIcon, Component: PaymentsPage, requires: "payment.view" },
      { key: "packages", label: "الباقات", Icon: PackageIcon, Component: PackagesPage, requires: "package.view" },
    ],
  },
];

const workspaceGroups: readonly NavGroup[] = [
  {
    label: null,
    items: [todayTab, inboxTab],
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

const roleLabel: Record<string, string> = { admin: "مدير", doctor: "طبيب", receptionist: "موظف استقبال" };

/** Arabic doesn't shape into a two-letter monogram the way Latin initials do,
 * and "د." is a title, not a name -- one letter of the actual name reads best. */
function initial(fullName: string) {
  return fullName.replace(/^د\.\s*/, "").trim()[0] ?? "؟";
}

function firstName(fullName: string) {
  const stripped = fullName.replace(/^د\.\s*/, "").trim();
  return stripped.split(/\s+/)[0] || fullName;
}

function Dashboard({ staff, onLogout }: { staff: StaffMe; onLogout: () => void }) {
  const isSelfScoped = SELF_SCOPED_ROLES.has(staff.role);
  const isReception = staff.role === "receptionist";
  const groups = isSelfScoped ? workspaceGroups : isReception ? receptionGroups : adminGroups;
  const allTabs = groups.flatMap((g) => g.items);

  const allows = (t: Tab) => t.requires === "" || staff.permissions.includes(t.requires);
  // accountTab isn't in any nav group -- it's reached from the account menu,
  // but it still has to be selectable as the active tab.
  const visible = [...allTabs.filter(allows), accountTab];
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter(allows) }))
    .filter((g) => g.items.length > 0);

  // Each role lands on the summary built for it: "يومي" is the personal one
  // (my queue, my day, my escalations) and "الرئيسية" is the clinic-wide one,
  // which calls endpoints a self-scoped role can't reach.
  const [tab, setTab] = useState<string>(isSelfScoped ? "today" : isReception ? "desk" : "home");
  const active = visible.find((t) => t.key === tab) ?? visible[0];

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectTab = (key: string) => {
    setTab(key);
    setMobileMenuOpen(false);
    setMenuOpen(false);
  };

  // Search only federates entities that already have their own page --
  // gating it the same way keeps it from being a way to probe permissions
  // you don't hold (the backend enforces this too, this just avoids showing
  // an empty box to someone who could never get a result from it).
  const canSearch =
    staff.permissions.includes("patient.view") ||
    staff.permissions.includes("appointment.view") ||
    staff.permissions.includes("staff.view");
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
        <div className="account-menu">
          {menuOpen && (
            <div className="account-menu-items">
              <button className="nav-item" onClick={() => selectTab("account")}>
                <UserIcon className="nav-icon" />
                حسابي
              </button>
              <button className="nav-item" onClick={onLogout}>
                تسجيل الخروج
              </button>
            </div>
          )}
          <button
            className={menuOpen ? "account-trigger open" : "account-trigger"}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          >
            <span className="account-avatar">{initial(staff.full_name)}</span>
            <span className="account-trigger-text">
              <span className="account-trigger-name">{staff.full_name}</span>
              <span className="account-trigger-role">{roleLabel[staff.role] ?? staff.role}</span>
            </span>
            <span className="account-trigger-caret" aria-hidden>
              ⌃
            </span>
          </button>
        </div>
      </aside>
      <div className="content-area">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="القائمة">
            <MenuIcon />
          </button>
          {canSearch && <GlobalSearchBar onNavigate={selectTab} isSelfScoped={isSelfScoped} />}
        </header>
        <main>
          {/* Keyed by tab so navigating away from a crashed screen clears it. */}
          <ErrorBoundary key={active.key}>
          {active.key === "home" ? (
            <HomePage staffName={firstName(staff.full_name)} onNavigate={selectTab} />
          ) : active.key === "today" ? (
            <TodayPage staffName={firstName(staff.full_name)} onGoTo={selectTab} />
          ) : active.key === "account" ? (
            <AccountPage staff={staff} />
          ) : active.key === "inbox" ? (
            <InboxPage currentStaffId={staff.id} />
          ) : (
            Active && <Active />
          )}
          </ErrorBoundary>
        </main>
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
