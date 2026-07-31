import { api } from "./client";

export type StaffRole = "admin" | "doctor" | "receptionist";

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
};

export type StaffCreate = {
  full_name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  specialty?: string;
  branch_ids: string[];
  specialty_ids: string[];
};

export type StaffUpdate = Partial<Omit<StaffCreate, "branch_ids" | "specialty_ids" | "email">> & {
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
