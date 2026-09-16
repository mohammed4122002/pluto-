/** Entry point for the published design preview.
 *
 * Same App as production, with three things swapped: the API adapter (demo
 * data), the auth gate (already signed in), and the router (hash-based, so the
 * page works when it is served as a static file with no server rewriting
 * unknown paths back to index.html). */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import "../index.css";
import { api } from "../api/client";
import { mockAdapter } from "./mock-api";
import type { StaffMe } from "../api/auth";
import { AppShell } from "../layout/AppShell";
import { landingPath, pathForKey, visibleSections } from "../nav";
import { useTheme } from "../theme";
import { ToastProvider } from "../ui";
import { screenFor } from "../screens";
import { AccountPage } from "../pages/workspace/AccountPage";
import { SettingsHubPage } from "../pages/SettingsHubPage";
import { ReportsHubPage } from "../pages/ReportsHubPage";

api.defaults.adapter = mockAdapter;

const PERMISSIONS = [
  "conversation.view", "payment.view", "appointment.view", "appointment.create", "appointment.update",
  "slot.view", "queue.view", "waitlist.view", "recall.manage", "package.view", "coupon.view",
  "patient.view", "patient.merge", "patient.delete", "patient.tag", "staff.view", "service.view",
  "branch.view", "channel.view", "clinic_settings.view", "clinic_settings.update", "ai_settings.view",
  "bot_performance.view", "import.execute",
];

const ROLES: Record<string, StaffMe> = {
  admin: { id: "s4", full_name: "د. محمد النور", role: "admin", permissions: PERMISSIONS } as StaffMe,
  receptionist: { id: "s3", full_name: "ليلى قاسم", role: "receptionist", permissions: PERMISSIONS } as StaffMe,
  doctor: { id: "s1", full_name: "د. رنا العلي", role: "doctor", permissions: PERMISSIONS } as StaffMe,
};

/** The preview can be opened as any of the three roles, since each one gets a
 * different navigation and a different landing screen. */
function roleFromQuery(): StaffMe {
  const role = new URLSearchParams(window.location.search).get("role") ?? "admin";
  return ROLES[role] ?? ROLES.admin;
}

function Preview() {
  const staff = roleFromQuery();
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const goTo = (key: string) => navigate(pathForKey(key, staff.role));
  const entries = visibleSections(staff.role, staff.permissions).flatMap((s) => s.items);

  return (
    <Routes>
      <Route
        element={
          <AppShell staff={staff} theme={theme} onToggleTheme={toggleTheme} onLogout={() => undefined} />
        }
      >
        {entries.map((entry) => (
          <Route key={entry.key} path={entry.path} element={screenFor(entry.key, staff, goTo)} />
        ))}
        <Route path="/settings/:section" element={<SettingsHubPage staff={staff} />} />
        <Route path="/reports/:section" element={<ReportsHubPage staff={staff} />} />
        <Route path="/account" element={<AccountPage staff={staff} />} />
        <Route path="*" element={<Navigate to={landingPath(staff.role)} replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <Preview />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
