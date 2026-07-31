import { api } from "./client";

export type DoctorAvailability = {
  id: string;
  staff_id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

export type DoctorAvailabilityCreate = {
  staff_id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

export const listDoctorAvailability = (staffId: string) =>
  api.get<DoctorAvailability[]>("/doctor-availability", { params: { staff_id: staffId } }).then((res) => res.data);

export const createDoctorAvailability = (payload: DoctorAvailabilityCreate) =>
  api.post<DoctorAvailability>("/doctor-availability", payload).then((res) => res.data);

export const deleteDoctorAvailability = (id: string) =>
  api.delete(`/doctor-availability/${id}`).then((res) => res.data);
