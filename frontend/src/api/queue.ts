import { api } from "./client";

export type Queue = {
  id: string;
  branch_id: string;
  doctor_id: string | null;
  room_id: string | null;
  service_id: string | null;
  queue_date: string;
  is_active: boolean;
};

export type QueueTicket = {
  id: string;
  queue_id: string;
  appointment_id: string;
  patient_id: string;
  ticket_number: number;
  priority_level: "normal" | "emergency" | "elderly" | "special_needs" | "child" | "critical" | "vip";
  status: "waiting" | "called" | "in_progress" | "done" | "skipped";
  arrival_status: "early" | "on_time" | "late" | "very_late" | null;
  checked_in_at: string;
  called_at: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export const listQueues = (branchId?: string) =>
  api.get<Queue[]>("/queues", { params: branchId ? { branch_id: branchId } : {} }).then((res) => res.data);

export const listQueueTickets = (queueId: string) =>
  api.get<QueueTicket[]>(`/queues/${queueId}/tickets`).then((res) => res.data);

export const callTicket = (ticketId: string) =>
  api.post<QueueTicket>(`/queue-tickets/${ticketId}/call`).then((res) => res.data);

export const startTicket = (ticketId: string) =>
  api.post<QueueTicket>(`/queue-tickets/${ticketId}/start`).then((res) => res.data);

export const completeTicket = (ticketId: string) =>
  api.post<QueueTicket>(`/queue-tickets/${ticketId}/complete`).then((res) => res.data);

export const skipTicket = (ticketId: string) =>
  api.post<QueueTicket>(`/queue-tickets/${ticketId}/skip`).then((res) => res.data);
