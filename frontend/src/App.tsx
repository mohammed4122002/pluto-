import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { SetupWizard } from "./pages/SetupWizard";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AccountPage } from "./pages/workspace/AccountPage";
import { SettingsHubPage } from "./pages/SettingsHubPage";
import { ReportsHubPage } from "./pages/ReportsHubPage";
import { getSetupStatus } from "./api/setup";
import { getMe } from "./api/auth";
import type { StaffMe } from "./api/auth";
import { getToken, setToken, setUnauthorizedHandler } from "./api/client";
import { AppShell } from "./layout/AppShell";
import { accountEntry, landingPath, pathForKey, visibleSections } from "./nav";
import { useTheme } from "./theme";
import { EmptyState, ToastProvider } from "./ui";
import { screenFor } from "./screens";

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
