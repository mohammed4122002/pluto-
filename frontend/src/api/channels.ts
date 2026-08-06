import { api } from "./client";

export type ChannelType = "whatsapp" | "telegram" | "instagram" | "messenger" | "twilio" | "web";

export type Channel = {
  id: string;
  branch_id: string;
  channel_type: ChannelType;
  display_name: string;
  identifier: string;
  is_active: boolean;
  token_expires_at: string | null;
  masked_credentials: Record<string, string>;
  created_at: string;
};

export type ChannelCreate = {
  branch_id: string;
  channel_type: ChannelType;
  display_name: string;
  credentials: Record<string, string>;
};

export type ChannelUpdate = {
  display_name?: string;
  branch_id?: string;
  is_active?: boolean;
};

export type VerifyCredentialsResult = { valid: boolean; details: Record<string, string>; error: string | null };

export type ChannelHealthStatus = "healthy" | "degraded" | "failed" | "not_connected";

export type ChannelHealthCheck = {
  id: string;
  channel_id: string;
  checked_at: string;
  status: ChannelHealthStatus;
  token_valid: boolean | null;
  webhook_registered: boolean | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export type ChannelSettings = {
  channel_id: string;
  ai_enabled: boolean;
  ai_mode: "full_booking" | "inquiry_only" | "greeting_only";
  greeting_message: string | null;
  outside_hours_message: string | null;
  working_hours: Record<string, unknown>;
  auto_reply_outside_hours: boolean;
  escalation_keywords: string[];
  max_ai_turns_before_human: number;
  language: string;
  dialect: string | null;
  tone: "friendly" | "formal" | null;
  handoff_message: string | null;
  updated_at: string;
};

export type ChannelSettingsUpdate = Partial<Omit<ChannelSettings, "channel_id" | "updated_at">>;

export type RoutingRule = {
  id: string;
  channel_id: string;
  keyword: string;
  action: "assign_branch" | "escalate" | "auto_reply";
  target_branch_id: string | null;
  auto_reply_text: string | null;
  priority: number;
  is_active: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: "patient" | "ai" | "staff";
  content: string;
  created_at: string;
};

export const listChannels = (branchId?: string) =>
  api.get<Channel[]>("/channels", { params: branchId ? { branch_id: branchId } : {} }).then((res) => res.data);

export const getChannel = (id: string) => api.get<Channel>(`/channels/${id}`).then((res) => res.data);

export const listProviderTypes = () => api.get<ChannelType[]>("/channels/provider-types").then((res) => res.data);

export const verifyChannelCredentials = (channelType: ChannelType, credentials: Record<string, string>) =>
  api
    .post<VerifyCredentialsResult>("/channels/verify-credentials", { channel_type: channelType, credentials })
    .then((res) => res.data);

export const createChannel = (payload: ChannelCreate) =>
  api.post<Channel>("/channels", payload).then((res) => res.data);

export const updateChannel = (id: string, payload: ChannelUpdate) =>
  api.patch<Channel>(`/channels/${id}`, payload).then((res) => res.data);

export const deleteChannel = (id: string) => api.delete(`/channels/${id}`).then((res) => res.data);

export const rotateChannelCredentials = (id: string, credentials: Record<string, string>) =>
  api.post<Channel>(`/channels/${id}/rotate-credentials`, { credentials }).then((res) => res.data);

export const getChannelHealth = (id: string) => api.get<ChannelHealthCheck>(`/channels/${id}/health`).then((res) => res.data);

export const checkChannelHealthNow = (id: string) =>
  api.post<ChannelHealthCheck>(`/channels/${id}/health/check`).then((res) => res.data);

export const recentChannelMessages = (id: string) =>
  api.get<Message[]>(`/channels/${id}/messages/recent`).then((res) => res.data);

export type TestMessageResult = { sent: boolean; error: string | null };

export const sendTestMessage = (id: string, recipient: string, message?: string) =>
  api
    .post<TestMessageResult>(`/channels/${id}/test-message`, { recipient, ...(message ? { message } : {}) })
    .then((res) => res.data);

export const getChannelSettings = (id: string) => api.get<ChannelSettings>(`/channels/${id}/settings`).then((res) => res.data);

export const updateChannelSettings = (id: string, payload: ChannelSettingsUpdate) =>
  api.patch<ChannelSettings>(`/channels/${id}/settings`, payload).then((res) => res.data);

export const listRoutingRules = (channelId: string) =>
  api.get<RoutingRule[]>(`/channels/${channelId}/routing-rules`).then((res) => res.data);

export const createRoutingRule = (
  channelId: string,
  payload: { keyword: string; action: RoutingRule["action"]; target_branch_id?: string; auto_reply_text?: string; priority?: number },
) => api.post<RoutingRule>(`/channels/${channelId}/routing-rules`, payload).then((res) => res.data);

export const deleteRoutingRule = (channelId: string, ruleId: string) =>
  api.delete(`/channels/${channelId}/routing-rules/${ruleId}`).then((res) => res.data);
