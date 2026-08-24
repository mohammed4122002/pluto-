import { api } from "./client";

export type DoctorSubstitute = {
  id: string;
  staff_id: string;
  substitute_staff_id: string;
  branch_id: string | null;
  start_at: string;
  end_at: string;
};

export type DoctorSubstituteCreate = {
  staff_id: string;
  substitute_staff_id: string;
  branch_id: string | null;
  start_at: string;
  end_at: string;
};

export type DoctorLimits = {
  staff_id: string;
  max_patients_per_day: number | null;
  max_consecutive_minutes: number | null;
  buffer_before_minutes: number | null;
  buffer_after_minutes: number | null;
  break_start_time: string | null;
  break_end_time: string | null;
};

export type DoctorLimitsUpdate = Omit<DoctorLimits, "staff_id">;

export const listSubstitutes = (staffId: string) =>
  api
    .get<DoctorSubstitute[]>("/doctor-substitutes", { params: { staff_id: staffId } })
    .then((res) => res.data);

export const createSubstitute = (payload: DoctorSubstituteCreate) =>
  api.post<DoctorSubstitute>("/doctor-substitutes", payload).then((res) => res.data);

export const deleteSubstitute = (id: string) =>
  api.delete(`/doctor-substitutes/${id}`).then((res) => res.data);

export const getDoctorLimits = (staffId: string) =>
  api.get<DoctorLimits>(`/doctor-limits/${staffId}`).then((res) => res.data);

export const setDoctorLimits = (staffId: string, payload: DoctorLimitsUpdate) =>
  api.put<DoctorLimits>(`/doctor-limits/${staffId}`, payload).then((res) => res.data);
