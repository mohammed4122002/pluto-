import { api } from "./client";

export type ConversationMode = "ai" | "human";

export type ConversationSummary = {
  id: string;
  channel_id: string;
  channel_type: string;
  branch_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  status: string;
  mode: ConversationMode;
  needs_attention: boolean;
  assigned_staff_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: "patient" | "ai" | "staff";
  content: string;
  created_at: string;
};

export type ConversationDetail = ConversationSummary & { messages: Message[] };

export type ConversationUpdate = {
  mode?: ConversationMode;
  needs_attention?: boolean;
  assigned_staff_id?: string | null;
  status?: string;
};

export const listConversations = (needsAttention?: boolean, assignedStaffId?: string) =>
  api
    .get<ConversationSummary[]>("/conversations", {
      params: {
        ...(needsAttention !== undefined ? { needs_attention: needsAttention } : {}),
        ...(assignedStaffId ? { assigned_staff_id: assignedStaffId } : {}),
      },
    })
    .then((res) => res.data);

export const getAttentionCount = () =>
  api.get<{ count: number }>("/conversations/attention-count").then((res) => res.data.count);

export const getConversation = (id: string) =>
  api.get<ConversationDetail>(`/conversations/${id}`).then((res) => res.data);

export const updateConversation = (id: string, payload: ConversationUpdate) =>
  api.patch<ConversationSummary>(`/conversations/${id}`, payload).then((res) => res.data);

export const sendStaffReply = (id: string, message: string) =>
  api.post<Message>(`/conversations/${id}/reply`, { message }).then((res) => res.data);
