import { api } from "./client";

export type AppointmentStatus =
  | "draft"
  | "requested"
  | "pending_review"
  | "pending_approval"
  | "pending_payment"
  | "pending_insurance_verification"
  | "pending_prior_authorization"
  | "confirmed"
  | "patient_confirmed"
  | "waitlisted"
  | "rescheduled"
  | "checked_in"
  | "arrived_late"
  | "waiting"
  | "called"
  | "in_consultation"
  | "procedure_started"
  | "completed"
  | "checked_out"
  | "cancelled"
  | "cancelled_by_patient"
  | "cancelled_by_clinic"
  | "cancelled_by_doctor"
  | "rejected"
  | "no_show"
  | "expired"
  | "on_hold";

export type Appointment = {
  id: string;
  branch_id: string;
  patient_id: string;
  staff_id: string | null;
  service_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  source: string;
  notes: string | null;
  slot_id: string | null;
  appointment_number: string | null;
  confirmation_code: string | null;
  payment_status: "unpaid" | "pending" | "paid" | "refunded" | "partial";
  no_show_flag: boolean;
  visit_type_id: string | null;
  referral_source: string | null;
  meeting_link: string | null;
  recurrence_id: string | null;
};

export type AppointmentCreate = {
  branch_id: string;
  patient_id: string;
  staff_id?: string;
  service_id?: string;
  scheduled_at: string;
  duration_minutes?: number;
  notes?: string;
  visit_type_id?: string;
  referral_source?: string;
};

export type VisitType = { id: string; code: string; name_ar: string; name_en: string };

export const listVisitTypes = () => api.get<VisitType[]>("/appointments/visit-types").then((res) => res.data);

export type BulkBookingItem = {
  patient_id: string;
  service_id?: string;
  staff_id?: string;
  duration_minutes?: number;
  reason_for_visit?: string;
  notes?: string;
};

export type BulkBookingLinkMode = "sequential" | "same_time" | "recurring_weekly" | "recurring_biweekly" | "recurring_monthly";

export type BulkBookingRequest = {
  branch_id: string;
  link_mode: BulkBookingLinkMode;
  start_at: string;
  items: BulkBookingItem[];
  occurrences?: number;
  visit_type_id?: string;
  campaign_name?: string;
};

export type BulkBookingResultItem = { ok: boolean; appointment: Appointment | null; error: string | null };
export type BulkBookingResult = { recurrence_id: string; results: BulkBookingResultItem[] };

export const bulkBookAppointments = (payload: BulkBookingRequest) =>
  api.post<BulkBookingResult>("/appointments/bulk", payload).then((res) => res.data);

export const listAppointments = (branchId?: string) =>
  api
    .get<Appointment[]>("/appointments", { params: branchId ? { branch_id: branchId } : {} })
    .then((res) => res.data);

export const createAppointment = (payload: AppointmentCreate) =>
  api.post<Appointment>("/appointments", payload).then((res) => res.data);

export const updateAppointmentStatus = (id: string, status: AppointmentStatus) =>
  api.patch<Appointment>(`/appointments/${id}/status`, { status }).then((res) => res.data);

export type CancelResult = { appointment: Appointment; fee_charged: number };
export type CheckInResult = { appointment: Appointment; ticket: { id: string; queue_id: string; ticket_number: number } };

export const rescheduleAppointment = (id: string, newSlotId: string, sessionId: string, reason?: string) =>
  api
    .post<Appointment>(`/appointments/${id}/reschedule`, { new_slot_id: newSlotId, session_id: sessionId, reason })
    .then((res) => res.data);

export const cancelAppointment = (id: string, reason: string, cancelledBy: "patient" | "clinic" | "doctor") =>
  api.post<CancelResult>(`/appointments/${id}/cancel`, { reason, cancelled_by: cancelledBy }).then((res) => res.data);

export const checkInAppointment = (id: string, priorityLevel = "normal") =>
  api.post<CheckInResult>(`/appointments/${id}/check-in`, { priority_level: priorityLevel }).then((res) => res.data);

export const checkInByCode = (confirmationCode: string, priorityLevel = "normal") =>
  api
    .post<CheckInResult>("/appointments/check-in-by-code", {
      confirmation_code: confirmationCode,
      priority_level: priorityLevel,
    })
    .then((res) => res.data);

export const markNoShow = (id: string, reason: string) =>
  api.post<CancelResult>(`/appointments/${id}/no-show`, { reason }).then((res) => res.data);
