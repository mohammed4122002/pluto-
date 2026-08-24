import { api } from "./client";

export type RecallReasonType =
  | "specific_date"
  | "after_days"
  | "medical_result"
  | "treatment_plan"
  | "vaccination"
  | "periodic_checkup";

export type RecallStatus = "pending" | "invited" | "responded" | "booked" | "escalated" | "cancelled";

export type Recall = {
  id: string;
  patient_id: string;
  branch_id: string;
  doctor_id: string | null;
  service_id: string | null;
  source_appointment_id: string | null;
  due_date: string;
  reason_type: RecallReasonType;
  reason_notes: string | null;
  status: RecallStatus;
  invited_at: string | null;
  responded_at: string | null;
  escalated_at: string | null;
  resulting_appointment_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type RecallCreate = {
  patient_id: string;
  branch_id: string;
  doctor_id: string | null;
  service_id: string | null;
  due_date: string;
  reason_type: RecallReasonType;
  reason_notes: string | null;
};

export const listRecalls = (params: { branch_id?: string; status?: string } = {}) =>
  api.get<Recall[]>("/recalls", { params }).then((res) => res.data);

export const createRecall = (payload: RecallCreate) =>
  api.post<Recall>("/recalls", payload).then((res) => res.data);
