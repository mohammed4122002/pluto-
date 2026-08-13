import type { AppointmentStatus } from "./api/appointments";
import type { QueueTicket } from "./api/queue";
import type { WaitlistEntry } from "./api/waitlist";
import type { PatientPackage } from "./api/packages";

/** Arabic labels for every appointment status.
 *
 * These live here rather than in a page because the dashboard and the
 * appointments table both render them, and two copies drift: one gets a new
 * status added and the other silently falls back to the raw enum value. */
export const statusLabel: Record<AppointmentStatus, string> = {
  draft: "مسودة",
  requested: "بانتظار التأكيد",
  pending_review: "قيد المراجعة",
  pending_approval: "بانتظار الموافقة",
  pending_payment: "بانتظار الدفع",
  pending_insurance_verification: "بانتظار التحقق من التأمين",
  pending_prior_authorization: "بانتظار الموافقة المسبقة",
  confirmed: "مؤكد",
  patient_confirmed: "أكّده المريض",
  waitlisted: "قائمة انتظار",
  rescheduled: "أُعيدت جدولته",
  checked_in: "سجّل حضوره",
  arrived_late: "وصل متأخراً",
  waiting: "بانتظار الدور",
  called: "تم نداؤه",
  in_consultation: "داخل الكشف",
  procedure_started: "بدأ الإجراء",
  completed: "مكتمل",
  checked_out: "غادر العيادة",
  cancelled: "ملغى",
  cancelled_by_patient: "ألغاه المريض",
  cancelled_by_clinic: "ألغته العيادة",
  cancelled_by_doctor: "ألغاه الطبيب",
  rejected: "مرفوض",
  no_show: "لم يحضر",
  expired: "انتهت صلاحيته",
  on_hold: "معلّق",
};

/** Statuses that only check-in and the queue screen may set.
 *
 * Each is written alongside a queue_tickets row: check_in_appointment creates
 * the ticket and moves the appointment to checked_in then waiting, and the
 * queue's call/start actions drive called and in_consultation. Setting one by
 * hand moves the appointment without ever creating the ticket, so the patient
 * reads as waiting on the appointments table while being invisible on every
 * queue screen -- confirmed live, and the reason a real patient once sat in
 * the waiting room that reception could not see.
 *
 * 'completed' is deliberately absent: closing out an appointment that never
 * entered the queue is legitimate manual work. */
export const QUEUE_OWNED_STATUSES = new Set<AppointmentStatus>([
  "checked_in",
  "waiting",
  "called",
  "in_consultation",
]);

export const statusBadgeClass: Record<AppointmentStatus, string> = {
  draft: "inactive",
  requested: "warning",
  pending_review: "warning",
  pending_approval: "warning",
  pending_payment: "warning",
  pending_insurance_verification: "warning",
  pending_prior_authorization: "warning",
  confirmed: "active",
  patient_confirmed: "active",
  waitlisted: "warning",
  rescheduled: "inactive",
  checked_in: "active",
  arrived_late: "warning",
  waiting: "active",
  called: "active",
  in_consultation: "active",
  procedure_started: "active",
  completed: "inactive",
  checked_out: "inactive",
  cancelled: "danger",
  cancelled_by_patient: "danger",
  cancelled_by_clinic: "danger",
  cancelled_by_doctor: "danger",
  rejected: "danger",
  no_show: "danger",
  expired: "danger",
  on_hold: "warning",
};

/** Coarse buckets for the dashboard's status breakdown.
 *
 * 27 statuses is far too many slices to read at a glance, so the donut groups
 * them into the four outcomes a receptionist actually acts on. */
export type StatusBucket = "upcoming" | "inClinic" | "done" | "lost";

const IN_CLINIC = new Set<AppointmentStatus>([
  "checked_in",
  "arrived_late",
  "waiting",
  "called",
  "in_consultation",
  "procedure_started",
]);

const DONE = new Set<AppointmentStatus>(["completed", "checked_out"]);

const LOST = new Set<AppointmentStatus>([
  "cancelled",
  "cancelled_by_patient",
  "cancelled_by_clinic",
  "cancelled_by_doctor",
  "rejected",
  "no_show",
  "expired",
]);

export function statusBucket(status: AppointmentStatus): StatusBucket {
  if (IN_CLINIC.has(status)) return "inClinic";
  if (DONE.has(status)) return "done";
  if (LOST.has(status)) return "lost";
  return "upcoming";
}

