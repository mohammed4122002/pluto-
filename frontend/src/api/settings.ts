import { api } from "./client";

export type ClinicSettings = {
  id: string;
  clinic_name: string;
  about_text: string;
  updated_at: string;
};

export type ClinicSettingsUpdate = {
  clinic_name?: string;
  about_text?: string;
};

export const getClinicSettings = () =>
  api.get<ClinicSettings>("/settings/clinic").then((res) => res.data);

export const updateClinicSettings = (payload: ClinicSettingsUpdate) =>
  api.patch<ClinicSettings>("/settings/clinic", payload).then((res) => res.data);
