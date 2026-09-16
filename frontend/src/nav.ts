import type { ComponentType } from "react";
import {
  AiIcon,
  AlertIcon,
  AppointmentIcon,
  BranchIcon,
  CalendarIcon,
  ChannelIcon,
  CouponIcon,
  DuplicatesIcon,
  HomeIcon,
  InboxIcon,
  PackageIcon,
  PatientIcon,
  PaymentIcon,
  QueueIcon,
  ReportIcon,
  ServiceIcon,
  SettingsIcon,
  StaffIcon,
  UserIcon,
  WaitlistIcon,
} from "./icons";

export type NavEntry = {
  /** Stable identifier, unchanged from the pre-router build: pages navigate
   * by key (`onNavigate("payments")`), and the global search emits keys too,
   * so keys stay the app's internal address and paths are their rendering. */
  key: string;
  path: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Permission the signed-in staff member must hold. "" means everyone. */
  requires: string;
};

export type NavSection = { label: string | null; items: readonly NavEntry[] };

const entry = (
  key: string,
  path: string,
  label: string,
  Icon: NavEntry["Icon"],
  requires: string,
): NavEntry => ({ key, path, label, Icon, requires });

/* --- Shared entries -------------------------------------------------- */

const home = entry("home", "/home", "الرئيسية", HomeIcon, "");
const today = entry("today", "/today", "يومي", HomeIcon, "");
const desk = entry("desk", "/desk", "الاستقبال", QueueIcon, "appointment.view");
const inbox = entry("inbox", "/inbox", "المحادثات", InboxIcon, "conversation.view");
export const accountEntry = entry("account", "/account", "حسابي", UserIcon, "");

/* --- Admin ----------------------------------------------------------- */

/* The "النظام" group used to be ten separate nav entries for what is really
 * one job -- configuring the clinic -- which is most of why the admin nav ran
 * to 22 items. They are now sections of two hub screens (settings, reports);
 * the screens themselves are untouched, they just render inside a tabbed
 * shell instead of owning a nav row each. */
export const adminSections: readonly NavSection[] = [
  { label: null, items: [home, inbox] },
  {
    label: "التشغيل اليومي",
    items: [
      entry("alerts", "/alerts", "التنبيهات", AlertIcon, "payment.view"),
      entry("appointments", "/appointments", "المواعيد", AppointmentIcon, "appointment.view"),
      entry("calendar", "/calendar", "التقويم", CalendarIcon, "slot.view"),
      entry("queue", "/queue", "الطابور والانتظار", QueueIcon, "queue.view"),
      entry("waitlist", "/waitlist", "قائمة الانتظار", WaitlistIcon, "waitlist.view"),
      entry("recalls", "/recalls", "دعوات المراجعة", WaitlistIcon, "recall.manage"),
      entry("linked-booking", "/linked-booking", "حجز مرتبط", AppointmentIcon, "appointment.create"),
    ],
  },
  {
    label: "المرضى والمالية",
    items: [
      entry("patients", "/patients", "المرضى", PatientIcon, "patient.view"),
      entry("patient-duplicates", "/patients/duplicates", "السجلات المكررة", DuplicatesIcon, "patient.merge"),
      entry("payments", "/payments", "المدفوعات", PaymentIcon, "payment.view"),
      entry("packages", "/packages", "الباقات", PackageIcon, "package.view"),
      entry("coupons", "/coupons", "الكوبونات", CouponIcon, "coupon.view"),
    ],
  },
  {
    label: "إعداد العيادة",
    items: [
      entry("staff", "/staff", "الموظفين", StaffIcon, "staff.view"),
      entry("services", "/services", "الخدمات", ServiceIcon, "service.view"),
      entry("branches", "/branches", "الفروع", BranchIcon, "branch.view"),
      entry("channels", "/channels", "القنوات", ChannelIcon, "channel.view"),
    ],
  },
  {
    label: "النظام",
    items: [
      entry("settings", "/settings", "الإعدادات", SettingsIcon, "clinic_settings.view"),
      entry("reports", "/reports", "التقارير والأداء", ReportIcon, "bot_performance.view"),
      entry("ai-settings", "/ai-settings", "الذكاء الاصطناعي", AiIcon, "ai_settings.view"),
    ],
  },
];

