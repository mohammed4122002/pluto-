import { api } from "./client";

export type SearchPatientResult = { id: string; full_name: string; phone: string | null };
export type SearchAppointmentResult = { id: string; scheduled_at: string; status: string; patient_name: string };
export type SearchStaffResult = { id: string; full_name: string; role: string };

export type SearchResults = {
  patients: SearchPatientResult[];
  appointments: SearchAppointmentResult[];
  staff: SearchStaffResult[];
};

export const search = (q: string) => api.get<SearchResults>("/search", { params: { q } }).then((res) => res.data);
