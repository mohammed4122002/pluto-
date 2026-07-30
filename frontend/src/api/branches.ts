import { api } from "./client";

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  working_hours_note: string | null;
  is_active: boolean;
};

export type BranchCreate = {
  name: string;
  address?: string;
  phone?: string;
  timezone?: string;
  working_hours_note?: string;
};

export type BranchUpdate = Partial<BranchCreate> & { is_active?: boolean };

export const listBranches = () => api.get<Branch[]>("/branches").then((res) => res.data);

export const createBranch = (payload: BranchCreate) =>
  api.post<Branch>("/branches", payload).then((res) => res.data);

export const updateBranch = (id: string, payload: BranchUpdate) =>
  api.patch<Branch>(`/branches/${id}`, payload).then((res) => res.data);
