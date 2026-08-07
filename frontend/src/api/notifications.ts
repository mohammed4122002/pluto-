import { api } from "./client";

export type NotificationTemplate = {
  id: string;
  code: string;
  channel_type: string;
  language: string;
  subject: string | null;
  body_template: string;
  is_active: boolean;
};

export type NotificationSchedule = {
  id: string;
  template_id: string;
  trigger_type: "before_appointment" | "after_appointment" | "on_status_change";
  // Sign carries meaning: before_appointment is always negative (minutes
  // before the appointment), after_appointment always positive.
  offset_minutes: number | null;
  status_trigger: string | null;
  is_active: boolean;
  template: NotificationTemplate;
};

export const listNotificationSchedules = () =>
  api.get<NotificationSchedule[]>("/notifications/schedules").then((res) => res.data);

export const updateNotificationTemplate = (id: string, updates: { body_template?: string; is_active?: boolean }) =>
  api.patch<NotificationTemplate>(`/notifications/templates/${id}`, updates).then((res) => res.data);

export const updateNotificationSchedule = (id: string, updates: { offset_minutes?: number; is_active?: boolean }) =>
  api.patch<NotificationSchedule>(`/notifications/schedules/${id}`, updates).then((res) => res.data);
