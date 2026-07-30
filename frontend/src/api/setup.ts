import { api } from "./client";

export type SetupStatus = { initialized: boolean };

export type SetupRequest = {
  clinic_name: string;
  branch: { name: string; address?: string; working_hours_note?: string };
  admin: { full_name: string; email: string; phone?: string; password: string };
};

export const getSetupStatus = () => api.get<SetupStatus>("/setup/status").then((res) => res.data);

export const completeSetup = (payload: SetupRequest) =>
  api.post("/setup/complete", payload).then((res) => res.data);
