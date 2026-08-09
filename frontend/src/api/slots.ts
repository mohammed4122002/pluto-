import { api } from "./client";

export type SlotStatus =
  | "available"
  | "temporarily_held"
  | "booked"
  | "blocked"
  | "unavailable"
  | "reserved"
  | "overbooked"
  | "waitlist_only";

export type Slot = {
  id: string;
  branch_id: string;
  doctor_id: string | null;
  service_id: string | null;
  room_id: string | null;
  resource_id: string | null;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: SlotStatus;
  held_until: string | null;
  internal_only: boolean;
};

export const searchSlots = (params: {
  branch_id?: string;
  staff_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
}) => api.get<Slot[]>("/slots", { params }).then((res) => res.data);

export const generateSlots = (payload: {
  staff_id: string;
  branch_id: string;
  from_date: string;
  to_date: string;
}) =>
  api
    .post<SlotGenerateResult>("/slots/generate", payload)
    .then((res) => res.data);

export type SlotGenerateReason = "no_availability" | "inactive_doctor" | "no_working_days";

export type SlotGenerateResult = {
  created: number;
  /** Why nothing was created, when nothing was. */
  reason: SlotGenerateReason | null;
};

export const holdSlot = (slotId: string, sessionId: string) =>
  api.post<Slot>(`/slots/${slotId}/hold`, { session_id: sessionId }).then((res) => res.data);

export const bookSlot = (
  slotId: string,
  payload: {
    patient_id: string;
    session_id: string;
    notes?: string;
    service_id?: string;
    patient_package_id?: string;
  },
) => api.post<{ appointment_id: string }>(`/slots/${slotId}/book`, payload).then((res) => res.data);
