import type { AppointmentStatus } from "./api/appointments";

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
