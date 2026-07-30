import { api } from "./client";

export type StaffMe = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  mfa_enabled: boolean;
  permissions: string[];
};

export type LoginResult = {
  access_token?: string;
  mfa_required: boolean;
  mfa_token?: string;
  staff?: StaffMe;
};

export const login = (email: string, password: string) =>
  api.post<LoginResult>("/auth/login", { email, password }).then((res) => res.data);

export const verifyMfa = (mfaToken: string, code: string) =>
  api.post<LoginResult>("/auth/mfa/verify", { mfa_token: mfaToken, code }).then((res) => res.data);

export const getMe = () => api.get<StaffMe>("/auth/me").then((res) => res.data);

export const setupMfa = () => api.post<{ secret: string; otpauth_url: string }>("/auth/mfa/setup").then((res) => res.data);

export const confirmMfa = (code: string) => api.post<{ mfa_enabled: boolean }>("/auth/mfa/confirm", { code }).then((res) => res.data);

export const disableMfa = () => api.post<{ mfa_enabled: boolean }>("/auth/mfa/disable").then((res) => res.data);

export const changePassword = (oldPassword: string, newPassword: string) =>
  api
    .post<{ changed: boolean }>("/auth/change-password", { old_password: oldPassword, new_password: newPassword })
    .then((res) => res.data);
