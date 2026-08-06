import { api } from "./client";

export type StaffBotSettings = {
  configured: boolean;
  username: string | null;
};

export const getStaffBotSettings = () =>
  api.get<StaffBotSettings>("/settings/staff-bot").then((res) => res.data);

export const setStaffBotToken = (token: string) =>
  api.post<StaffBotSettings>("/settings/staff-bot/token", { token }).then((res) => res.data);

export const removeStaffBotToken = () =>
  api.delete<StaffBotSettings>("/settings/staff-bot/token").then((res) => res.data);