export const bucketLabel: Record<StatusBucket, string> = {
  upcoming: "قادمة",
  inClinic: "داخل العيادة",
  done: "مكتملة",
  lost: "ملغاة أو لم تحضر",
};

/* --- Queue tickets --------------------------------------------------------
   The same ticket used to read "قيد الكشف / انتهى / تم تخطيه" on the queue
   screen and "بالكشف / خلص / تخطّي" on the doctor's and the reception desk --
   three wordings for one state. */

export const queueStatusLabel: Record<QueueTicket["status"], string> = {
  waiting: "بالانتظار",
  called: "تم النداء",
  in_progress: "قيد الكشف",
  done: "انتهى",
  skipped: "تم تخطيه",
};

export const queueStatusBadgeClass: Record<QueueTicket["status"], string> = {
  waiting: "warning",
  called: "active",
  in_progress: "active",
  done: "inactive",
  skipped: "inactive",
};

export const priorityLabel: Record<QueueTicket["priority_level"], string> = {
  normal: "عادية",
  emergency: "طارئة",
  elderly: "كبار السن",
  special_needs: "احتياجات خاصة",
  child: "طفل",
  critical: "حرجة",
  vip: "VIP",
};

export const arrivalStatusLabel: Record<NonNullable<QueueTicket["arrival_status"]>, string> = {
  early: "وصل مبكراً",
  on_time: "في الموعد",
  late: "متأخر",
  very_late: "متأخر جداً",
};

/* --- Slots --- */

export const slotStatusLabel: Record<string, string> = {
  available: "متاح",
  temporarily_held: "محجوز مؤقتاً",
  booked: "محجوز",
  blocked: "معطّل",
  unavailable: "غير متاح",
  reserved: "محجوز إدارياً",
  overbooked: "حجز إضافي",
  waitlist_only: "قائمة انتظار فقط",
};

export const slotStatusBadgeClass: Record<string, string> = {
  available: "active",
  temporarily_held: "warning",
  booked: "inactive",
  blocked: "danger",
  unavailable: "danger",
  reserved: "warning",
  overbooked: "warning",
  waitlist_only: "warning",
};

/* --- Waitlist --- */

export const waitlistStatusLabel: Record<WaitlistEntry["status"], string> = {
  active: "بانتظار موعد",
  offered: "عُرض عليه موعد",
  booked: "تم الحجز",
  expired: "انتهت المهلة",
  cancelled: "ملغى",
};

export const waitlistStatusBadgeClass: Record<WaitlistEntry["status"], string> = {
  active: "warning",
  offered: "active",
  booked: "active",
  expired: "inactive",
  cancelled: "danger",
};

/* --- Patient packages --- */

export const packageStatusLabel: Record<PatientPackage["status"], string> = {
  pending_payment: "بانتظار الدفع",
  active: "مفعّلة",
  cancelled: "ملغاة",
  expired: "منتهية",
};

export const packageStatusBadgeClass: Record<PatientPackage["status"], string> = {
  pending_payment: "warning",
  active: "active",
  cancelled: "danger",
  expired: "inactive",
};

/* --- Booking source (appointments.source) ---
   Not the messaging channel (whatsapp/telegram/...) -- appointments only ever
   carry "dashboard" (staff-created), "ai_chat" (booked by the assistant) or
   "import" (brought in from the clinic's old system) today. */

export const bookingSourceLabel: Record<string, string> = {
  dashboard: "لوحة العيادة",
  ai_chat: "المساعد الذكي",
  import: "استيراد بيانات",
  manual: "يدوي",
  phone: "اتصال هاتفي",
  walk_in: "حضور مباشر",
};

/* --- Import jobs --- */

export const importStatusLabel: Record<string, string> = {
  dry_run: "معاينة",
  running: "جارٍ التنفيذ",
  completed: "مكتمل",
  failed: "فشل",
};

/** Looks up a status that reached the UI as a bare string.
 *
 * The maps above are exhaustively typed on purpose -- adding a status to the
 * API makes the compiler demand a label rather than silently rendering the
 * raw enum. Endpoints that hand back a loose `string` need this one narrow
 * escape hatch instead of weakening every map. */
export function labelFor(map: Record<string, string>, key: string | null | undefined, fallback = "—"): string {
  if (!key) return fallback;
  return map[key] ?? fallback;
}
