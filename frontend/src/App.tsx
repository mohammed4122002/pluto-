import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
import { AiSettingsPage } from "./pages/AiSettingsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { WaitlistPage } from "./pages/WaitlistPage";
import { RecallsPage } from "./pages/RecallsPage";
import { QueuePage } from "./pages/QueuePage";
import { PackagesPage } from "./pages/PackagesPage";
import { CouponsPage } from "./pages/CouponsPage";
import { PatientDuplicatesPage } from "./pages/PatientDuplicatesPage";
import { SettingsHubPage } from "./pages/SettingsHubPage";
import { ReportsHubPage } from "./pages/ReportsHubPage";
import { SetupWizard } from "./pages/SetupWizard";
import { MyQueuePage } from "./pages/workspace/MyQueuePage";
import { MyCalendarPage } from "./pages/workspace/MyCalendarPage";
import { MyPatientsPage } from "./pages/workspace/MyPatientsPage";
import { MyServicesPage } from "./pages/workspace/MyServicesPage";
import { TodayPage } from "./pages/workspace/TodayPage";
import { AccountPage } from "./pages/workspace/AccountPage";
import { ReceptionDeskPage } from "./pages/workspace/ReceptionDeskPage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { getSetupStatus } from "./api/setup";
import { getMe } from "./api/auth";
import type { StaffMe } from "./api/auth";
import { getToken, setToken, setUnauthorizedHandler } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { accountEntry, landingPath, pathForKey, visibleSections } from "./nav";
import { useTheme } from "./theme";
import { EmptyState, ToastProvider } from "./ui";

function firstName(fullName: string) {
  const stripped = fullName.replace(/^د\.\s*/, "").trim();
  return stripped.split(/\s+/)[0] || fullName;
}

/** Screen for a nav key.
 *
 * Most screens take no props, but five need context the nav table can't
 * carry (the signed-in staff member, or the ability to move to another
 * screen), so they are named here rather than stored as components in the
 * table -- which is also what keeps the table a plain data module. */
function screenFor(key: string, staff: StaffMe, goTo: (key: string) => void): ReactNode {
  switch (key) {
    case "home":
      return <HomePage staffName={firstName(staff.full_name)} onNavigate={goTo} />;
    case "today":
      return <TodayPage staffName={firstName(staff.full_name)} onGoTo={goTo} />;
    case "account":
      return <AccountPage staff={staff} />;
    case "inbox":
      return <InboxPage currentStaffId={staff.id} />;
    case "settings":
      return <SettingsHubPage staff={staff} />;
    case "reports":
      return <ReportsHubPage staff={staff} />;
    case "desk":
      return <ReceptionDeskPage />;
    case "alerts":
      return <AlertsPage />;
    case "appointments":
      return <AppointmentsPage />;
    case "linked-booking":
      return <LinkedBookingPage />;
    case "calendar":
      return <CalendarPage />;
    case "queue":
      return <QueuePage />;
    case "waitlist":
      return <WaitlistPage />;
    case "recalls":
      return <RecallsPage />;
    case "payments":
      return <PaymentsPage />;
    case "packages":
      return <PackagesPage />;
    case "coupons":
      return <CouponsPage />;
    case "patients":
      return <PatientsPage />;
    case "patient-duplicates":
      return <PatientDuplicatesPage />;
    case "staff":
      return <StaffPage />;
    case "services":
      return <ServicesPage />;
    case "branches":
      return <BranchesPage />;
    case "channels":
      return <ChannelsPage />;
    case "ai-settings":
      return <AiSettingsPage />;
    case "my-queue":
      return <MyQueuePage />;
    case "my-calendar":
      return <MyCalendarPage />;
    case "my-patients":
      return <MyPatientsPage />;
    case "my-services":
      return <MyServicesPage />;
    default:
      return null;
  }
}

function Dashboard({ staff, onLogout }: { staff: StaffMe; onLogout: () => void }) {
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const goTo = (key: string) => navigate(pathForKey(key, staff.role));

  // Only what this staff member may see becomes a route at all. A URL they
  // don't hold the permission for therefore falls through to the catch-all
  // below and lands them on their own home screen, rather than mounting a
  // screen whose first request would 403.
  const sections = visibleSections(staff.role, staff.permissions);
  const entries = sections.flatMap((s) => s.items);
  const home = landingPath(staff.role);

  return (
    <Routes>
      <Route
        element={
          <AppShell staff={staff} theme={theme} onToggleTheme={toggleTheme} onLogout={onLogout} />
        }
      >
        {entries.length === 0 && (
          <Route
            path="*"
            element={
              <EmptyState
                title="لا توجد لديك أي صلاحية عرض بعد"
                description="تواصل مع مدير النظام ليمنحك الصلاحيات المناسبة لدورك."
              />
            }
          />
        )}
        {entries.map((entry) => (
          <Route key={entry.key} path={entry.path} element={screenFor(entry.key, staff, goTo)} />
        ))}
        {/* The hub screens keep their section in the URL, so a bookmark to
            "رسائل وتنبيهات آلية" still opens on that section. */}
        {entries.some((e) => e.key === "settings") && (
          <Route path="/settings/:section" element={<SettingsHubPage staff={staff} />} />
        )}
        {entries.some((e) => e.key === "reports") && (
          <Route path="/reports/:section" element={<ReportsHubPage staff={staff} />} />
        )}
        <Route path={accountEntry.path} element={<AccountPage staff={staff} />} />
        {entries.length > 0 && <Route path="*" element={<Navigate to={home} replace />} />}
      </Route>
    </Routes>
  );
}

function App() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("reset_token"),
  );

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
  if (resetToken)
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setResetToken(null);
        }}
      />
    );
  if (!staff) return <LoginPage onLoggedIn={setStaff} />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <Dashboard
          staff={staff}
          onLogout={() => {
            setToken(null);
            setStaff(null);
          }}
        />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
