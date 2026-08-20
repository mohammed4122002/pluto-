import { api } from "./client";

// The front desk's branch-scoped view. Sibling to the /me endpoints, not part
// of them: this answers "for the branch I'm standing in", not "for me".

export type DeskArrival = {
  appointment_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  doctor_name: string | null;
  service_name: string | null;
  confirmation_code: string | null;
  checked_in: boolean;
  ticket_number: number | null;
  queue_status: "waiting" | "called" | "in_progress" | "done" | "skipped" | null;
};

export type ReceptionDesk = {
  date: string;
  branch_id: string | null;
  branch_timezone: string | null;
  arrivals: DeskArrival[];
  expected_count: number;
  checked_in_count: number;
  waiting_count: number;
  in_progress_count: number;
  done_count: number;
  needs_attention_count: number;
};

export const getDesk = (params: { branch_id?: string; date?: string } = {}) =>
  api.get<ReceptionDesk>("/reception/desk", { params }).then((res) => res.data);