/* --- Reception ------------------------------------------------------- */

export const receptionSections: readonly NavSection[] = [
  { label: null, items: [desk, inbox] },
  {
    label: "الحجز والجدولة",
    items: [
      entry("appointments", "/appointments", "المواعيد", AppointmentIcon, "appointment.view"),
      entry("linked-booking", "/linked-booking", "حجز مرتبط", AppointmentIcon, "appointment.create"),
      entry("calendar", "/calendar", "التقويم", CalendarIcon, "slot.view"),
      entry("queue", "/queue", "الطابور", QueueIcon, "queue.view"),
      entry("waitlist", "/waitlist", "قائمة الانتظار", WaitlistIcon, "waitlist.view"),
      entry("recalls", "/recalls", "دعوات المراجعة", WaitlistIcon, "recall.manage"),
    ],
  },
  {
    label: "المرضى والدفع",
    items: [
      entry("patients", "/patients", "المرضى", PatientIcon, "patient.view"),
      entry("payments", "/payments", "المدفوعات", PaymentIcon, "payment.view"),
      entry("packages", "/packages", "الباقات", PackageIcon, "package.view"),
    ],
  },
];

/* --- Doctor workspace ------------------------------------------------ */

export const workspaceSections: readonly NavSection[] = [
  { label: null, items: [today, inbox] },
  {
    label: "شغلي",
    items: [
      entry("my-queue", "/my/queue", "طابوري", QueueIcon, "queue.view"),
      entry("my-calendar", "/my/calendar", "تقويمي", CalendarIcon, "slot.view"),
      entry("my-patients", "/my/patients", "مرضاي", PatientIcon, "patient.view"),
      entry("my-services", "/my/services", "خدماتي", ServiceIcon, "service.view"),
    ],
  },
];

/** Self-scoped roles (mirrors SELF_SCOPED_ROLES in backend
 * app/core/scoping.py) get a workspace of their own rather than a
 * permission-filtered slice of the admin dashboard. */
const SELF_SCOPED_ROLES = new Set(["doctor"]);

export function isSelfScopedRole(role: string) {
  return SELF_SCOPED_ROLES.has(role);
}

export function sectionsForRole(role: string): readonly NavSection[] {
  if (isSelfScopedRole(role)) return workspaceSections;
  if (role === "receptionist") return receptionSections;
  return adminSections;
}

/** Nav for this staff member: their role's sections, minus what they lack
 * the permission for, minus any section left empty by that filter. */
export function visibleSections(role: string, permissions: readonly string[]): NavSection[] {
  return sectionsForRole(role)
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => i.requires === "" || permissions.includes(i.requires)),
    }))
    .filter((section) => section.items.length > 0);
}

export function landingPath(role: string) {
  if (isSelfScopedRole(role)) return "/today";
  if (role === "receptionist") return "/desk";
  return "/home";
}

const byKey = new Map<string, NavEntry>();
for (const sections of [adminSections, receptionSections, workspaceSections]) {
  for (const section of sections) {
    for (const item of section.items) if (!byKey.has(item.key)) byKey.set(item.key, item);
  }
}
byKey.set(accountEntry.key, accountEntry);

/** Key -> URL, for the pages and the global search that still navigate by
 * key. Unknown keys fall back to the role's landing screen rather than
 * throwing a router error at the user. */
export function pathForKey(key: string, role: string) {
  return byKey.get(key)?.path ?? landingPath(role);
}

export const roleLabel: Record<string, string> = {
  admin: "مدير",
  doctor: "طبيب",
  receptionist: "موظف استقبال",
};
