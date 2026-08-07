import { api } from "./client";
import type { Branch } from "./branches";

// The signed-in staff member's own workspace. Every one of these is scoped
// server-side from the access token, so these screens never send a staff id
// and never need the clinic-wide lookups (/branches, /staff, /patients) that
// a doctor has no permission to call.

export type MyQueueTicket = {
  id: string;
  ticket_number: number;
  status: "waiting" | "called" | "in_progress" | "done" | "skipped";
  priority_level: "normal" | "emergency" | "elderly" | "special_needs" | "child" | "critical" | "vip";
  arrival_status: "early" | "on_time" | "late" | "very_late" | null;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  appointment_id: string;
  checked_in_at: string;
  called_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  estimated_entry_time: string | null;
};

export type MyQueue = {
  id: string;
  branch_id: string;
  branch_name: string;
  queue_date: string;
  tickets: MyQueueTicket[];
};

export type MyQueueDay = {
  date: string;
  queues: MyQueue[];
  waiting_count: number;
  in_progress_count: number;
  done_count: number;
};

export type MyCalendarAppointment = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  service_name: string | null;
  branch_id: string;
  branch_name: string;
  reason_for_visit: string | null;
  queue_number: number | null;
  check_in_time: string | null;
  slot_id: string | null;
};

export type MyCalendarSlot = {
  id: string;
  branch_id: string;
  branch_name: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: string;
  service_name: string | null;
};

export type MyCalendarDay = {
  date: string;
  branch_ids: string[];
  appointments: MyCalendarAppointment[];
  slots: MyCalendarSlot[];
};

export type MyService = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  specialty_name: string | null;
  upcoming_appointments: number;
};

export type MyPatient = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  tags: string[];
  visits_count: number;
  last_visit_at: string | null;
  next_appointment_at: string | null;
};

export const getMyBranches = () => api.get<Branch[]>("/me/branches").then((res) => res.data);

export const getMyQueue = (date?: string) =>
  api.get<MyQueueDay>("/me/queue", { params: date ? { date } : {} }).then((res) => res.data);

export const getMyCalendar = (date?: string) =>
  api.get<MyCalendarDay>("/me/calendar", { params: date ? { date } : {} }).then((res) => res.data);

export const getMyServices = () => api.get<MyService[]>("/me/services").then((res) => res.data);

export const getMyPatients = () => api.get<MyPatient[]>("/me/patients").then((res) => res.data);

type TicketAction = "call" | "start" | "complete" | "skip";

export const actOnMyTicket = (ticketId: string, action: TicketAction) =>
  api.post(`/me/queue/tickets/${ticketId}/${action}`).then((res) => res.data);

export type MyTodayConversation = {
  id: string;
  patient_name: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  needs_attention: boolean;
  channel_type: string;
};

export type MyToday = {
  date: string;
  now_serving: MyQueueTicket | null;
  up_next: MyQueueTicket | null;
  waiting_count: number;
  appointments: MyCalendarAppointment[];
  remaining_appointments: number;
  completed_appointments: number;
  conversations: MyTodayConversation[];
  needs_attention_count: number;
};

export const getMyToday = () => api.get<MyToday>("/me/today").then((res) => res.data);

export type ConflictingAppointment = {
  id: string;
  scheduled_at: string;
  patient_name: string;
  patient_phone: string | null;
  status: string;
};

export type MyLeave = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  leave_type: "planned" | "emergency";
  created_at: string;
  slots_blocked: number;
  conflicts: ConflictingAppointment[];
};

export const getMyLeaves = () => api.get<MyLeave[]>("/me/leaves").then((res) => res.data);

export const createMyLeave = (body: {
  start_at: string;
  end_at: string;
  reason?: string;
  leave_type: "planned" | "emergency";
}) => api.post<MyLeave>("/me/leaves", body).then((res) => res.data);

export const cancelMyLeave = (id: string) =>
  api.delete<{ deleted: boolean; slots_reopened: number }>(`/me/leaves/${id}`).then((res) => res.data);
