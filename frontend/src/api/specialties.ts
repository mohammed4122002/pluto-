import { api } from "./client";

export type Specialty = {
  id: string;
  department_id: string | null;
  name_ar: string;
  name_en: string;
  is_active: boolean;
};

export type SpecialtyCreate = {
  department_id?: string;
  name_ar: string;
  name_en: string;
};

export const listSpecialties = () => api.get<Specialty[]>("/specialties").then((res) => res.data);

export const createSpecialty = (payload: SpecialtyCreate) =>
  api.post<Specialty>("/specialties", payload).then((res) => res.data);
