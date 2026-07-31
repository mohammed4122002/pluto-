import { api } from "./client";

export type StaffRole = "admin" | "doctor" | "receptionist";

export type StaffScheduleBlock = {
  days: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

export type Staff = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  specialty: string | null;
  is_active: boolean;
  branch_ids: string[];
  specialty_ids: string[];
  service_ids: string[];
};

export type StaffCreate = {
  full_name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  specialty?: string;
  branch_ids: string[];
  specialty_ids: string[];
  service_ids: string[];
  schedule?: StaffScheduleBlock;
};

export type StaffUpdate = Partial<Omit<StaffCreate, "branch_ids" | "specialty_ids" | "service_ids" | "schedule" | "email">> & {
  is_active?: boolean;
};

export const listStaff = () => api.get<Staff[]>("/staff").then((res) => res.data);

export const createStaff = (payload: StaffCreate) =>
  api.post<Staff>("/staff", payload).then((res) => res.data);

export const updateStaff = (id: string, payload: StaffUpdate) =>
  api.patch<Staff>(`/staff/${id}`, payload).then((res) => res.data);

export const addStaffSpecialty = (staffId: string, specialtyId: string) =>
  api.post<Staff>(`/staff/${staffId}/specialties`, null, { params: { specialty_id: specialtyId } }).then((res) => res.data);

export const removeStaffSpecialty = (staffId: string, specialtyId: string) =>
  api.delete(`/staff/${staffId}/specialties/${specialtyId}`).then((res) => res.data);

export const addStaffService = (staffId: string, serviceId: string) =>
  api.post<Staff>(`/staff/${staffId}/services`, null, { params: { service_id: serviceId } }).then((res) => res.data);

export const removeStaffService = (staffId: string, serviceId: string) =>
  api.delete(`/staff/${staffId}/services/${serviceId}`).then((res) => res.data);

export const addStaffBranch = (staffId: string, branchId: string) =>
  api.post<Staff>(`/staff/${staffId}/branches`, null, { params: { branch_id: branchId } }).then((res) => res.data);

export const removeStaffBranch = (staffId: string, branchId: string) =>
  api.delete(`/staff/${staffId}/branches/${branchId}`).then((res) => res.data);

export const deleteStaff = (staffId: string) => api.delete(`/staff/${staffId}`).then((res) => res.data);
