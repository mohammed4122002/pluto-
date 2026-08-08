import { api } from "./client";

// The one clinic-wide bot, admin-configured.
export type StaffBotSettings = { configured: boolean; username: string | null };

export const getStaffBotSettings = () => api.get<StaffBotSettings>("/settings/staff-bot").then((res) => res.data);

export const setStaffBotToken = (token: string) =>
  api.post<StaffBotSettings>("/settings/staff-bot/token", { token }).then((res) => res.data);

export const removeStaffBotToken = () =>
  api.delete<StaffBotSettings>("/settings/staff-bot/token").then((res) => res.data);

// A single staff member's own link against the shared bot -- self-service,
// no admin step needed once the bot above is configured.
export type TelegramLinkStatus = { linked: boolean; bot_username: string | null };
export type TelegramLinkCode = { code: string; bot_username: string | null; expires_at: string };

export const getMyTelegramLink = () => api.get<TelegramLinkStatus>("/staff/me/telegram-link").then((res) => res.data);

export const generateMyTelegramLinkCode = () =>
  api.post<TelegramLinkCode>("/staff/me/telegram-link-code").then((res) => res.data);
