import { api } from "./client";

export type MyTelegramBotStatus = {
  configured: boolean;
  username: string | null;
  linked: boolean;
};

export const getMyTelegramBot = () =>
  api.get<MyTelegramBotStatus>("/staff/me/telegram-bot").then((res) => res.data);

export const setMyTelegramBotToken = (token: string) =>
  api.post<MyTelegramBotStatus>("/staff/me/telegram-bot/token", { token }).then((res) => res.data);

export const removeMyTelegramBotToken = () =>
  api.delete<MyTelegramBotStatus>("/staff/me/telegram-bot/token").then((res) => res.data);
