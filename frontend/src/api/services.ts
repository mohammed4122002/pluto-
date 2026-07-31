import { api } from "./client";

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  specialty_id: string | null;
  is_active: boolean;
};

export type ServiceCreate = {
  name: string;
  description?: string;
  duration_minutes?: number;
  price?: number;
  specialty_id?: string;
};

export type ServiceUpdate = Partial<ServiceCreate> & { is_active?: boolean };

export const listServices = () => api.get<Service[]>("/services").then((res) => res.data);

export const createService = (payload: ServiceCreate) =>
  api.post<Service>("/services", payload).then((res) => res.data);

export const updateService = (id: string, payload: ServiceUpdate) =>
  api.patch<Service>(`/services/${id}`, payload).then((res) => res.data);
