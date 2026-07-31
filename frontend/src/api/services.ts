import { api } from "./client";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  specialty_id: string | null;
  is_active: boolean;
  doctor_ids: string[];
};

export type ServiceCreate = {
  name: string;
  description?: string;
  duration_minutes?: number;
  price?: number;
  specialty_id?: string;
  doctor_ids?: string[];
};

export type ServiceUpdate = Partial<Omit<ServiceCreate, "doctor_ids">> & { is_active?: boolean };

export const listServices = () => api.get<Service[]>("/services").then((res) => res.data);

export const createService = (payload: ServiceCreate) =>
  api.post<Service>("/services", payload).then((res) => res.data);

export const updateService = (id: string, payload: ServiceUpdate) =>
  api.patch<Service>(`/services/${id}`, payload).then((res) => res.data);

export const addServiceDoctor = (serviceId: string, staffId: string) =>
  api.post<Service>(`/services/${serviceId}/doctors`, null, { params: { staff_id: staffId } }).then((res) => res.data);

export const removeServiceDoctor = (serviceId: string, staffId: string) =>
  api.delete(`/services/${serviceId}/doctors/${staffId}`).then((res) => res.data);
