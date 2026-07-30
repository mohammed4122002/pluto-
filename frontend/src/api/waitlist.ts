import { api } from "./client";

export type WaitlistEntry = {
  id: string;
  patient_id: string;
  branch_id: string;
  doctor_id: string | null;
  service_id: string | null;
  preferred_time_window: string | null;
  max_wait_days: number | null;
  accepts_alternative_doctor: boolean;
  accepts_alternative_branch: boolean;
  medical_priority: number;
  status: "active" | "offered" | "booked" | "expired" | "cancelled";
  created_at: string;
};

export type WaitlistCreate = {
  patient_id: string;
  branch_id: string;
  doctor_id?: string;
  service_id?: string;
  medical_priority?: number;
  accepts_alternative_doctor?: boolean;
  accepts_alternative_branch?: boolean;
};

export const listWaitlist = (branchId?: string) =>
  api.get<WaitlistEntry[]>("/waitlist", { params: branchId ? { branch_id: branchId } : {} }).then((res) => res.data);

export const addToWaitlist = (payload: WaitlistCreate) =>
  api.post<WaitlistEntry>("/waitlist", payload).then((res) => res.data);

export const cancelWaitlistEntry = (id: string) =>
  api.patch<WaitlistEntry>(`/waitlist/${id}`, { status: "cancelled" }).then((res) => res.data);
