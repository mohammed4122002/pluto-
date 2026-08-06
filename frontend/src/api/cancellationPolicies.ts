import { api } from "./client";

export type FeeType = "none" | "fixed" | "percentage";

export type CancellationPolicy = {
  id: string;
  branch_id: string | null;
  service_id: string | null;
  doctor_id: string | null;
  hours_before_threshold: number;
  cancellation_fee_type: FeeType;
  cancellation_fee_value: number;
  no_show_fee_type: FeeType;
  no_show_fee_value: number;
  is_active: boolean;
};

export type CancellationPolicyCreate = {
  branch_id?: string;
  service_id?: string;
  doctor_id?: string;
  hours_before_threshold?: number;
  cancellation_fee_type?: FeeType;
  cancellation_fee_value?: number;
  no_show_fee_type?: FeeType;
  no_show_fee_value?: number;
};

export type CancellationPolicyUpdate = Partial<CancellationPolicyCreate> & { is_active?: boolean };

export const listCancellationPolicies = () =>
  api.get<CancellationPolicy[]>("/cancellation-policies").then((res) => res.data);

export const createCancellationPolicy = (payload: CancellationPolicyCreate) =>
  api.post<CancellationPolicy>("/cancellation-policies", payload).then((res) => res.data);

export const updateCancellationPolicy = (id: string, payload: CancellationPolicyUpdate) =>
  api.patch<CancellationPolicy>(`/cancellation-policies/${id}`, payload).then((res) => res.data);
