import type { ReactNode } from "react";
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
import { MyQueuePage } from "./pages/workspace/MyQueuePage";
import { MyCalendarPage } from "./pages/workspace/MyCalendarPage";
import { MyPatientsPage } from "./pages/workspace/MyPatientsPage";
import { MyServicesPage } from "./pages/workspace/MyServicesPage";
import { TodayPage } from "./pages/workspace/TodayPage";
import { AccountPage } from "./pages/workspace/AccountPage";
import { ReceptionDeskPage } from "./pages/workspace/ReceptionDeskPage";
import type { StaffMe } from "./api/auth";

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
export function screenFor(key: string, staff: StaffMe, goTo: (key: string) => void): ReactNode {
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

